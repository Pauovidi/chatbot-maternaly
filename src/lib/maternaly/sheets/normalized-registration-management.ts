import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import { registrationIsOpen } from "@/lib/maternaly/sheets/normalized-availability";
import {
  GoogleNormalizedSheetsClient,
  type NormalizedSheetsClient,
} from "@/lib/maternaly/sheets/normalized-client";
import {
  MATERNALY_NORMALIZED_SERVICES,
  NORMALIZED_COLUMN_ALIASES,
  coerceRows,
  detectNormalizedHeaderRow,
  getCell,
  normalizePhoneForMatch,
  normalizeSheetText,
  type MaternalyNormalizedServiceKey,
  type NormalizedColumnKey,
  type NormalizedRow,
} from "@/lib/maternaly/sheets/normalized-template";

export interface CancelableNormalizedRegistration {
  serviceKey: MaternalyNormalizedServiceKey;
  sheetId: string;
  rowNumber: number;
  statusColumnIndex: number;
  registrationId?: string;
  idempotencyKey?: string;
  sessionId?: string;
  groupId?: string;
  status?: string;
  expectedCells?: Array<{ columnIndex: number; value: string }>;
}

function matchesRequestedSelection(
  registration: CancelableNormalizedRegistration,
  selection: { selectedSessionId?: string; selectedGroupId?: string },
): boolean {
  const sameSession = !selection.selectedSessionId ||
    registration.sessionId === selection.selectedSessionId;
  const sameGroup = !selection.selectedGroupId ||
    registration.groupId === selection.selectedGroupId;
  return sameSession && sameGroup;
}

function resolveRegistrationMatches(
  matches: CancelableNormalizedRegistration[],
  selection: { selectedSessionId?: string; selectedGroupId?: string },
): CancelableNormalizedRegistration[] {
  if (!selection.selectedSessionId && !selection.selectedGroupId) {
    return matches;
  }

  const exact = matches.filter((registration) =>
    matchesRequestedSelection(registration, selection));
  // Conversation state can become stale when the team moves a registration
  // to another session in Sheets. Fall back only when the phone has exactly
  // one open registration in the service; never guess between several rows.
  return exact.length > 0 ? exact : matches.length === 1 ? matches : [];
}

function sameStableRegistration(
  left: CancelableNormalizedRegistration,
  right: CancelableNormalizedRegistration,
): boolean {
  if (left.registrationId || right.registrationId) {
    return Boolean(left.registrationId && left.registrationId === right.registrationId);
  }
  if (left.idempotencyKey || right.idempotencyKey) {
    return Boolean(left.idempotencyKey && left.idempotencyKey === right.idempotencyKey);
  }
  return left.serviceKey === right.serviceKey &&
    left.groupId === right.groupId &&
    (!left.sessionId || !right.sessionId || left.sessionId === right.sessionId);
}

function withSelectionFallback(
  registration: CancelableNormalizedRegistration,
  selection: { selectedSessionId?: string; selectedGroupId?: string },
): CancelableNormalizedRegistration {
  const canInferSession = !registration.sessionId &&
    Boolean(selection.selectedSessionId) &&
    Boolean(selection.selectedGroupId) &&
    registration.groupId === selection.selectedGroupId;
  return canInferSession
    ? { ...registration, sessionId: selection.selectedSessionId }
    : registration;
}

export type LookupNormalizedRegistrationResult =
  | { status: "found"; registration: CancelableNormalizedRegistration }
  | { status: "not_found" }
  | { status: "ambiguous"; matches: number }
  | { status: "read_error"; error: string }
  | { status: "not_configured" };

export type CancelNormalizedRegistrationResult =
  | { status: "cancelled"; registration: CancelableNormalizedRegistration }
  | { status: "not_found" }
  | { status: "ambiguous"; matches: number }
  | { status: "read_error"; error: string }
  | { status: "write_unavailable" };

function columnIndex(headers: string[], key: NormalizedColumnKey): number {
  const aliases = new Set(NORMALIZED_COLUMN_ALIASES[key].map(normalizeSheetText));
  return headers.map(normalizeSheetText).findIndex((header) => aliases.has(header));
}

function rowObject(headers: string[], values: string[]): NormalizedRow {
  const normalizedHeaders = headers.map(normalizeSheetText);
  return Object.fromEntries(
    normalizedHeaders.map((header, index) => [header, values[index] ?? ""]),
  );
}

