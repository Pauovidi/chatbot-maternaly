#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { google } from "googleapis";

export const SYNTHETIC_MARKER = "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL";
export const SYNTHETIC_NAME = "PRUEBA BOT CODEX NO CLIENTE REAL";
export const SYNTHETIC_PHONE = "+34999000111";
export const SYNTHETIC_EMAIL = "prueba.bot.codex@example.test";
export const SYNTHETIC_SOURCE = "codex_live_write_test";

export const REQUIRED_LIVE_FLAGS = Object.freeze([
  ["MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE", "true"],
  ["MATERNALY_NORMALIZED_SHEETS_ENABLED", "true"],
  ["MATERNALY_NORMALIZED_SHEETS_WRITE_MODE", "live"],
  ["GOOGLE_SHEETS_ACCESS_MODE", "live"],
  ["BOT_SHEETS_LIVE_WRITE_ENABLED", "true"],
]);

export const WRITE_TABS = Object.freeze([
  "Clientes_Local",
  "Inscripciones",
  "Interacciones_Chatbot",
]);

const SESSION_CONTEXT_TABS = Object.freeze(["Sesiones", "Grupos_Ediciones"]);
const GOOGLE_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const LEGACY_ORIGINAL_SHEET_IDS = new Set([
  "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI",
  "1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do",
]);

const SERVICES = Object.freeze([
  {
    serviceKey: "charla_embarazo_1_20",
    label: "Charla informativa embarazo semana 1-20",
    sheetEnv: "MATERNALY_CHARLA_EMBARAZO_SHEET_ID",
    peopleCount: 1,
    pregnancyWeek: 12,
  },
  {
    serviceKey: "taller_blw",
    label: "Taller BLW",
    sheetEnv: "MATERNALY_BLW_SHEET_ID",
    peopleCount: 1,
  },
]);

export const COLUMN_ALIASES = Object.freeze({
  serviceId: ["service_id", "servicio_id", "id_servicio", "servicio"],
  serviceName: ["service_name", "nombre_servicio", "servicio", "nombre"],
  groupId: ["group_id", "grupo_id", "id_grupo", "edicion_id", "id_edicion"],
  groupName: ["group_name", "grupo", "nombre_grupo", "edicion", "nombre_edicion"],
  sessionId: ["session_id", "sesion_id", "id_sesion", "id"],
  sessionName: ["session_name", "sesion", "titulo", "nombre"],
  center: ["centro", "sede", "ubicacion", "ubicación"],
  modality: ["modalidad", "formato"],
  date: ["fecha", "date", "dia"],
  startTime: ["hora_inicio", "inicio", "start_time", "hora"],
  endTime: ["hora_fin", "fin", "end_time"],
  capacityTotal: ["capacidad_total", "capacidad", "cupo", "plazas_totales"],
  occupiedSeats: ["plazas_ocupadas", "ocupadas", "occupied_seats"],
  availableSeats: ["plazas_disponibles", "disponibles", "available_seats"],
  visibleChatbot: ["visible_chatbot", "visible_bot"],
  reservableChatbot: ["reservable_chatbot", "reservable_bot"],
  status: ["estado", "status", "estado_inscripcion", "resultado", "estado_cliente", "estado_sesion"],
  clientId: ["cliente_id", "client_id", "id_cliente"],
  registrationId: ["inscripcion_id", "registration_id", "id_inscripcion"],
  interactionId: ["interaccion_id", "interaction_id", "id_interaccion"],
  fullName: ["nombre_completo", "full_name", "contacto", "nombre", "nombre_y_apellidos"],
  firstName: ["nombre"],
  lastName: ["apellidos", "apellido"],
  phone: ["telefono", "teléfono", "telefono_normalizado", "phone", "whatsapp", "movil", "móvil"],
  email: ["email", "correo", "mail"],
  peopleCount: ["people_count", "personas", "plazas", "cantidad"],
  pregnancyWeek: ["semana_embarazo", "semana", "pregnancy_week"],
  idempotencyKey: ["idempotency_key", "clave_idempotencia", "external_id", "id_externo"],
  createdAt: ["created_at", "fecha_creacion", "creado_en", "fecha_hora", "fecha_inscripcion", "fecha_alta"],
  updatedAt: ["ultima_actualizacion", "updated_at"],
  source: ["source", "origen", "canal", "canal_origen", "channel"],
  notes: ["notas", "observaciones", "notes", "notas_privadas"],
  event: ["evento", "event", "accion_realizada", "accion"],
  result: ["resultado", "result"],
  mode: ["mode", "modo"],
  blockedReasons: ["blocked_reasons", "motivos_bloqueo"],
  price: ["precio", "precio_acordado"],
  paymentStatus: ["estado_pago", "payment_status"],
  partnerName: ["pareja_nombre", "acompanante", "acompañante", "nombre_pareja"],
  babyBirthDate: ["fecha_nacimiento_bebe", "fecha_nacimiento_bebé"],
  fppOrDueDate: ["fpp", "fecha_probable_parto"],
  requiresHuman: ["requiere_humano"],
  conversationId: ["conversation_id"],
  leadId: ["lead_id"],
  inboundSummary: ["mensaje_usuario_resumen"],
  outboundSummary: ["respuesta_bot_resumen"],
});

