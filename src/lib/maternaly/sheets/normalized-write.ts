import crypto from "node:crypto";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import type {
  NormalizedServiceSheetSnapshot,
  NormalizedSheetsClient,
} from "@/lib/maternaly/sheets/normalized-client";
import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";
import {
  MATERNALY_NORMALIZED_SERVICES,
  getCell,
  hasColumn,
  normalizeSheetText,
  normalizePhoneForMatch,
  type MaternalyNormalizedServiceKey,
} from "@/lib/maternaly/sheets/normalized-template";

export interface NormalizedRegistrationDraft {
  serviceKey: MaternalyNormalizedServiceKey;
  fullName?: string;
  phone?: string;
  email?: string;
  peopleCount: number;
  pregnancyWeek?: number;
  notes?: string;
}

export interface NormalizedRegistrationWriteOperation {
  tab: "Clientes_Local" | "Inscripciones" | "Interacciones_Chatbot";
  operation: "append" | "noop";
  values: Record<string, string | number | undefined>;
}

export interface NormalizedRegistrationWritePlan {
  serviceKey: MaternalyNormalizedServiceKey;
  sheetId: string;
  mode: "dry_run" | "live";
  allowedLive: boolean;
  idempotencyKey: string;
  blocked: boolean;
  blockedReasons: string[];
  operations: NormalizedRegistrationWriteOperation[];
  session: Pick<
    NormalizedAvailableSession,
    "sessionId" | "groupId" | "date" | "startTime" | "availableSeats" | "availabilityStatus"
  >;
}

export interface NormalizedRegistrationWriteResult {
  ok: boolean;
  applied: boolean;
  mode: "dry_run" | "live";
  blockedReason?: string;
  plan: NormalizedRegistrationWritePlan;
  updatedRanges: string[];
}