async function findMatchesInService(input: {
  serviceKey: MaternalyNormalizedServiceKey;
  sheetId: string;
  phone: string;
  client: NormalizedSheetsClient;
}): Promise<CancelableNormalizedRegistration[]> {
  const rawRows = coerceRows(await input.client.readTabRows(input.sheetId, "Inscripciones"));
  const { headerRowIndex, parseError } = detectNormalizedHeaderRow(rawRows, "Inscripciones");
  if (parseError || headerRowIndex < 0) {
    throw new Error(parseError ?? "registration_header_not_found");
  }

  const headers = rawRows[headerRowIndex] ?? [];
  const statusColumnIndex = columnIndex(headers, "status");
  if (statusColumnIndex < 0) {
    throw new Error("registration_status_column_not_found");
  }

  const targetPhone = normalizePhoneForMatch(input.phone);
  return rawRows
    .map((values, index) => ({ values, index }))
    .filter(({ index, values }) => index > headerRowIndex && values.some(Boolean))
    .flatMap(({ values, index }) => {
      const row = rowObject(headers, values);
      const samePhone = normalizePhoneForMatch(getCell(row, "phone")) === targetPhone;
      if (!samePhone || !registrationIsOpen(getCell(row, "status"))) {
        return [];
      }

      const sessionId = getCell(row, "sessionId");
      const groupId = getCell(row, "groupId");
      const registrationId = getCell(row, "registrationId");
      const idempotencyKey = getCell(row, "idempotencyKey");
      const status = getCell(row, "status");
      const notes = getCell(row, "notes");
      const notesSessionId = /\bsession\s*:\s*([^|\s]+)\b/i.exec(notes)?.[1];
      const expectedKeys: NormalizedColumnKey[] = ["phone", "status"];
      if (registrationId) {
        expectedKeys.push("registrationId");
      } else if (idempotencyKey) {
        expectedKeys.push("idempotencyKey");
      } else {
        if (sessionId) expectedKeys.push("sessionId");
        if (groupId) expectedKeys.push("groupId");
      }
      const expectedCells = expectedKeys.flatMap((key) => {
        const index = columnIndex(headers, key);
        const value = getCell(row, key);
        return index >= 0 ? [{ columnIndex: index, value }] : [];
      });
      return [{
        serviceKey: input.serviceKey,
        sheetId: input.sheetId,
        rowNumber: index + 1,
        statusColumnIndex,
        registrationId: registrationId || undefined,
        idempotencyKey: idempotencyKey || undefined,
        sessionId: sessionId || notesSessionId || undefined,
        groupId: groupId || undefined,
        status: status || undefined,
        expectedCells,
      }];
    });
}

export async function lookupActiveNormalizedRegistration(input: {
  phone: string;
  serviceKey?: MaternalyNormalizedServiceKey;
  selectedSessionId?: string;
  selectedGroupId?: string;
  client?: NormalizedSheetsClient;
  env?: NodeJS.ProcessEnv;
}): Promise<LookupNormalizedRegistrationResult> {
  const client: NormalizedSheetsClient = input.client ?? new GoogleNormalizedSheetsClient();
  const config = readMaternalyRuntimeConfig(input.env ?? process.env);
  if (!config.normalizedSheets.enabled) {
    return { status: "not_configured" };
  }

  const serviceKeys = input.serviceKey
    ? [input.serviceKey]
    : (Object.keys(MATERNALY_NORMALIZED_SERVICES) as MaternalyNormalizedServiceKey[]);
  const matches: CancelableNormalizedRegistration[] = [];
  const errors: string[] = [];

  for (const serviceKey of serviceKeys) {
    const sheetId = config.normalizedSheets.serviceSheetIds[serviceKey];
    if (!sheetId) {
      continue;
    }
    try {
      matches.push(...await findMatchesInService({
        serviceKey,
        sheetId,
        phone: input.phone,
        client,
      }));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "registration_read_failed");
    }
  }

  if (errors.length > 0) {
    return { status: "read_error", error: errors[0] };
  }
  const resolved = resolveRegistrationMatches(matches, input);
  if (matches.length > 0 && resolved.length === 0) {
    return { status: "ambiguous", matches: matches.length };
  }
  if (resolved.length === 0) {
    return { status: "not_found" };
  }
  if (resolved.length > 1) {
    return { status: "ambiguous", matches: resolved.length };
  }
  return { status: "found", registration: withSelectionFallback(resolved[0], input) };
}