export const TAB_REQUIRED_COLUMNS = Object.freeze({
  Clientes_Local: [["clientId", "idempotencyKey"], ["fullName", "firstName"], "phone", "email"],
  Inscripciones: [
    ["registrationId", "idempotencyKey"],
    ["clientId", "idempotencyKey"],
    "groupId",
    "serviceId",
    "phone",
    "status",
    "source",
    "notes",
  ],
  Interacciones_Chatbot: [
    ["interactionId", "idempotencyKey"],
    "createdAt",
    ["source", "mode"],
    "event",
    ["result", "notes", "blockedReasons"],
  ],
});

const TAB_HEADER_EXPECTATIONS = Object.freeze({
  Clientes_Local: ["clientId", "fullName", "firstName", "lastName", "phone", "email", "source", "status", "notes", "createdAt", "updatedAt"],
  Grupos_Ediciones: ["groupId", "groupName", "serviceId", "center", "modality", "capacityTotal", "status"],
  Sesiones: ["sessionId", "groupId", "serviceId", "date", "startTime", "endTime", "center", "modality", "capacityTotal", "occupiedSeats", "availableSeats", "visibleChatbot", "reservableChatbot", "status"],
  Inscripciones: ["registrationId", "clientId", "serviceId", "groupId", "sessionId", "fullName", "firstName", "lastName", "phone", "status", "source", "notes", "createdAt", "price", "paymentStatus", "partnerName"],
  Interacciones_Chatbot: ["interactionId", "createdAt", "source", "phone", "clientId", "leadId", "serviceId", "event", "result", "requiresHuman", "conversationId", "notes"],
});

const HEADER_SCAN_LIMIT = 20;

const NON_OCCUPYING_STATUSES = Object.freeze([
  "cancelada",
  "anulada",
  "baja",
  "no vino",
  "rechazada",
]);

const OCCUPYING_STATUSES = Object.freeze([
  "activa",
  "pendiente confirmar",
  "preinscrita",
  "reserva pendiente",
  "confirmada",
]);

export function normalizeSheetText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function humanNormalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function splitCsv(value) {
  return value
    ? String(value)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function compactIsoTimestamp(date) {
  return date.toISOString().replace(/[-:.]/g, "").replace("T", "_").replace("Z", "Z");
}

export function redactSheetId(value) {
  if (!value) {
    return "";
  }

  return value.length <= 10 ? "[sheet-id]" : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function getAliases(key) {
  return COLUMN_ALIASES[key] ?? [key];
}

function findColumnIndex(headers, key) {
  const normalizedHeaders = headers.map(normalizeSheetText);
  const aliases = getAliases(key).map(normalizeSheetText);
  return normalizedHeaders.findIndex((header) => aliases.includes(header));
}

function requirementKeys(requirement) {
  return Array.isArray(requirement) ? requirement : [requirement];
}

export function validateRequiredColumns(headers, requiredKeys) {
  return requiredKeys
    .filter((requirement) => !requirementKeys(requirement).some((key) => findColumnIndex(headers, key) !== -1))
    .map((requirement) => requirementKeys(requirement).join("|"));
}

function acceptedAliases(requirement) {
  return requirementKeys(requirement)
    .map((key) => `${key}(${getAliases(key).join(",")})`)
    .join(";");
}

function describeMissingColumns(tab, headers, missing) {
  const headerList = headers.map(normalizeSheetText).filter(Boolean).join(",");
  return missing.map((column) => ({
    tab,
    column,
    error: `missing_required_columns:${tab}:${column}:accepted=${acceptedAliases(column.split("|"))}:headers=${headerList}`,
  }));
}

function coerceRows(values) {
  return (values ?? []).map((row) => row.map((cell) => String(cell ?? "").trim()));
}

function minimumExpectedMatches(tabTitle) {
  switch (tabTitle) {
    case "Sesiones":
      return 3;
    case "Clientes_Local":
    case "Inscripciones":
    case "Grupos_Ediciones":
      return 2;
    case "Interacciones_Chatbot":
      return 1;
    default:
      return 2;
  }
}

function columnKeyForHeader(value) {
  const normalized = normalizeSheetText(value);
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.map(normalizeSheetText).includes(normalized)) {
      return key;
    }
  }
  return undefined;
}

