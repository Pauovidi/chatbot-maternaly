import crypto from "node:crypto";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import {
  getNormalizedWorkbookServiceId,
  type NormalizedServiceSheetSnapshot,
  type NormalizedSheetsClient,
} from "@/lib/maternaly/sheets/normalized-client";
import {
  registrationIsOpen,
  type NormalizedAvailableSession,
} from "@/lib/maternaly/sheets/normalized-availability";
import {
  MATERNALY_NORMALIZED_SERVICES,
  NORMALIZED_COLUMN_ALIASES,
  getCell,
  hasColumn,
  humanNormalize,
  normalizeSheetText,
  normalizePhoneForMatch,
  registrationStatusDomain,
  rowsToObjects,
  type MaternalyNormalizedServiceKey,
  type NormalizedColumnKey,
  type NormalizedRow,
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
  alreadyPersisted: boolean;
  registrationStatus: "preinscrita" | "confirmada";
  existingRegistrationSheetStatus?: string;
  operations: NormalizedRegistrationWriteOperation[];
  session: Pick<
    NormalizedAvailableSession,
    "sessionId" | "groupId" | "date" | "startTime" | "capacityTotal" | "availableSeats" | "availabilityStatus"
  >;
}

export interface NormalizedRegistrationWriteResult {
  ok: boolean;
  applied: boolean;
  mode: "dry_run" | "live";
  registrationPersisted: boolean;
  registrationStatus?: "preinscrita" | "confirmada";
  registrationId?: string;
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

function normalizedPersistedRegistrationStatus(
  value: string,
): "preinscrita" | "confirmada" {
  return registrationStatusDomain(value) === "confirmed"
    ? "confirmada"
    : "preinscrita";
}

function sheetRegistrationStatus(
  value: "preinscrita" | "confirmada",
): "Activa" | "Pendiente confirmar" {
  return value === "confirmada" ? "Activa" : "Pendiente confirmar";
}

export function buildNormalizedRegistrationId(input: {
  serviceKey: MaternalyNormalizedServiceKey;
  phone?: string;
  sessionId: string;
}): string {
  return buildSyntheticIds(buildIdempotencyKey(input)).registrationId;
}

function rowMatchesRegistrationSession(
  row: NormalizedRow,
  input: { sessionId: string; groupId: string },
): boolean {
  const rowSessionId = getCell(row, "sessionId");
  const rowGroupId = getCell(row, "groupId");
  const notesSessionId = /\bsession\s*:\s*([^|\s]+)\b/i.exec(getCell(row, "notes"))?.[1];
  if (
    input.groupId &&
    rowGroupId &&
    humanNormalize(rowGroupId) === humanNormalize(input.groupId)
  ) {
    return true;
  }
  if (rowSessionId || notesSessionId) {
    return humanNormalize(rowSessionId || notesSessionId || "") === humanNormalize(input.sessionId);
  }

  return Boolean(
    input.groupId &&
    humanNormalize(rowGroupId) === humanNormalize(input.groupId),
  );
}

function rowMatchesRegistrationIdentity(
  row: NormalizedRow,
  input: {
    idempotencyKey: string;
    registrationId: string;
    phone?: string;
    sessionId: string;
    groupId: string;
  },
): boolean {
  const notes = getCell(row, "notes");
  const technicalMatch =
    getCell(row, "idempotencyKey") === input.idempotencyKey ||
    getCell(row, "registrationId") === input.registrationId ||
    notes.includes(input.idempotencyKey) ||
    notes.includes(input.registrationId);
  if (technicalMatch) {
    return true;
  }

  const normalizedPhone = normalizePhoneForMatch(input.phone ?? "");
  return Boolean(
    normalizedPhone &&
    normalizePhoneForMatch(getCell(row, "phone")) === normalizedPhone &&
    rowMatchesRegistrationSession(row, input),
  );
}

function registrationPeopleCount(row: NormalizedRow): number {
  const direct = Number.parseInt(getCell(row, "peopleCount"), 10);
  const notes = /\bpersonas?\s*:\s*(\d+)\b/i.exec(getCell(row, "notes"))?.[1];
  const notesCount = notes ? Number.parseInt(notes, 10) : Number.NaN;
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  if (Number.isFinite(notesCount) && notesCount > 0) {
    return notesCount;
  }
  return getCell(row, "partnerName").trim() ? 2 : 1;
}

function findExistingRegistration(
  snapshot: NormalizedServiceSheetSnapshot,
  input: {
    idempotencyKey: string;
    registrationId: string;
    phone?: string;
    sessionId: string;
    groupId: string;
  },
): NormalizedRow | undefined {
  return snapshot.tabs.Inscripciones.rows.find((row) => {
    if (!registrationIsOpen(getCell(row, "status"))) {
      return false;
    }
    return rowMatchesRegistrationIdentity(row, input);
  });
}

async function findExistingRegistrationInSheet(input: {
  client: NormalizedSheetsClient;
  sheetId: string;
  idempotencyKey: string;
  phone?: string;
  sessionId: string;
  groupId: string;
}): Promise<NormalizedRow | undefined> {
  const parsed = rowsToObjects(
    await input.client.readTabRows(input.sheetId, "Inscripciones"),
    { tab: "Inscripciones" },
  );
  if (parsed.parseError) {
    throw new Error(`idempotency_recheck_failed:${parsed.parseError}`);
  }

  const registrationId = buildSyntheticIds(input.idempotencyKey).registrationId;
  return parsed.rows.find((row) => {
    return (
      registrationIsOpen(getCell(row, "status")) &&
      rowMatchesRegistrationIdentity(row, { ...input, registrationId })
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

function requiredColumnsPresent(
  snapshot: NormalizedServiceSheetSnapshot,
  tabs: NormalizedRegistrationWriteOperation["tab"][],
): string[] {
  const errors: string[] = [];

  for (const tab of tabs) {
    const requirements = WRITE_COLUMN_REQUIREMENTS[tab];
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
  registrationStatus: "preinscrita" | "confirmada";
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
  const persistedSheetStatus = sheetRegistrationStatus(input.registrationStatus);

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
    status: persistedSheetStatus,
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
    estado: persistedSheetStatus,
    estado_cliente: "lead",
    estado_inscripcion: persistedSheetStatus,
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
  const existingRegistration = findExistingRegistration(input.snapshot, {
    idempotencyKey,
    registrationId: generatedIds.registrationId,
    phone: input.draft.phone,
    sessionId: input.session.sessionId,
    groupId: input.session.groupId,
  });
  const alreadyPersisted = Boolean(existingRegistration);
  const persistedStatus = existingRegistration
    ? normalizedPersistedRegistrationStatus(getCell(existingRegistration, "status"))
    : undefined;
  const persistedRegistrationId = existingRegistration
    ? getCell(existingRegistration, "registrationId") || generatedIds.registrationId
    : generatedIds.registrationId;
  const existingRegistrationDetailsMismatch = Boolean(
    existingRegistration &&
    (registrationPeopleCount(existingRegistration) !== input.draft.peopleCount ||
      (input.draft.partnerName?.trim() &&
        humanNormalize(getCell(existingRegistration, "partnerName")) !==
          humanNormalize(input.draft.partnerName))),
  );
  const validPeopleCount = input.draft.peopleCount === 1 || input.draft.peopleCount === 2;
  const interactionColumnsReady = requiredColumnsPresent(
    input.snapshot,
    ["Interacciones_Chatbot"],
  ).length === 0;
  const blockedReasons = [
    !normalizedConfig.enabled ? "normalized_sheets_disabled" : "",
    !input.draft.fullName?.trim() ? "missing_full_name" : "",
    !input.draft.phone?.trim() ? "missing_phone" : "",
    !validPeopleCount ? "invalid_people_count" : "",
    existingRegistrationDetailsMismatch ? "existing_registration_details_mismatch" : "",
    !alreadyPersisted && input.session.full ? "session_full" : "",
    !alreadyPersisted &&
    input.session.availableSeats !== undefined &&
    input.session.availableSeats < input.draft.peopleCount
      ? "not_enough_available_seats"
      : "",
    !alreadyPersisted && input.session.availabilityStatus === "unknown_capacity"
      ? "unknown_capacity_requires_manual_review"
      : "",
    !allowlisted ? "sheet_not_allowlisted" : "",
    ...(!alreadyPersisted
      ? requiredColumnsPresent(input.snapshot, ["Clientes_Local", "Inscripciones"])
      : []),
  ].filter(Boolean);

  const clientExists = Boolean(existingClient);
  const blocked = blockedReasons.length > 0;
  const confirmsCharlaRegistration = input.draft.serviceKey === "charla_embarazo_1_20" &&
    ((alreadyPersisted && !existingRegistrationDetailsMismatch && persistedStatus === "confirmada") ||
      (!alreadyPersisted && liveFlagsReady && allowlisted && !blocked));
  const registrationStatus = persistedStatus ?? (confirmsCharlaRegistration ? "confirmada" : "preinscrita");
  const result = blocked ? "blocked" : confirmsCharlaRegistration ? "confirmed" : "prepared";
  const blockedReasonText = blockedReasons.join("|");
  const registrationEvent = confirmsCharlaRegistration
    ? "maternaly_registration_confirmed"
    : "maternaly_registration_write_plan";
  const interactionEvent = confirmsCharlaRegistration
    ? "maternaly_registration_confirmed"
    : "maternaly_normalized_registration_write_plan";

  const base = baseValues({
    draft: input.draft,
    session: input.session,
    workbookServiceId: getNormalizedWorkbookServiceId(input.snapshot),
    idempotencyKey,
    clientId,
    registrationId: persistedRegistrationId,
    interactionId: generatedIds.interactionId,
    createdAt: new Date().toISOString(),
    registrationStatus,
  });

  return {
    serviceKey: input.draft.serviceKey,
    sheetId: input.snapshot.sheetId,
    mode: normalizedConfig.writeMode,
    allowedLive: liveFlagsReady && allowlisted && !blocked,
    idempotencyKey,
    blocked,
    blockedReasons,
    alreadyPersisted,
    registrationStatus,
    existingRegistrationSheetStatus: existingRegistration
      ? getCell(existingRegistration, "status")
      : undefined,
    operations: [
      {
        tab: "Clientes_Local",
        operation: clientExists || blocked || alreadyPersisted ? "noop" : "append",
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
        operation: blocked || alreadyPersisted ? "noop" : "append",
        values: {
          ...base,
          status: sheetRegistrationStatus(registrationStatus),
          estado: sheetRegistrationStatus(registrationStatus),
          estado_inscripcion: sheetRegistrationStatus(registrationStatus),
          event: registrationEvent,
          accion_realizada: registrationEvent,
          result,
          resultado: result,
        },
      },
      {
        tab: "Interacciones_Chatbot",
        operation: alreadyPersisted || !interactionColumnsReady ? "noop" : "append",
        values: {
          ...base,
          status: result,
          estado: result,
          event: blocked ? "maternaly_normalized_registration_blocked" : interactionEvent,
          evento: blocked ? "maternaly_normalized_registration_blocked" : interactionEvent,
          accion_realizada: blocked ? "maternaly_normalized_registration_blocked" : interactionEvent,
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
      capacityTotal: input.session.capacityTotal,
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
  const plannedRegistrationId = String(
    input.plan.operations.find((operation) => operation.tab === "Inscripciones")?.values.registrationId ??
      "",
  ).trim() || undefined;
  if (input.plan.mode !== "live") {
    return {
      ok: true,
      applied: false,
      mode: input.plan.mode,
      registrationPersisted: input.plan.alreadyPersisted,
      registrationStatus: input.plan.alreadyPersisted ? input.plan.registrationStatus : undefined,
      registrationId: input.plan.alreadyPersisted ? plannedRegistrationId : undefined,
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
      registrationPersisted: input.plan.alreadyPersisted,
      registrationStatus: input.plan.alreadyPersisted ? input.plan.registrationStatus : undefined,
      registrationId: input.plan.alreadyPersisted ? plannedRegistrationId : undefined,
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
    const registrationValues = input.plan.operations.find(
      (operation) => operation.tab === "Inscripciones",
    )?.values;
    const registrationPhone = String(registrationValues?.phone ?? "");
    const requestedPeopleCount = Number.parseInt(
      String(registrationValues?.peopleCount ?? registrationValues?.people_count ?? ""),
      10,
    );
    const requestedPartnerName = String(
      registrationValues?.partnerName ?? registrationValues?.pareja_nombre ?? "",
    ).trim();
    const registrationDetailsMismatch = (row: NormalizedRow) =>
      (Number.isFinite(requestedPeopleCount) &&
        registrationPeopleCount(row) !== requestedPeopleCount) ||
      (requestedPartnerName &&
        humanNormalize(getCell(row, "partnerName")) !== humanNormalize(requestedPartnerName));
    const existingRegistration = await findExistingRegistrationInSheet({
      client: input.client,
      sheetId: input.plan.sheetId,
      idempotencyKey: input.plan.idempotencyKey,
      phone: registrationPhone,
      sessionId: input.plan.session.sessionId,
      groupId: input.plan.session.groupId,
    });
    if (existingRegistration) {
      const registrationStatus = normalizedPersistedRegistrationStatus(
        getCell(existingRegistration, "status"),
      );
      const registrationId = getCell(existingRegistration, "registrationId") ||
        buildNormalizedRegistrationId({
          serviceKey: input.plan.serviceKey,
          phone: registrationPhone,
          sessionId: input.plan.session.sessionId,
        });
      if (registrationDetailsMismatch(existingRegistration)) {
        return {
          ok: false,
          applied: false,
          mode: "live",
          registrationPersisted: true,
          registrationStatus,
          registrationId,
          blockedReason: "existing_registration_details_mismatch_on_recheck",
          plan: input.plan,
          updatedRanges: [],
          formattedRanges: [],
          formatApplied: false,
          formatWarnings: [],
        };
      }
      return {
        ok: true,
        applied: false,
        mode: "live",
        registrationPersisted: true,
        registrationStatus,
        registrationId,
        plan: input.plan,
        updatedRanges: [],
        formattedRanges: [],
        formatApplied: false,
        formatWarnings: [],
      };
    }

    const finiteCapacity = input.plan.session.capacityTotal;
    if (
      finiteCapacity !== undefined &&
      !input.client.appendRegistrationRowIfCapacityAllows
    ) {
      return {
        ok: false,
        applied: false,
        mode: "live",
        registrationPersisted: false,
        blockedReason: "atomic_capacity_guard_unavailable",
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
    let registrationPersisted = false;
    let persistedRegistrationStatus: "preinscrita" | "confirmada" | undefined;
    let persistedRegistrationId: string | undefined;
    for (const operation of input.plan.operations) {
      if (operation.operation !== "append") {
        continue;
      }

      const headers = input.snapshot.tabs[operation.tab].headers;
      let result;
      try {
        const values = valuesForHeaders(headers, operation.values);
        if (
          operation.tab === "Inscripciones" &&
          finiteCapacity !== undefined &&
          input.client.appendRegistrationRowIfCapacityAllows
        ) {
          const guarded = await input.client.appendRegistrationRowIfCapacityAllows(
            input.plan.sheetId,
            "Inscripciones",
            values,
            {
              sessionId: input.plan.session.sessionId,
              groupId: input.plan.session.groupId,
              capacityTotal: finiteCapacity,
              peopleCount: Number.isFinite(requestedPeopleCount) ? requestedPeopleCount : 1,
            },
          );
          if (!guarded.applied || !guarded.result) {
            return {
              ok: false,
              applied: false,
              mode: "live",
              registrationPersisted: false,
              blockedReason: guarded.reason ?? "session_full_on_atomic_append",
              plan: input.plan,
              updatedRanges,
              formattedRanges,
              formatApplied: false,
              formatWarnings,
            };
          }
          result = guarded.result;
        } else {
          result = await input.client.appendRow(
            input.plan.sheetId,
            operation.tab,
            values,
          );
        }
      } catch (error) {
        if (operation.tab === "Inscripciones") {
          const reconciledRegistration = await findExistingRegistrationInSheet({
            client: input.client,
            sheetId: input.plan.sheetId,
            idempotencyKey: input.plan.idempotencyKey,
            phone: registrationPhone,
            sessionId: input.plan.session.sessionId,
            groupId: input.plan.session.groupId,
          });
          if (!reconciledRegistration) {
            throw error;
          }

          persistedRegistrationStatus = normalizedPersistedRegistrationStatus(
            getCell(reconciledRegistration, "status"),
          );
          persistedRegistrationId = getCell(reconciledRegistration, "registrationId") ||
            plannedRegistrationId;
          if (registrationDetailsMismatch(reconciledRegistration)) {
            return {
              ok: false,
              applied: false,
              mode: "live",
              registrationPersisted: true,
              registrationStatus: persistedRegistrationStatus,
              registrationId: persistedRegistrationId,
              blockedReason: "existing_registration_details_mismatch_after_ambiguous_append",
              plan: input.plan,
              updatedRanges,
              formattedRanges,
              formatApplied: false,
              formatWarnings,
            };
          }

          registrationPersisted = true;
          const warning = error instanceof Error ? error.message : "append_response_lost";
          formatWarnings.push(`Inscripciones:append_reconciled:${warning}`);
          continue;
        }
        if (operation.tab !== "Interacciones_Chatbot" || !registrationPersisted) {
          throw error;
        }
        const warning = error instanceof Error ? error.message : "append_failed";
        formatWarnings.push(`Interacciones_Chatbot:append_failed:${warning}`);
        continue;
      }
      if (operation.tab === "Inscripciones") {
        registrationPersisted = true;
        persistedRegistrationStatus = input.plan.registrationStatus;
        persistedRegistrationId = plannedRegistrationId;
      }
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
      applied: registrationPersisted,
      mode: "live",
      registrationPersisted,
      registrationStatus: registrationPersisted ? persistedRegistrationStatus : undefined,
      registrationId: registrationPersisted ? persistedRegistrationId : undefined,
      plan: input.plan,
      updatedRanges,
      formattedRanges,
      formatApplied: updatedRanges.length > 0 && formattedRanges.length === updatedRanges.length,
      formatWarnings,
    };
  });
}