export async function cancelNormalizedRegistration(input: {
  phone: string;
  serviceKey?: MaternalyNormalizedServiceKey;
  selectedSessionId?: string;
  selectedGroupId?: string;
  client?: NormalizedSheetsClient;
  env?: NodeJS.ProcessEnv;
}): Promise<CancelNormalizedRegistrationResult> {
  const client: NormalizedSheetsClient = input.client ?? new GoogleNormalizedSheetsClient();
  if (!client.updateCellIfRowMatches) {
    return { status: "write_unavailable" };
  }

  const config = readMaternalyRuntimeConfig(input.env ?? process.env);
  if (!config.normalizedSheets.liveReady) {
    return { status: "write_unavailable" };
  }
  const serviceKeys = input.serviceKey
    ? [input.serviceKey]
    : (Object.keys(MATERNALY_NORMALIZED_SERVICES) as MaternalyNormalizedServiceKey[]);
  const matches: CancelableNormalizedRegistration[] = [];
  const errors: string[] = [];

  for (const serviceKey of serviceKeys) {
    const sheetId = config.normalizedSheets.serviceSheetIds[serviceKey];
    if (!sheetId) {
      continue;
    }
    try {
      matches.push(...await findMatchesInService({
        serviceKey,
        sheetId,
        phone: input.phone,
        client,
      }));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "registration_read_failed");
    }
  }

  if (errors.length > 0) {
    return { status: "read_error", error: errors[0] };
  }
  const resolved = resolveRegistrationMatches(matches, input);
  if (matches.length > 0 && resolved.length === 0) {
    return { status: "ambiguous", matches: matches.length };
  }
  if (resolved.length === 0) {
    return { status: "not_found" };
  }
  if (resolved.length > 1) {
    return { status: "ambiguous", matches: resolved.length };
  }

  const initiallyResolved = withSelectionFallback(resolved[0], input);
  let registration: CancelableNormalizedRegistration;
  try {
    const latestMatches = await findMatchesInService({
      serviceKey: initiallyResolved.serviceKey,
      sheetId: initiallyResolved.sheetId,
      phone: input.phone,
      client,
    });
    const sameIdentity = latestMatches.filter((candidate) =>
      sameStableRegistration(candidate, initiallyResolved));
    const latestResolved = sameIdentity.length > 0
      ? sameIdentity
      : resolveRegistrationMatches(latestMatches, {
          selectedSessionId: initiallyResolved.sessionId ?? input.selectedSessionId,
          selectedGroupId: initiallyResolved.groupId ?? input.selectedGroupId,
        });
    if (latestResolved.length !== 1) {
      return latestResolved.length === 0
        ? { status: "not_found" }
        : { status: "ambiguous", matches: latestResolved.length };
    }
    registration = withSelectionFallback(latestResolved[0], {
      selectedSessionId: initiallyResolved.sessionId ?? input.selectedSessionId,
      selectedGroupId: initiallyResolved.groupId ?? input.selectedGroupId,
    });
  } catch (error) {
    return {
      status: "read_error",
      error: error instanceof Error ? error.message : "registration_revalidation_failed",
    };
  }

  const verifyCancelledRow = async (): Promise<boolean> => {
    const rawRows = coerceRows(await client.readTabRows(registration.sheetId, "Inscripciones"));
    const { headerRowIndex, parseError } = detectNormalizedHeaderRow(rawRows, "Inscripciones");
    if (parseError || headerRowIndex < 0) {
      throw new Error(parseError ?? "registration_header_not_found");
    }
    const headers = rawRows[headerRowIndex] ?? [];
    const persistedValues = rawRows[registration.rowNumber - 1];
    if (!persistedValues) {
      return false;
    }
    const persistedRow = rowObject(headers, persistedValues);
    const persisted: CancelableNormalizedRegistration = {
      serviceKey: registration.serviceKey,
      sheetId: registration.sheetId,
      rowNumber: registration.rowNumber,
      statusColumnIndex: registration.statusColumnIndex,
      registrationId: getCell(persistedRow, "registrationId") || undefined,
      idempotencyKey: getCell(persistedRow, "idempotencyKey") || undefined,
      sessionId: getCell(persistedRow, "sessionId") ||
        /\bsession\s*:\s*([^|\s]+)\b/i.exec(getCell(persistedRow, "notes"))?.[1] ||
        undefined,
      groupId: getCell(persistedRow, "groupId") || undefined,
      status: getCell(persistedRow, "status") || undefined,
    };
    return normalizePhoneForMatch(getCell(persistedRow, "phone")) ===
      normalizePhoneForMatch(input.phone) &&
      sameStableRegistration(persisted, registration) &&
      !registrationIsOpen(persisted.status ?? "");
  };
  try {
    const updated = await client.updateCellIfRowMatches(
      registration.sheetId,
      "Inscripciones",
      registration.rowNumber,
      registration.statusColumnIndex,
      "Cancelada",
      registration.expectedCells ?? [],
    );
    if (!updated) {
      return { status: "read_error", error: "registration_identity_changed_before_update" };
    }
  } catch (error) {
    const updateError = error instanceof Error ? error.message : "registration_update_failed";
    try {
      if (await verifyCancelledRow()) {
        return { status: "cancelled", registration };
      }
      return { status: "read_error", error: `registration_update_failed:${updateError}` };
    } catch (recheckError) {
      const recheck = recheckError instanceof Error
        ? recheckError.message
        : "registration_recheck_failed";
      return {
        status: "read_error",
        error: `registration_update_failed:${updateError};recheck_failed:${recheck}`,
      };
    }
  }
  try {
    return await verifyCancelledRow()
      ? { status: "cancelled", registration }
      : { status: "read_error", error: "registration_identity_changed_after_update" };
  } catch (error) {
    return {
      status: "read_error",
      error: error instanceof Error ? error.message : "registration_post_update_check_failed",
    };
  }
}