export function detectHeaderRow(rows, tabTitle) {
  const expected = new Set(TAB_HEADER_EXPECTATIONS[tabTitle] ?? Object.keys(COLUMN_ALIASES));
  let best = null;

  for (const [index, row] of rows.slice(0, HEADER_SCAN_LIMIT).entries()) {
    if (!row.some(Boolean)) {
      continue;
    }

    const matchedKeys = new Set(row.map(columnKeyForHeader).filter(Boolean));
    const expectedMatches = Array.from(matchedKeys).filter((key) => expected.has(key)).length;
    const score = matchedKeys.size * 10 + expectedMatches * 20 + row.filter(Boolean).length;
    if (!best || score > best.score) {
      best = { index, score, matchedKeys, expectedMatches };
    }
  }

  if (!best) {
    return { headerRowIndex: -1, parseError: "header_not_found:no_non_empty_rows" };
  }

  if (best.matchedKeys.size < 2 || best.expectedMatches < minimumExpectedMatches(tabTitle)) {
    return {
      headerRowIndex: -1,
      parseError: `header_not_found:${tabTitle ?? "unknown"}:matched_${best.matchedKeys.size}:expected_${best.expectedMatches}`,
    };
  }

  return { headerRowIndex: best.index };
}

export function rowsToObjects(values, tabTitle) {
  const rows = coerceRows(values);
  const { headerRowIndex, parseError } = detectHeaderRow(rows, tabTitle);
  const headers = headerRowIndex >= 0 ? rows[headerRowIndex] : [];
  const normalizedHeaders = headers.map(normalizeSheetText);
  const body = headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : [];

  return {
    headers,
    normalizedHeaders,
    headerRowIndex,
    headerRowNumber: headerRowIndex >= 0 ? headerRowIndex + 1 : undefined,
    parseError,
    rows: body
      .filter((row) => row.some(Boolean))
      .map((row) =>
        Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] ?? ""])),
      ),
  };
}

