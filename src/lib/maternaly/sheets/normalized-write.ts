import crypto from "node:crypto";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import {
  getNormalizedWorkbookServiceId,
  type NormalizedServiceSheetSnapshot,
  type NormalizedSheetsClient,
} from "@/lib/maternaly/sheets/normalized-client";
import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";
import {
  MATERNALY_NORMALIZED_SERVICES,
  NORMALIZED_COLUMN_ALIASES,
  getCell,
  hasColumn,
  normalizeSheetText,
  normalizePhoneForMatch,
  rowsToObjects,
  type MaternalyNormalizedServiceKey,
  type NormalizedColumnKey,
} from "@/lib/maternaly/sheets/normalized-template";

export interface NormalizedRegistrationDraft {
  serviceKey: MaternalyNormalizedServiceKey;
  fullName?: string;
  phone?: string;
  email?: string;
  peopleCount: number;
  pregnancyWeek?: number;
  babyBirthDate?: string;
  fppOrDueDate?: string;
  partnerName?: string;
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
  formattedRanges: string[];
  formatApplied: boolean;
  formatWarnings: string[];
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

function buildSyntheticIds(idempotencyKey: string) {
  const suffix = idempotencyKey.slice(0, 16).toUpperCase();
  return {
    clientId: `CLI_BOT_${suffix}`,
    registrationId: `INS_BOT_${suffix}`,
    interactionId: `INT_BOT_${suffix}`,
  };
}

function splitFullName(fullName: string | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: fullName?.trim() ?? "", lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function priceForService(serviceKey: MaternalyNormalizedServiceKey, peopleCount: number): string {
  if (serviceKey === "charla_embarazo_1_20") {
    return "0 €";
  }

  return peopleCount > 1 ? "75 €/pareja" : "45 €/persona";
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
  input: { idempotencyKey: string; registrationId: string },
): boolean {
  return snapshot.tabs.Inscripciones.rows.some((row) => {
    const notes = getCell(row, "notes");
    return (
      getCell(row, "idempotencyKey") === input.idempotencyKey ||
      getCell(row, "registrationId") === input.registrationId ||
      notes.includes(input.idempotencyKey) ||
      notes.includes(input.registrationId)
    );
  });
}

async function hasExistingRegistrationInSheet(input: {
  client: NormalizedSheetsClient;
  sheetId: string;
  idempotencyKey: string;
}): Promise<boolean> {
  const parsed = rowsToObjects(
    await input.client.readTabRows(input.sheetId, "Inscripciones"),
    { tab: "Inscripciones" },
  );
  if (parsed.parseError) {
    throw new Error(`idempotency_recheck_failed:${parsed.parseError}`);
  }

  const registrationId = buildSyntheticIds(input.idempotencyKey).registrationId;
  return parsed.rows.some((row) => {
    const notes = getCell(row, "notes");
    return (
      getCell(row, "idempotencyKey") === input.idempotencyKey ||
      getCell(row, "registrationId") === registrationId ||
      notes.includes(input.idempotencyKey) ||
      notes.includes(registrationId)
    );
  });
}

// This queue serializes one Node.js process. The Sheets recheck makes retries in
// that process idempotent, but it is not a distributed lock across replicas.
const registrationWriteQueues = new Map<string, Promise<void>>();

async function withRegistrationWriteLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = registrationWriteQueues.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  registrationWriteQueues.set(key, current);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (registrationWriteQueues.get(key) === current) {
      registrationWriteQueues.delete(key);
    }
  }
}

interface ColumnRequirement {
  label: string;
  alternatives: NormalizedColumnKey[];
}

const WRITE_COLUMN_REQUIREMENTS: Record<
  NormalizedRegistrationWriteOperation["tab"],
  ColumnRequirement[]
> = {
  Clientes_Local: [
    { label: "clientId", alternatives: ["clientId", "idempotencyKey"] },
    { label: "fullName", alternatives: ["fullName", "firstName"] },
    { label: "phone", alternatives: ["phone"] },
    { label: "email", alternatives: ["email"] },
  ],
  Inscripciones: [
    { label: "registrationId", alternatives: ["registrationId", "idempotencyKey"] },
    { label: "clientId", alternatives: ["clientId", "idempotencyKey"] },
    { label: "groupId", alternatives: ["groupId"] },
    { label: "serviceId", alternatives: ["serviceId"] },
    { label: "phone", alternatives: ["phone"] },
    { label: "status", alternatives: ["status"] },
    { label: "source", alternatives: ["source"] },
    { label: "notes", alternatives: ["notes"] },
  ],
  Interacciones_Chatbot: [
    { label: "interactionId", alternatives: ["interactionId", "idempotencyKey"] },
    { label: "createdAt", alternatives: ["createdAt"] },
    { label: "source", alternatives: ["source", "mode"] },
    { label: "event", alternatives: ["event"] },
    { label: "resultOrNotes", alternatives: ["result", "notes", "blockedReasons"] },
  ],
};

