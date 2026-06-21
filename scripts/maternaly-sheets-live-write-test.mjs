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
  date: ["fecha", "date", "dia"],
  startTime: ["hora_inicio", "inicio", "start_time", "hora"],
  endTime: ["hora_fin", "fin", "end_time"],
  capacityTotal: ["capacidad_total", "capacidad", "cupo", "plazas_totales"],
  status: ["estado", "status"],
  clientId: ["cliente_id", "client_id", "id_cliente"],
  fullName: ["nombre_completo", "nombre", "full_name", "contacto"],
  phone: ["telefono", "teléfono", "phone", "whatsapp", "movil", "móvil"],
  email: ["email", "correo", "mail"],
  peopleCount: ["people_count", "personas", "plazas", "cantidad"],
  pregnancyWeek: ["semana_embarazo", "semana", "pregnancy_week"],
  idempotencyKey: ["idempotency_key", "clave_idempotencia", "external_id", "id_externo"],
  createdAt: ["created_at", "fecha_creacion", "creado_en"],
  source: ["source", "origen", "canal", "channel"],
  notes: ["notas", "observaciones", "notes"],
  event: ["evento", "event"],
  mode: ["mode", "modo"],
  blockedReasons: ["blocked_reasons", "motivos_bloqueo"],
});

export const TAB_REQUIRED_COLUMNS = Object.freeze({
  Clientes_Local: ["fullName", "phone", "email", "idempotencyKey"],
  Inscripciones: [
    "serviceId",
    "sessionId",
    "status",
    "fullName",
    "phone",
    "email",
    "peopleCount",
    "idempotencyKey",
    "source",
    "notes",
  ],
  Interacciones_Chatbot: ["idempotencyKey", "createdAt", "event"],
});

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

export function validateRequiredColumns(headers, requiredKeys) {
  return requiredKeys.filter((key) => findColumnIndex(headers, key) === -1);
}

function coerceRows(values) {
  return (values ?? []).map((row) => row.map((cell) => String(cell ?? "").trim()));
}

export function rowsToObjects(values) {
  const rows = coerceRows(values);
  const headerIndex = rows.findIndex((row) => row.some(Boolean));
  const headers = headerIndex >= 0 ? rows[headerIndex] : [];
  const normalizedHeaders = headers.map(normalizeSheetText);
  const body = headerIndex >= 0 ? rows.slice(headerIndex + 1) : [];

  return {
    headers,
    normalizedHeaders,
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
  const byAlias = new Map();
  for (const [key, value] of Object.entries(values)) {
    for (const alias of getAliases(key)) {
      byAlias.set(normalizeSheetText(alias), value);
    }
  }

  return headers.map((header) => byAlias.get(normalizeSheetText(header)) ?? "");
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
  return !status || !NON_OCCUPYING_STATUSES.some((item) => status.includes(item));
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
    const capacityTotal =
      parsePositiveInteger(getCell(row, "capacityTotal")) ?? group?.capacityTotal;
    if (capacityTotal === undefined) {
      continue;
    }

    const occupied = calculateSessionOccupancy(tabs.Inscripciones.rows, sessionId, groupId);
    const availableSeats = Math.max(capacityTotal - occupied, 0);
    if (availableSeats < service.peopleCount) {
      continue;
    }

    return {
      groupId,
      groupName: group?.groupName || groupId,
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
  return tabSnapshot.rows.some((row) => getCell(row, "idempotencyKey") === idempotencyKey);
}

function buildSyntheticValues({ service, session, idempotencyKey, createdAt }) {
  const notes = [
    SYNTHETIC_MARKER,
    "no_cliente_real",
    service.serviceKey,
    "synthetic_live_write_test",
  ].join(" | ");

  return {
    serviceId: service.serviceKey,
    serviceName: service.label,
    groupId: session.groupId,
    groupName: session.groupName,
    sessionId: session.sessionId,
    sessionName: session.sessionName,
    date: session.date,
    startTime: session.startTime,
    status: "Preinscrita",
    fullName: SYNTHETIC_NAME,
    phone: SYNTHETIC_PHONE,
    email: SYNTHETIC_EMAIL,
    peopleCount: service.peopleCount,
    pregnancyWeek: service.pregnancyWeek,
    idempotencyKey,
    createdAt,
    source: SYNTHETIC_SOURCE,
    notes,
    event: SYNTHETIC_SOURCE,
    mode: "live",
    blockedReasons: "",
  };
}

function buildRowsByTab({ service, session, idempotencyKey, createdAt }) {
  const base = buildSyntheticValues({ service, session, idempotencyKey, createdAt });
  return {
    Clientes_Local: {
      ...base,
      event: "codex_live_write_test_client",
    },
    Inscripciones: {
      ...base,
      event: "codex_live_write_test_registration",
    },
    Interacciones_Chatbot: {
      ...base,
      status: "applied",
      event: "codex_live_write_test_interaction",
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
  return rowsToObjects(response.data.values ?? []);
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

    const missingColumns = [];
    for (const tab of WRITE_TABS) {
      const missing = validateRequiredColumns(tabs[tab].headers, TAB_REQUIRED_COLUMNS[tab]);
      result.tabsValidated.push({
        tab,
        headersFound: tabs[tab].headers.length,
        ok: missing.length === 0,
      });
      for (const column of missing) {
        missingColumns.push({ tab, column });
      }
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
    `- idempotency_key: ${result.idempotencyKey}`,
    `- idempotency_mode: ${result.idempotencyKeyMode}`,
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
  result.ok = result.services.length > 0 && result.services.every((service) =>
    ["applied", "skipped_duplicate_idempotency_key"].includes(service.status),
  );
  result.reason = result.ok
    ? result.skipped
      ? "duplicate_idempotency_key"
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