function getCell(row, key) {
  for (const alias of getAliases(key).map(normalizeSheetText)) {
    const value = row[alias];
    if (value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function valuesForHeaders(headers, values) {
  const exact = new Map();
  const byAlias = new Map();
  for (const [key, value] of Object.entries(values)) {
    exact.set(normalizeSheetText(key), value);
    if (COLUMN_ALIASES[key]) {
      for (const alias of getAliases(key)) {
        byAlias.set(normalizeSheetText(alias), value);
      }
    }
  }

  return headers.map((header) => {
    const normalizedHeader = normalizeSheetText(header);
    return exact.get(normalizedHeader) ?? byAlias.get(normalizedHeader) ?? "";
  });
}

function registrationOccupiesCapacity(status) {
  const normalized = humanNormalize(status);
  if (NON_OCCUPYING_STATUSES.some((item) => normalized.includes(item))) {
    return false;
  }

  return OCCUPYING_STATUSES.some((item) => normalized.includes(item));
}

function isActiveRow(row) {
  const status = humanNormalize(getCell(row, "status"));
  const visible = humanNormalize(getCell(row, "visibleChatbot"));
  const reservable = humanNormalize(getCell(row, "reservableChatbot"));
  const hidden = ["no", "false", "0", "oculto", "oculta"].includes(visible);
  const notReservable = ["no", "false", "0"].includes(reservable);

  return (
    !hidden &&
    !notReservable &&
    (!status || !NON_OCCUPYING_STATUSES.some((item) => status.includes(item)))
  );
}

function calculateSessionOccupancy(registrations, sessionId, groupId) {
  return registrations.filter((row) => {
    const rowSessionId = getCell(row, "sessionId");
    const rowGroupId = getCell(row, "groupId");
    const sameSession = rowSessionId ? rowSessionId === sessionId : rowGroupId === groupId;
    return sameSession && registrationOccupiesCapacity(getCell(row, "status"));
  }).length;
}

function selectAvailableSession({ service, tabs }) {
  const groups = new Map(
    tabs.Grupos_Ediciones.rows.map((row) => {
      const groupId = getCell(row, "groupId");
      return [
        groupId,
        {
          groupId,
          groupName: getCell(row, "groupName") || groupId,
          capacityTotal: parsePositiveInteger(getCell(row, "capacityTotal")),
        },
      ];
    }),
  );

  for (const row of tabs.Sesiones.rows.filter(isActiveRow)) {
    const groupId = getCell(row, "groupId");
    const group = groups.get(groupId);
    const sessionId =
      getCell(row, "sessionId") ||
      `${groupId}:${getCell(row, "date")}:${getCell(row, "startTime")}`;
    const directOccupied = parsePositiveInteger(getCell(row, "occupiedSeats"));
    const directAvailable = parsePositiveInteger(getCell(row, "availableSeats"));
    const capacityTotal =
      parsePositiveInteger(getCell(row, "capacityTotal")) ?? group?.capacityTotal;
    if (capacityTotal === undefined && directAvailable === undefined) {
      continue;
    }

    const calculatedOccupied = calculateSessionOccupancy(tabs.Inscripciones.rows, sessionId, groupId);
    const occupied =
      directOccupied ??
      (directAvailable !== undefined && capacityTotal !== undefined
        ? Math.max(capacityTotal - directAvailable, 0)
        : calculatedOccupied);
    const availableSeats =
      directAvailable ??
      (capacityTotal === undefined ? undefined : Math.max(capacityTotal - occupied, 0));
    if (availableSeats < service.peopleCount) {
      continue;
    }

    const center = getCell(row, "center");
    return {
      groupId,
      groupName: center || group?.groupName || groupId,
      sessionId,
      sessionName: getCell(row, "sessionName") || service.label,
      date: getCell(row, "date"),
      startTime: getCell(row, "startTime"),
      availableSeats,
      capacityTotal,
    };
  }

  return null;
}

function hasIdempotencyKey(tabSnapshot, idempotencyKey) {
  const ids = buildSyntheticIds(idempotencyKey);
  return tabSnapshot.rows.some((row) => {
    const notes = getCell(row, "notes");
    return (
      getCell(row, "idempotencyKey") === idempotencyKey ||
      getCell(row, "clientId") === ids.clientId ||
      getCell(row, "registrationId") === ids.registrationId ||
      getCell(row, "interactionId") === ids.interactionId ||
      notes.includes(idempotencyKey) ||
      notes.includes(ids.clientId) ||
      notes.includes(ids.registrationId) ||
      notes.includes(ids.interactionId)
    );
  });
}

function buildSyntheticIds(idempotencyKey) {
  const suffix = idempotencyKey.slice(0, 16).toUpperCase();
  return {
    clientId: `CLI_BOT_${suffix}`,
    registrationId: `INS_BOT_${suffix}`,
    interactionId: `INT_BOT_${suffix}`,
  };
}

function splitFullName(fullName) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: String(fullName ?? "").trim(), lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function priceForService(service) {
  if (service.serviceKey === "charla_embarazo_1_20") {
    return "0 €";
  }

  return service.peopleCount > 1 ? "75 €/pareja" : "45 €/persona";
}

function buildSyntheticValues({ service, session, idempotencyKey, createdAt }) {
  const ids = buildSyntheticIds(idempotencyKey);
  const { firstName, lastName } = splitFullName(SYNTHETIC_NAME);
  const notes = [
    SYNTHETIC_MARKER,
    "no_cliente_real",
    service.serviceKey,
    `trace:${idempotencyKey}`,
    `session:${session.sessionId}`,
    `personas:${service.peopleCount}`,
    "synthetic_live_write_test",
  ].join(" | ");
  const price = priceForService(service);

  return {
    serviceId: service.serviceKey,
    serviceName: service.label,
    groupId: session.groupId,
    groupName: session.groupName,
    sessionId: session.sessionId,
    sessionName: session.sessionName,
    date: session.date,
    startTime: session.startTime,
    clientId: ids.clientId,
    registrationId: ids.registrationId,
    interactionId: ids.interactionId,
    status: "Preinscrita",
    fullName: SYNTHETIC_NAME,
    firstName,
    lastName,
    phone: SYNTHETIC_PHONE,
    email: SYNTHETIC_EMAIL,
    peopleCount: service.peopleCount,
    pregnancyWeek: service.pregnancyWeek,
    fppOrDueDate: service.pregnancyWeek ? "2026-11-30" : "",
    babyBirthDate: service.serviceKey === "taller_blw" ? "2025-01-15" : "",
    idempotencyKey,
    createdAt,
    updatedAt: createdAt,
    source: SYNTHETIC_SOURCE,
    notes,
    event: SYNTHETIC_SOURCE,
    result: "prepared",
    requiresHuman: "no",
    conversationId: idempotencyKey,
    price,
    paymentStatus: "pendiente",
    mode: "live",
    blockedReasons: "",

    service_id: service.serviceKey,
    servicio_id: service.serviceKey,
    cliente_id: ids.clientId,
    inscripcion_id: ids.registrationId,
    interaccion_id: ids.interactionId,
    nombre: firstName,
    apellidos: lastName,
    nombre_completo: SYNTHETIC_NAME,
    telefono: SYNTHETIC_PHONE,
    telefono_normalizado: SYNTHETIC_PHONE,
    canal_origen: SYNTHETIC_SOURCE,
    canal: SYNTHETIC_SOURCE,
    estado_cliente: "lead",
    estado_inscripcion: "preinscrita",
    estado_pago: "pendiente",
    precio_acordado: price,
    observaciones: notes,
    notas_privadas: notes,
    fecha_alta: createdAt,
    fecha_inscripcion: createdAt,
    fecha_hora: createdAt,
    ultima_actualizacion: createdAt,
    fecha_nacimiento_bebe: service.serviceKey === "taller_blw" ? "2025-01-15" : "",
    fpp: service.pregnancyWeek ? "2026-11-30" : "",
    requiere_humano: "no",
  };
}

function buildRowsByTab({ service, session, idempotencyKey, createdAt }) {
  const base = buildSyntheticValues({ service, session, idempotencyKey, createdAt });
  return {
    Clientes_Local: {
      ...base,
      event: "codex_live_write_test_client",
      accion_realizada: "codex_live_write_test_client",
      status: "lead",
      estado_cliente: "lead",
      result: "prepared",
      resultado: "prepared",
    },
    Inscripciones: {
      ...base,
      event: "codex_live_write_test_registration",
      accion_realizada: "codex_live_write_test_registration",
      status: "preinscrita",
      estado_inscripcion: "preinscrita",
      result: "prepared",
      resultado: "prepared",
    },
    Interacciones_Chatbot: {
      ...base,
      status: "applied",
      event: "codex_live_write_test_interaction",
      accion_realizada: "codex_live_write_test_interaction",
      result: "applied",
      resultado: "applied",
    },
  };
}

export function getServiceAccountCredentials(env = process.env) {
  const rawJson =
    env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim() ||
    env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim() ||
    env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    return JSON.parse(rawJson);
  }

  const base64 = env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (base64) {
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  }

  const clientEmail =
    env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim() ||
    env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim() ||
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey =
    env.MATERNALY_GOOGLE_SHEETS_PRIVATE_KEY?.trim() ||
    env.HOTEL_GOOGLE_SHEETS_PRIVATE_KEY?.trim() ||
    env.GOOGLE_PRIVATE_KEY?.trim();

  if (clientEmail && privateKey) {
    return {
      project_id:
        env.MATERNALY_GOOGLE_PROJECT_ID?.trim() ||
        env.HOTEL_GOOGLE_PROJECT_ID?.trim() ||
        env.GOOGLE_PROJECT_ID?.trim(),
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function hasGoogleCredential(env) {
  return Boolean(
    env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim() ||
      env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim() ||
      env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
      env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      (env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim() &&
        env.MATERNALY_GOOGLE_SHEETS_PRIVATE_KEY?.trim()) ||
      (env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim() &&
        env.HOTEL_GOOGLE_SHEETS_PRIVATE_KEY?.trim()) ||
      (env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && env.GOOGLE_PRIVATE_KEY?.trim()),
  );
}

function createSheetsClient(env) {
  const credentials = getServiceAccountCredentials(env);
  const auth = new google.auth.GoogleAuth({
    credentials: credentials ?? undefined,
    keyFilename: credentials ? undefined : env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: GOOGLE_SHEETS_SCOPES,
  });

  return google.sheets({ version: "v4", auth });
}

function serviceTargetsFromEnv(env) {
  return SERVICES.map((service) => ({
    ...service,
    sheetId: env[service.sheetEnv]?.trim() || "",
  }));
}

export function validateLiveWriteEnvironment(env = process.env) {
  const missingLiveFlags = REQUIRED_LIVE_FLAGS.filter(([name, expected]) => env[name] !== expected)
    .map(([name, expected]) => ({ name, expected }));
  const serviceTargets = serviceTargetsFromEnv(env);
  const missingSheetIds = serviceTargets
    .filter((service) => !service.sheetId)
    .map((service) => service.serviceKey);
  const legacySheetTargets = serviceTargets
    .filter((service) => service.sheetId && LEGACY_ORIGINAL_SHEET_IDS.has(service.sheetId))
    .map((service) => ({
      serviceKey: service.serviceKey,
      redactedSheetId: redactSheetId(service.sheetId),
    }));
  const explicitAllowlist = splitCsv(env.MATERNALY_NORMALIZED_SHEET_IDS);
  const notAllowlisted = explicitAllowlist.length
    ? serviceTargets
        .filter((service) => service.sheetId && !explicitAllowlist.includes(service.sheetId))
        .map((service) => ({
          serviceKey: service.serviceKey,
          redactedSheetId: redactSheetId(service.sheetId),
        }))
    : [];
  const credentialsConfigured = hasGoogleCredential(env);
  const primaryReason = missingLiveFlags.length
    ? "missing_required_live_flags"
    : missingSheetIds.length
      ? "missing_service_sheet_ids"
      : legacySheetTargets.length
        ? "protected_legacy_sheet_id"
        : notAllowlisted.length
          ? "target_sheet_not_allowlisted"
          : !credentialsConfigured
            ? "google_credentials_missing"
            : "ready";

  return {
    ready: primaryReason === "ready",
    primaryReason,
    missingLiveFlags,
    missingSheetIds,
    legacySheetTargets,
    notAllowlisted,
    credentialsConfigured,
    serviceTargets,
  };
}

function publicValidation(validation) {
  return {
    ready: validation.ready,
    primaryReason: validation.primaryReason,
    missingLiveFlags: validation.missingLiveFlags,
    missingSheetIds: validation.missingSheetIds,
    legacySheetTargets: validation.legacySheetTargets,
    notAllowlisted: validation.notAllowlisted,
    credentialsConfigured: validation.credentialsConfigured,
    targetSheetIds: validation.serviceTargets.map((service) => ({
      serviceKey: service.serviceKey,
      configured: Boolean(service.sheetId),
      redactedSheetId: redactSheetId(service.sheetId),
    })),
  };
}

function escapeSheetName(tabTitle) {
  return tabTitle.replace(/'/g, "''");
}

async function profileTabs(sheets, sheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    includeGridData: false,
    fields: "sheets.properties.title",
  });
  return new Set(
    response.data.sheets
      ?.map((sheet) => sheet.properties?.title)
      .filter((title) => Boolean(title)) ?? [],
  );
}

async function readTab(sheets, sheetId, tabTitle) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${escapeSheetName(tabTitle)}'!A1:AZ1000`,
    valueRenderOption: "FORMATTED_VALUE",
    majorDimension: "ROWS",
  });
  return rowsToObjects(response.data.values ?? [], tabTitle);
}

async function appendTabRow(sheets, sheetId, tabTitle, headers, values) {
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${escapeSheetName(tabTitle)}'!A:AZ`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [valuesForHeaders(headers, values)],
    },
  });

  return {
    updatedRange: response.data.updates?.updatedRange,
    updatedRows: response.data.updates?.updatedRows ?? 0,
  };
}