function hasAnyColumn(headers: string[], alternatives: NormalizedColumnKey[]): boolean {
  return alternatives.some((key) => hasColumn(headers, key));
}

function acceptedAliases(alternatives: NormalizedColumnKey[]): string {
  return alternatives
    .map((key) => `${key}(${NORMALIZED_COLUMN_ALIASES[key].join(",")})`)
    .join(";");
}

function formatMissingColumns(
  tab: NormalizedRegistrationWriteOperation["tab"],
  missing: ColumnRequirement[],
  headers: string[],
): string {
  const headerList = headers.map(normalizeSheetText).filter(Boolean).join(",");
  return [
    `missing_required_columns:${tab}:${missing.map((requirement) => requirement.label).join("|")}`,
    `accepted=${missing.map((requirement) => acceptedAliases(requirement.alternatives)).join("+")}`,
    `headers=${headerList}`,
  ].join(":");
}

function requiredColumnsPresent(snapshot: NormalizedServiceSheetSnapshot): string[] {
  const errors: string[] = [];

  for (const [tab, requirements] of Object.entries(WRITE_COLUMN_REQUIREMENTS) as Array<
    [NormalizedRegistrationWriteOperation["tab"], ColumnRequirement[]]
  >) {
    const headers = snapshot.tabs[tab].headers;
    const missing = requirements.filter((requirement) => !hasAnyColumn(headers, requirement.alternatives));
    if (missing.length > 0) {
      errors.push(formatMissingColumns(tab, missing, headers));
    }
  }

  return errors;
}

function isNormalizedColumnKey(key: string): key is NormalizedColumnKey {
  return key in NORMALIZED_COLUMN_ALIASES;
}

function valuesForHeaders(
  headers: string[],
  values: Record<string, string | number | undefined>,
): Array<string | number | undefined> {
  const exactValues = new Map<string, string | number | undefined>();
  const aliasedValues = new Map<string, string | number | undefined>();

  for (const [key, value] of Object.entries(values)) {
    exactValues.set(normalizeSheetText(key), value);
    if (isNormalizedColumnKey(key)) {
      for (const alias of NORMALIZED_COLUMN_ALIASES[key]) {
        aliasedValues.set(normalizeSheetText(alias), value);
      }
    }
  }

  return headers.map((header) => {
    const normalizedHeader = normalizeSheetText(header);
    return exactValues.get(normalizedHeader) ?? aliasedValues.get(normalizedHeader) ?? "";
  });
}

