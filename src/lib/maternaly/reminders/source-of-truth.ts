import {
  NORMALIZED_COLUMN_ALIASES,
  getCell,
  humanNormalize,
  normalizeSheetText,
  registrationStatusDomain,
  type NormalizedColumnKey,
  type NormalizedRow,
} from "@/lib/maternaly/sheets/normalized-template";
import {
  listAvailableSessionsFromSnapshot,
} from "@/lib/maternaly/sheets/normalized-availability";
import {
  GoogleNormalizedSheetsClient,
  readNormalizedServiceSheet,
  type NormalizedSheetsClient,
} from "@/lib/maternaly/sheets/normalized-client";
import { lookupActiveNormalizedRegistration } from "@/lib/maternaly/sheets/normalized-registration-management";
import { buildConfirmedCharlaReminderInput } from "./charla-integration";
import type {
  MaternalyReminderRecord,
  MaternalyReminderSourceOfTruth,
  MaternalyReminderSourceValidation,
} from "./types";

function sameText(left: string | undefined, right: string | undefined): boolean {
  return humanNormalize(left ?? "") === humanNormalize(right ?? "");
}

function sameOnlineAccess(
  left: MaternalyReminderRecord["onlineAccess"],
  right: MaternalyReminderRecord["onlineAccess"],
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return left.joinUrl === right.joinUrl &&
    left.meetingId.replace(/\s+/g, "") === right.meetingId.replace(/\s+/g, "") &&
    left.passcode === right.passcode;
}

function isTerminalOperationalStatus(status: string): boolean {
  const normalized = humanNormalize(status);
  return /(?:cancelad|finalizad|bloquead|anulad|suspendid)/.test(normalized);
}

function forceCell(row: NormalizedRow, key: NormalizedColumnKey, value: string): NormalizedRow {
  const aliases = new Set(NORMALIZED_COLUMN_ALIASES[key].map(normalizeSheetText));
  const next = { ...row };
  let changed = false;
  for (const column of Object.keys(next)) {
    if (aliases.has(normalizeSheetText(column))) {
      next[column] = value;
      changed = true;
    }
  }
  if (!changed) {
    next[normalizeSheetText(NORMALIZED_COLUMN_ALIASES[key][0])] = value;
  }
  return next;
}

function operationalRow(row: NormalizedRow): NormalizedRow {
  return forceCell(
    forceCell(forceCell(row, "status", "Activa"), "visibleChatbot", "si"),
    "reservableChatbot",
    "si",
  );
}

export class NormalizedSheetsMaternalyReminderSourceOfTruth
implements MaternalyReminderSourceOfTruth {
  constructor(
    private readonly client: NormalizedSheetsClient = new GoogleNormalizedSheetsClient(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async validate(
    reminder: MaternalyReminderRecord,
    now: Date,
  ): Promise<MaternalyReminderSourceValidation> {
    const lookup = await lookupActiveNormalizedRegistration({
      phone: reminder.phoneE164,
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: reminder.sessionId,
      client: this.client,
      env: this.env,
    });
    if (lookup.status === "read_error" || lookup.status === "not_configured") {
      return { status: "uncertain", reason: `registration_${lookup.status}` };
    }
    if (lookup.status === "ambiguous") {
      return { status: "uncertain", reason: "registration_ambiguous" };
    }
    if (lookup.status === "not_found") {
      return { status: "inactive", reason: "registration_not_found" };
    }
    if (registrationStatusDomain(lookup.registration.status ?? "") !== "confirmed") {
      return { status: "inactive", reason: "registration_not_confirmed" };
    }
    if (
      lookup.registration.registrationId &&
      lookup.registration.registrationId !== reminder.registrationId
    ) {
      return { status: "changed", reason: "registration_identity_changed" };
    }
    if (lookup.registration.sessionId !== reminder.sessionId) {
      return { status: "changed", reason: "registration_session_changed" };
    }

    let snapshot;
    try {
      snapshot = await readNormalizedServiceSheet(
        "charla_embarazo_1_20",
        this.client,
        this.env,
      );
    } catch {
      return { status: "uncertain", reason: "session_sheet_read_failed" };
    }
    const sourceSession = snapshot.tabs.Sesiones.rows.find(
      (candidate) => getCell(candidate, "sessionId") === reminder.sessionId,
    );
    if (!sourceSession) {
      return { status: "inactive", reason: "session_not_found" };
    }
    const sourceGroupId = getCell(sourceSession, "groupId");
    const sourceGroup = snapshot.tabs.Grupos_Ediciones.rows.find(
      (candidate) => getCell(candidate, "groupId") === sourceGroupId,
    );
    if (!sourceGroup) {
      return { status: "uncertain", reason: "session_group_not_found" };
    }
    if (
      isTerminalOperationalStatus(getCell(sourceSession, "status")) ||
      isTerminalOperationalStatus(getCell(sourceGroup, "status"))
    ) {
      return { status: "inactive", reason: "session_or_group_terminal" };
    }
    const operationalSnapshot = {
      ...snapshot,
      tabs: {
        ...snapshot.tabs,
        Grupos_Ediciones: {
          ...snapshot.tabs.Grupos_Ediciones,
          rows: [operationalRow(sourceGroup)],
        },
        Sesiones: {
          ...snapshot.tabs.Sesiones,
          rows: [operationalRow(sourceSession)],
        },
      },
    };
    const session = listAvailableSessionsFromSnapshot(operationalSnapshot, { now })
      .find((candidate) => candidate.sessionId === reminder.sessionId);
    if (!session) {
      return { status: "inactive", reason: "session_not_active_or_elapsed" };
    }

    let current;
    try {
      current = buildConfirmedCharlaReminderInput({
        registrationId: reminder.registrationId,
        session,
        phoneE164: reminder.phoneE164,
        conversationId: reminder.conversationId,
        now,
      });
    } catch {
      return { status: "uncertain", reason: "session_operational_data_invalid" };
    }
    if (
      current.sessionStartsAt !== reminder.sessionStartsAt ||
      current.modality !== reminder.modality ||
      !sameText(current.location, reminder.location) ||
      !sameText(current.address, reminder.address) ||
      !sameOnlineAccess(current.onlineAccess, reminder.onlineAccess)
    ) {
      return { status: "changed", reason: "session_operational_data_changed" };
    }
    return { status: "valid" };
  }
}