function knownSensitiveValues(env) {
  return [
    ...serviceTargetsFromEnv(env).map((service) => service.sheetId),
    env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON,
    env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON,
    env.GOOGLE_SERVICE_ACCOUNT_JSON,
    env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64,
    env.MATERNALY_GOOGLE_SHEETS_PRIVATE_KEY,
    env.HOTEL_GOOGLE_SHEETS_PRIVATE_KEY,
    env.GOOGLE_PRIVATE_KEY,
    env.TWILIO_AUTH_TOKEN,
    env.TWILIO_WEBHOOK_AUTH_TOKEN,
    env.OPENAI_API_KEY,
  ].filter((value) => value && String(value).length >= 8);
}

export function sanitizeErrorMessage(error, env = process.env) {
  let message = error instanceof Error ? error.message : String(error ?? "unknown_error");
  for (const value of knownSensitiveValues(env)) {
    message = message.split(String(value)).join("[redacted]");
  }

  return message
    .replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, "[redacted-private-key]")
    .replace(/[A-Za-z0-9_=-]{96,}/g, "[redacted-token]");
}

async function processService({ sheets, service, idempotencyKey, createdAt, env }) {
  const result = {
    serviceKey: service.serviceKey,
    label: service.label,
    redactedSheetId: redactSheetId(service.sheetId),
    status: "pending",
    tabsValidated: [],
    appendAttempts: 0,
    appendApplied: 0,
    updatedRanges: [],
    missingTabs: [],
    missingColumns: [],
    duplicateTabs: [],
    selectedSession: null,
    tabResults: [],
  };

  try {
    const existingTabs = await profileTabs(sheets, service.sheetId);
    const missingTabs = WRITE_TABS.filter((tab) => !existingTabs.has(tab));
    result.missingTabs = missingTabs;
    if (missingTabs.length) {
      result.status = "skipped_missing_tabs";
      return result;
    }

    const contextMissingTabs = SESSION_CONTEXT_TABS.filter((tab) => !existingTabs.has(tab));
    if (contextMissingTabs.length) {
      result.missingTabs = contextMissingTabs;
      result.status = "skipped_missing_session_context_tabs";
      return result;
    }

    const tabs = {};
    for (const tab of [...SESSION_CONTEXT_TABS, ...WRITE_TABS]) {
      tabs[tab] = await readTab(sheets, service.sheetId, tab);
    }

    const parseErrors = Object.entries(tabs)
      .filter(([, snapshot]) => snapshot.parseError)
      .map(([tab, snapshot]) => ({ tab, error: snapshot.parseError }));
    if (parseErrors.length) {
      result.status = "skipped_header_not_found";
      result.parseErrors = parseErrors;
      return result;
    }

    const missingColumns = [];
    for (const tab of WRITE_TABS) {
      const missing = validateRequiredColumns(tabs[tab].headers, TAB_REQUIRED_COLUMNS[tab]);
      result.tabsValidated.push({
        tab,
        headersFound: tabs[tab].headers.length,
        ok: missing.length === 0,
      });
      missingColumns.push(...describeMissingColumns(tab, tabs[tab].headers, missing));
    }

    result.missingColumns = missingColumns;
    if (missingColumns.length) {
      result.status = "skipped_missing_columns";
      return result;
    }

    const session = selectAvailableSession({ service, tabs });
    if (!session) {
      result.status = "skipped_no_available_session";
      return result;
    }
    result.selectedSession = {
      sessionId: session.sessionId,
      groupId: session.groupId,
      date: session.date,
      startTime: session.startTime,
      availableSeats: session.availableSeats,
    };

    const duplicateTabs = WRITE_TABS.filter((tab) => hasIdempotencyKey(tabs[tab], idempotencyKey));
    result.duplicateTabs = duplicateTabs;
    if (duplicateTabs.length) {
      result.status = "skipped_duplicate_idempotency_key";
      result.tabResults = WRITE_TABS.map((tab) => ({
        tab,
        operation: "noop",
        reason: duplicateTabs.includes(tab) ? "duplicate_idempotency_key" : "dedupe_guard",
      }));
      return result;
    }

    const valuesByTab = buildRowsByTab({ service, session, idempotencyKey, createdAt });
    result.appendAttempts = WRITE_TABS.length;
    for (const tab of WRITE_TABS) {
      const appendResult = await appendTabRow(
        sheets,
        service.sheetId,
        tab,
        tabs[tab].headers,
        valuesByTab[tab],
      );
      result.appendApplied += appendResult.updatedRows > 0 ? 1 : 0;
      if (appendResult.updatedRange) {
        result.updatedRanges.push(appendResult.updatedRange);
      }
      result.tabResults.push({
        tab,
        operation: "append",
        updatedRows: appendResult.updatedRows,
        updatedRange: appendResult.updatedRange,
      });
    }

    result.status = result.appendApplied === WRITE_TABS.length ? "applied" : "partial_applied";
    return result;
  } catch (error) {
    result.status = result.appendApplied > 0 ? "error_after_partial_write" : "error";
    result.error = sanitizeErrorMessage(error, env);
    return result;
  }
}