function buildIdempotencyKey(input: {
  serviceKey: MaternalyNormalizedServiceKey;
  phone?: string;
  sessionId: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        input.serviceKey,
        normalizePhoneForMatch(input.phone ?? ""),
        input.sessionId,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

function findClient(snapshot: NormalizedServiceSheetSnapshot, phone?: string) {
  const normalized = normalizePhoneForMatch(phone ?? "");
  if (!normalized) {
    return undefined;
  }

  return snapshot.tabs.Clientes_Local.rows.find(
    (row) => normalizePhoneForMatch(getCell(row, "phone")) === normalized,
  );
}

function hasExistingRegistration(
  snapshot: NormalizedServiceSheetSnapshot,
  idempotencyKey: string,
): boolean {
  return snapshot.tabs.Inscripciones.rows.some(
    (row) => getCell(row, "idempotencyKey") === idempotencyKey,
  );
}

function requiredColumnsPresent(snapshot: NormalizedServiceSheetSnapshot): string[] {
  const errors: string[] = [];
  const inscriptionsHeaders = snapshot.tabs.Inscripciones.headers;
  const clientsHeaders = snapshot.tabs.Clientes_Local.headers;
  const interactionHeaders = snapshot.tabs.Interacciones_Chatbot.headers;

  for (const key of ["fullName", "phone", "serviceId", "sessionId", "status", "idempotencyKey"] as const) {
    if (!hasColumn(inscriptionsHeaders, key)) {
      errors.push(`missing_inscripciones_column:${key}`);
    }
  }

  for (const key of ["fullName", "phone"] as const) {
    if (!hasColumn(clientsHeaders, key)) {
      errors.push(`missing_clientes_local_column:${key}`);
    }
  }

  if (!hasColumn(interactionHeaders, "idempotencyKey")) {
    errors.push("missing_interacciones_chatbot_column:idempotencyKey");
  }

  return errors;
}

function valuesForHeaders(
  headers: string[],
  values: Record<string, string | number | undefined>,
): Array<string | number | undefined> {
  return headers.map((header) => values[header] ?? values[normalizeSheetText(header)] ?? "");
}

function baseValues(input: {
  draft: NormalizedRegistrationDraft;
  session: NormalizedAvailableSession;
  idempotencyKey: string;
}) {
  const service = MATERNALY_NORMALIZED_SERVICES[input.draft.serviceKey];
  return {
    service_id: input.draft.serviceKey,
    servicio: service.label,
    group_id: input.session.groupId,
    session_id: input.session.sessionId,
    fecha: input.session.date,
    hora_inicio: input.session.startTime,
    estado: "Preinscrita",
    nombre_completo: input.draft.fullName,
    telefono: input.draft.phone,
    email: input.draft.email,
    people_count: input.draft.peopleCount,
    semana_embarazo: input.draft.pregnancyWeek,
    observaciones: input.draft.notes,
    source: "maternaly_chatbot",
    idempotency_key: input.idempotencyKey,
    created_at: new Date().toISOString(),
  };
}

export function buildRegistrationWritePlan(input: {
  snapshot: NormalizedServiceSheetSnapshot;
  session: NormalizedAvailableSession;
  draft: NormalizedRegistrationDraft;
  env?: NodeJS.ProcessEnv;
}): NormalizedRegistrationWritePlan {
  const env = input.env ?? process.env;
  const config = readMaternalyRuntimeConfig(env);
  const normalizedConfig = config.normalizedSheets;
  const idempotencyKey = buildIdempotencyKey({
    serviceKey: input.draft.serviceKey,
    phone: input.draft.phone,
    sessionId: input.session.sessionId,
  });
  const liveFlagsReady =
    normalizedConfig.enabled &&
    config.sheetsAccessMode === "live" &&
    config.liveSheetsWriteEnabled &&
    normalizedConfig.writeMode === "live";
  const allowlisted = normalizedConfig.sheetIds.includes(input.snapshot.sheetId);
  const blockedReasons = [
    !normalizedConfig.enabled ? "normalized_sheets_disabled" : "",
    !input.draft.fullName?.trim() ? "missing_full_name" : "",
    !input.draft.phone?.trim() ? "missing_phone" : "",
    input.session.full ? "session_full" : "",
    input.session.availableSeats !== undefined && input.session.availableSeats < input.draft.peopleCount
      ? "not_enough_available_seats"
      : "",
    input.session.availabilityStatus === "unknown_capacity" ? "unknown_capacity_requires_manual_review" : "",
    hasExistingRegistration(input.snapshot, idempotencyKey) ? "duplicate_idempotency_key" : "",
    !allowlisted ? "sheet_not_allowlisted" : "",
    ...requiredColumnsPresent(input.snapshot),
  ].filter(Boolean);

  const values = baseValues({
    draft: input.draft,
    session: input.session,
    idempotencyKey,
  });
  const clientExists = Boolean(findClient(input.snapshot, input.draft.phone));
  const blocked = blockedReasons.length > 0;

  return {
    serviceKey: input.draft.serviceKey,
    sheetId: input.snapshot.sheetId,
    mode: normalizedConfig.writeMode,
    allowedLive: liveFlagsReady && allowlisted && !blocked,
    idempotencyKey,
    blocked,
    blockedReasons,
    operations: [
      {
        tab: "Clientes_Local",
        operation: clientExists || blocked ? "noop" : "append",
        values,
      },
      {
        tab: "Inscripciones",
        operation: blocked ? "noop" : "append",
        values,
      },
      {
        tab: "Interacciones_Chatbot",
        operation: "append",
        values: {
          ...values,
          evento: blocked ? "maternaly_normalized_registration_blocked" : "maternaly_normalized_registration_write_plan",
          blocked_reasons: blockedReasons.join("|"),
          mode: normalizedConfig.writeMode,
        },
      },
    ],
    session: {
      sessionId: input.session.sessionId,
      groupId: input.session.groupId,
      date: input.session.date,
      startTime: input.session.startTime,
      availableSeats: input.session.availableSeats,
      availabilityStatus: input.session.availabilityStatus,
    },
  };
}

export async function applyRegistrationWritePlan(input: {
  snapshot: NormalizedServiceSheetSnapshot;
  client: NormalizedSheetsClient;
  plan: NormalizedRegistrationWritePlan;
}): Promise<NormalizedRegistrationWriteResult> {
  if (input.plan.mode !== "live") {
    return {
      ok: true,
      applied: false,
      mode: input.plan.mode,
      blockedReason: input.plan.blockedReasons.join(" | ") || undefined,
      plan: input.plan,
      updatedRanges: [],
    };
  }

  if (!input.plan.allowedLive) {
    return {
      ok: false,
      applied: false,
      mode: "live",
      blockedReason: input.plan.blockedReasons.join(" | ") || "live_write_not_allowed",
      plan: input.plan,
      updatedRanges: [],
    };
  }

  const updatedRanges: string[] = [];
  for (const operation of input.plan.operations) {
    if (operation.operation !== "append") {
      continue;
    }

    const headers = input.snapshot.tabs[operation.tab].headers;
    const result = await input.client.appendRow(
      input.plan.sheetId,
      operation.tab,
      valuesForHeaders(headers, operation.values),
    );
    if (result.updatedRange) {
      updatedRanges.push(result.updatedRange);
    }
  }

  return {
    ok: true,
    applied: updatedRanges.length > 0,
    mode: "live",
    plan: input.plan,
    updatedRanges,
  };
}