function baseValues(input: {
  draft: NormalizedRegistrationDraft;
  session: NormalizedAvailableSession;
  workbookServiceId: string;
  idempotencyKey: string;
  clientId: string;
  registrationId: string;
  interactionId: string;
  createdAt: string;
}) {
  const service = MATERNALY_NORMALIZED_SERVICES[input.draft.serviceKey];
  const { firstName, lastName } = splitFullName(input.draft.fullName);
  const notes = [
    input.draft.notes,
    `trace:${input.idempotencyKey}`,
    `session:${input.session.sessionId}`,
    `personas:${input.draft.peopleCount}`,
  ].filter(Boolean).join(" | ");
  const source = "whatsapp";
  const price = priceForService(input.draft.serviceKey, input.draft.peopleCount);
  const paymentStatus = input.draft.serviceKey === "charla_embarazo_1_20"
    ? "no_aplica"
    : "pendiente";

  return {
    serviceId: input.workbookServiceId,
    serviceName: service.label,
    groupId: input.session.groupId,
    sessionId: input.session.sessionId,
    date: input.session.date,
    startTime: input.session.startTime,
    clientId: input.clientId,
    registrationId: input.registrationId,
    interactionId: input.interactionId,
    idempotencyKey: input.idempotencyKey,
    fullName: input.draft.fullName,
    firstName,
    lastName,
    phone: input.draft.phone,
    email: input.draft.email,
    peopleCount: input.draft.peopleCount,
    pregnancyWeek: input.draft.pregnancyWeek,
    babyBirthDate: input.draft.babyBirthDate,
    fppOrDueDate: input.draft.fppOrDueDate,
    partnerName: input.draft.partnerName,
    source,
    status: "preinscrita",
    paymentStatus,
    price,
    notes,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    event: "maternaly_normalized_registration_write_plan",
    result: "prepared",
    requiresHuman: "no",
    conversationId: input.idempotencyKey,

    service_id: input.workbookServiceId,
    servicio_id: input.workbookServiceId,
    servicio: service.label,
    group_id: input.session.groupId,
    session_id: input.session.sessionId,
    fecha: input.session.date,
    hora_inicio: input.session.startTime,
    cliente_id: input.clientId,
    inscripcion_id: input.registrationId,
    interaccion_id: input.interactionId,
    nombre: firstName,
    apellidos: lastName,
    nombre_completo: input.draft.fullName,
    telefono: input.draft.phone,
    telefono_normalizado: input.draft.phone,
    people_count: input.draft.peopleCount,
    semana_embarazo: input.draft.pregnancyWeek,
    fecha_nacimiento_bebe: input.draft.babyBirthDate,
    fpp: input.draft.fppOrDueDate,
    pareja_nombre: input.draft.partnerName,
    canal_origen: source,
    canal: source,
    estado: "Preinscrita",
    estado_cliente: "lead",
    estado_inscripcion: "preinscrita",
    estado_pago: paymentStatus,
    precio_acordado: price,
    observaciones: notes,
    notas_privadas: notes,
    idempotency_key: input.idempotencyKey,
    created_at: input.createdAt,
    fecha_alta: input.createdAt,
    fecha_inscripcion: input.createdAt,
    fecha_hora: input.createdAt,
    ultima_actualizacion: input.createdAt,
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
  const generatedIds = buildSyntheticIds(idempotencyKey);
  const existingClient = findClient(input.snapshot, input.draft.phone);
  const clientId = existingClient ? getCell(existingClient, "clientId") || generatedIds.clientId : generatedIds.clientId;
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
    hasExistingRegistration(input.snapshot, {
      idempotencyKey,
      registrationId: generatedIds.registrationId,
    })
      ? "duplicate_idempotency_key"
      : "",
    !allowlisted ? "sheet_not_allowlisted" : "",
    ...requiredColumnsPresent(input.snapshot),
  ].filter(Boolean);

  const base = baseValues({
    draft: input.draft,
    session: input.session,
    workbookServiceId: getNormalizedWorkbookServiceId(input.snapshot),
    idempotencyKey,
    clientId,
    registrationId: generatedIds.registrationId,
    interactionId: generatedIds.interactionId,
    createdAt: new Date().toISOString(),
  });
  const clientExists = Boolean(existingClient);
  const blocked = blockedReasons.length > 0;
  const result = blocked ? "blocked" : "prepared";
  const blockedReasonText = blockedReasons.join("|");

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
        values: {
          ...base,
          status: "lead",
          estado: "lead",
          estado_cliente: "lead",
          event: "maternaly_client_upsert",
          accion_realizada: "maternaly_client_upsert",
          result,
          resultado: result,
        },
      },
      {
        tab: "Inscripciones",
        operation: blocked ? "noop" : "append",
        values: {
          ...base,
          status: "preinscrita",
          estado: "Preinscrita",
          estado_inscripcion: "preinscrita",
          event: "maternaly_registration_write_plan",
          accion_realizada: "maternaly_registration_write_plan",
          result,
          resultado: result,
        },
      },
      {
        tab: "Interacciones_Chatbot",
        operation: "append",
        values: {
          ...base,
          status: result,
          estado: result,
          event: blocked ? "maternaly_normalized_registration_blocked" : "maternaly_normalized_registration_write_plan",
          evento: blocked ? "maternaly_normalized_registration_blocked" : "maternaly_normalized_registration_write_plan",
          accion_realizada: blocked ? "maternaly_normalized_registration_blocked" : "maternaly_normalized_registration_write_plan",
          result,
          resultado: result,
          requiresHuman: blocked ? "si" : "no",
          requiere_humano: blocked ? "si" : "no",
          observaciones: [base.observaciones, blockedReasonText ? `blocked:${blockedReasonText}` : ""]
            .filter(Boolean)
            .join(" | "),
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
      formattedRanges: [],
      formatApplied: false,
      formatWarnings: [],
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
      formattedRanges: [],
      formatApplied: false,
      formatWarnings: [],
    };
  }

  const lockKey = `${input.plan.sheetId}:${input.plan.idempotencyKey}`;
  return withRegistrationWriteLock<NormalizedRegistrationWriteResult>(lockKey, async () => {
    if (
      await hasExistingRegistrationInSheet({
        client: input.client,
        sheetId: input.plan.sheetId,
        idempotencyKey: input.plan.idempotencyKey,
      })
    ) {
      return {
        ok: true,
        applied: false,
        mode: "live",
        blockedReason: "duplicate_idempotency_key",
        plan: input.plan,
        updatedRanges: [],
        formattedRanges: [],
        formatApplied: false,
        formatWarnings: [],
      };
    }

    const updatedRanges: string[] = [];
    const formattedRanges: string[] = [];
    const formatWarnings: string[] = [];
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
      if (result.formattedRange) {
        formattedRanges.push(result.formattedRange);
      }
      if (result.formatWarning) {
        formatWarnings.push(`${operation.tab}:${result.formatWarning}`);
      }
    }

    return {
      ok: true,
      applied: updatedRanges.length > 0,
      mode: "live",
      plan: input.plan,
      updatedRanges,
      formattedRanges,
      formatApplied: updatedRanges.length > 0 && formattedRanges.length === updatedRanges.length,
      formatWarnings,
    };
  });
}