export function buildMarkdownReport(result) {
  const lines = [
    "# Maternaly Sheets Live Write Test",
    "",
    `- timestamp: ${result.startedAt}`,
    `- status: ${result.ok ? "ok" : "not_ok"}`,
    `- skipped: ${result.skipped}`,
    `- reason: ${result.reason ?? "n/a"}`,
    `- marker: ${SYNTHETIC_MARKER}`,
    `- trace_id: ${result.idempotencyKey}`,
    `- trace_mode: ${result.idempotencyKeyMode}`,
    `- live_write_attempted: ${result.liveWriteAttempted}`,
    `- append_attempts: ${result.appendAttempts}`,
    `- append_applied: ${result.appendApplied}`,
    "",
    "## Target Sheets",
    "",
    "| service | sheet | configured |",
    "| --- | --- | --- |",
    ...result.validation.targetSheetIds.map(
      (target) =>
        `| ${target.serviceKey} | ${target.redactedSheetId || "missing"} | ${target.configured} |`,
    ),
    "",
    "## Flags",
    "",
    result.validation.missingLiveFlags.length
      ? `Missing/inactive live flags: ${result.validation.missingLiveFlags
          .map((flag) => `${flag.name}=${flag.expected}`)
          .join(", ")}`
      : "All required live flags were active.",
    "",
    "## Services",
    "",
    "| service | sheet | status | tabs_validated | append_attempts | append_applied |",
    "| --- | --- | --- | --- | ---: | ---: |",
    ...(result.services.length
      ? result.services.map(
          (service) =>
            `| ${service.serviceKey} | ${service.redactedSheetId} | ${service.status} | ${service.tabsValidated
              .map((tab) => `${tab.tab}:${tab.ok ? "ok" : "missing_columns"}`)
              .join(", ")} | ${service.appendAttempts} | ${service.appendApplied} |`,
        )
      : ["| n/a | n/a | not_started | n/a | 0 | 0 |"]),
    "",
    "## Notes",
    "",
    "- The script appends only to Clientes_Local, Inscripciones and Interacciones_Chatbot.",
    "- It validates all target headers before writing to a service sheet.",
    "- Reusing MATERNALY_SYNTHETIC_LIVE_WRITE_IDEMPOTENCY_KEY makes the run dedupe on the same key.",
    "- Without that override, each execution creates a new timestamped synthetic key.",
  ];

  return `${lines.join("\n")}\n`;
}

async function writeReport(result, env) {
  const reportDir =
    env.MATERNALY_LIVE_WRITE_TEST_REPORT_DIR?.trim() || path.join(process.cwd(), "reports");
  const fileBase = `maternaly_sheets_live_write_test_${compactIsoTimestamp(new Date(result.startedAt))}`;
  await mkdir(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, `${fileBase}.json`);
  const mdPath = path.join(reportDir, `${fileBase}.md`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(mdPath, buildMarkdownReport(result), "utf8");
  return [jsonPath, mdPath];
}

export async function runLiveWriteTest(options = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const idempotencyKey =
    env.MATERNALY_SYNTHETIC_LIVE_WRITE_IDEMPOTENCY_KEY?.trim() ||
    `${SYNTHETIC_MARKER}_${compactIsoTimestamp(now)}`;
  const validation = validateLiveWriteEnvironment(env);
  const result = {
    ok: false,
    skipped: false,
    reason: validation.primaryReason,
    startedAt: now.toISOString(),
    marker: SYNTHETIC_MARKER,
    idempotencyKey,
    idempotencyKeyMode: env.MATERNALY_SYNTHETIC_LIVE_WRITE_IDEMPOTENCY_KEY?.trim()
      ? "env_override"
      : "generated_timestamp",
    liveWriteAttempted: false,
    appendAttempts: 0,
    appendApplied: 0,
    validation: publicValidation(validation),
    services: [],
    reportPaths: [],
    exitCode: validation.missingLiveFlags.length ? 0 : 1,
  };

  if (!validation.ready) {
    result.skipped = true;
    result.reportPaths = await writeReport(result, env);
    return result;
  }

  let sheets;
  try {
    sheets = options.sheets ?? createSheetsClient(env);
  } catch (error) {
    result.skipped = true;
    result.reason = "google_credentials_invalid";
    result.error = sanitizeErrorMessage(error, env);
    result.reportPaths = await writeReport(result, env);
    return result;
  }

  result.liveWriteAttempted = true;
  for (const service of validation.serviceTargets) {
    const serviceResult = await processService({
      sheets,
      service,
      idempotencyKey,
      createdAt: now.toISOString(),
      env,
    });
    result.services.push(serviceResult);
    result.appendAttempts += serviceResult.appendAttempts;
    result.appendApplied += serviceResult.appendApplied;
  }

  result.skipped = result.services.every((service) => service.appendApplied === 0);
  const successfulStatuses = ["applied", "skipped_duplicate_idempotency_key"];
  const nonFatalSkipStatuses = ["skipped_no_available_session"];
  const allServicesSuccessful =
    result.services.length > 0 &&
    result.services.every((service) => successfulStatuses.includes(service.status));
  const partialSuccess =
    result.appendApplied > 0 &&
    result.services.every((service) =>
      [...successfulStatuses, ...nonFatalSkipStatuses].includes(service.status),
    );

  result.ok = allServicesSuccessful || partialSuccess;
  result.reason = result.ok
    ? result.skipped
      ? "duplicate_idempotency_key"
      : partialSuccess && !allServicesSuccessful
        ? "partial_success"
        : "applied"
    : "service_write_not_applied";
  result.exitCode = result.ok ? 0 : 1;
  result.reportPaths = await writeReport(result, env);
  return result;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  runLiveWriteTest()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            skipped: false,
            liveWriteAttempted: false,
            error: sanitizeErrorMessage(error),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
