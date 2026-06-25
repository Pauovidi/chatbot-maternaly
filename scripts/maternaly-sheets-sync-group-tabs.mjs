#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { google } from "googleapis";
import {
  COLUMN_ALIASES,
  getServiceAccountCredentials,
  normalizeSheetText,
  redactSheetId,
  rowsToObjects,
} from "./maternaly-sheets-live-write-test.mjs";

export { redactSheetId };

const GOOGLE_SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const REQUIRED_TABS = Object.freeze(["Grupos_Ediciones", "Sesiones", "Inscripciones"]);
const OPTIONAL_TABS = Object.freeze(["Clientes_Local"]);
const DEFAULT_PREFIX = "GRP ";
const DEFAULT_RANGE = "A1:AZ2000";
const MAX_TAB_TITLE_LENGTH = 88;
const SUMMARY_HEADERS = Object.freeze([
  "inscripcion_id",
  "cliente_id",
  "nombre",
  "apellidos",
  "telefono",
  "email",
  "grupo_id",
  "servicio_id",
  "fecha_inscripcion",
  "canal_origen",
  "precio_acordado",
  "estado_pago",
  "estado_inscripcion",
  "fpp",
  "fecha_nacimiento_bebe",
  "pareja_nombre",
  "observaciones",
]);

const KNOWN_SERVICES = Object.freeze([
  {
    serviceKey: "charla_embarazo_1_20",
    label: "Charla embarazo 1-20",
    shortLabel: "Charla",
    sheetEnv: "MATERNALY_CHARLA_EMBARAZO_SHEET_ID",
  },
  {
    serviceKey: "taller_blw",
    label: "Taller BLW",
    shortLabel: "BLW",
    sheetEnv: "MATERNALY_BLW_SHEET_ID",
  },
]);

const EXTRA_ALIASES = Object.freeze({
  date: ["fecha", "date", "dia", "día", "fecha_sesion", "fecha_inicio"],
  day: ["dia_semana", "día_semana", "weekday", "dia", "día"],
  startTime: ["hora_inicio", "inicio", "start_time", "hora"],
  endTime: ["hora_fin", "fin", "end_time"],
  clientStatus: ["estado_cliente", "status", "estado"],
  registrationStatus: ["estado_inscripcion", "estado", "status"],
  createdAt: ["fecha_inscripcion", "fecha_alta", "fecha_hora", "created_at", "fecha_creacion"],
  source: ["canal_origen", "canal", "source", "origen", "channel"],
  price: ["precio_acordado", "precio", "price"],
  paymentStatus: ["estado_pago", "payment_status"],
  observations: ["observaciones", "notas", "notes", "notas_privadas"],
});

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

function humanNormalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function stableKey(value) {
  return normalizeSheetText(value);
}

function getAliases(key) {
  return [...(COLUMN_ALIASES[key] ?? []), ...(EXTRA_ALIASES[key] ?? []), key].map(normalizeSheetText);
}

function getCell(row, key) {
  for (const alias of getAliases(key)) {
    const value = row[alias];
    if (value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function getAnyCell(row, aliases) {
  for (const alias of aliases.map(normalizeSheetText)) {
    const value = row[alias];
    if (value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function normalizePhoneForMatch(value) {
  return String(value ?? "").replace(/[^\d+]/g, "").replace(/^\+34/, "");
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "si", "sí"].includes(humanNormalize(value));
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function escapeSheetName(tabTitle) {
  return tabTitle.replace(/'/g, "''");
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

function knownSensitiveValues(env, serviceTargets) {
  return [
    ...serviceTargets.map((service) => service.sheetId),
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

function sanitizeErrorMessage(error, env = process.env, serviceTargets = []) {
  let message = error instanceof Error ? error.message : String(error ?? "unknown_error");
  for (const value of knownSensitiveValues(env, serviceTargets)) {
    message = message.split(String(value)).join("[redacted]");
  }

  return message
    .replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, "[redacted-private-key]")
    .replace(/[A-Za-z0-9_=-]{96,}/g, "[redacted-token]");
}

function serviceTargetsFromEnv(env) {
  const explicitIds = splitCsv(env.MATERNALY_NORMALIZED_SHEET_IDS);
  const explicitServiceIds = splitCsv(env.MATERNALY_NORMALIZED_SERVICE_IDS);
  const byKey = new Map();

  for (const service of KNOWN_SERVICES) {
    const sheetId = env[service.sheetEnv]?.trim() || "";
    if (sheetId) {
      byKey.set(`${service.serviceKey}:${sheetId}`, {
        ...service,
        sheetId,
        source: service.sheetEnv,
      });
    }
  }

  explicitIds.forEach((sheetId, index) => {
    const serviceKey = explicitServiceIds[index] || KNOWN_SERVICES[index]?.serviceKey || `normalized_service_${index + 1}`;
    const known = KNOWN_SERVICES.find((service) => service.serviceKey === serviceKey);
    byKey.set(`${serviceKey}:${sheetId}`, {
      serviceKey,
      label: known?.label || serviceKey,
      shortLabel: known?.shortLabel || serviceKey,
      sheetId,
      source: "MATERNALY_NORMALIZED_SHEET_IDS",
    });
  });

  return Array.from(byKey.values()).filter((service) => service.sheetId);
}

export function validateGroupTabsEnvironment(env = process.env) {
  const mode = env.MATERNALY_GROUP_TABS_SYNC_MODE?.trim() || "dry_run";
  const enabled = parseBoolean(env.MATERNALY_GROUP_TABS_SYNC_ENABLED, false);
  const allowWrite = parseBoolean(env.MATERNALY_GROUP_TABS_SYNC_ALLOW_WRITE, false);
  const includeEmpty = parseBoolean(env.MATERNALY_GROUP_TABS_INCLUDE_EMPTY, false);
  const prefix = env.MATERNALY_GROUP_TABS_PREFIX ?? DEFAULT_PREFIX;
  const serviceTargets = serviceTargetsFromEnv(env);
  const credentialsConfigured = hasGoogleCredential(env);
  const missingSheetIds = KNOWN_SERVICES.filter((service) => !env[service.sheetEnv]?.trim()).map(
    (service) => service.serviceKey,
  );

  let primaryReason = "ready";
  if (!serviceTargets.length) {
    primaryReason = "missing_service_sheet_ids";
  } else if (mode !== "dry_run" && mode !== "live") {
    primaryReason = "invalid_mode";
  } else if (!credentialsConfigured) {
    primaryReason = "google_credentials_missing";
  } else if (mode === "live" && !enabled) {
    primaryReason = "missing_required_live_flags";
  } else if (mode === "live" && !allowWrite) {
    primaryReason = "missing_required_live_flags";
  }

  return {
    ready: primaryReason === "ready",
    primaryReason,
    mode,
    enabled,
    allowWrite,
    includeEmpty,
    prefix,
    credentialsConfigured,
    missingSheetIds,
    serviceTargets,
  };
}

function publicValidation(validation) {
  return {
    ready: validation.ready,
    primaryReason: validation.primaryReason,
    mode: validation.mode,
    enabled: validation.enabled,
    allowWrite: validation.allowWrite,
    includeEmpty: validation.includeEmpty,
    prefix: validation.prefix,
    credentialsConfigured: validation.credentialsConfigured,
    missingSheetIds: validation.missingSheetIds,
    targetSheetIds: validation.serviceTargets.map((service) => ({
      serviceKey: service.serviceKey,
      configured: Boolean(service.sheetId),
      redactedSheetId: redactSheetId(service.sheetId),
    })),
  };
}

async function profileTabs(sheets, sheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    includeGridData: false,
    fields: "sheets.properties(sheetId,title)",
  });

  return new Map(
    response.data.sheets
      ?.map((sheet) => sheet.properties)
      .filter((properties) => properties?.title)
      .map((properties) => [properties.title, properties.sheetId]) ?? [],
  );
}

async function readTabRows(sheets, sheetId, tabTitle) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${escapeSheetName(tabTitle)}'!${DEFAULT_RANGE}`,
    valueRenderOption: "FORMATTED_VALUE",
    majorDimension: "ROWS",
  });

  return rowsToObjects(response.data.values ?? [], tabTitle);
}

async function readServiceSnapshot({ sheets, service }) {
  const existingTabs = await profileTabs(sheets, service.sheetId);
  const missingTabs = REQUIRED_TABS.filter((tab) => !existingTabs.has(tab));
  if (missingTabs.length) {
    return { existingTabs, missingTabs, tabs: {} };
  }

  const tabs = {};
  for (const tab of [...REQUIRED_TABS, ...OPTIONAL_TABS.filter((tab) => existingTabs.has(tab))]) {
    tabs[tab] = await readTabRows(sheets, service.sheetId, tab);
  }

  return { existingTabs, missingTabs, tabs };
}

function buildClientIndexes(clients = []) {
  const byClientId = new Map();
  const byPhone = new Map();

  for (const row of clients) {
    const clientId = getCell(row, "clientId");
    const phone = normalizePhoneForMatch(getCell(row, "phone"));
    if (clientId) {
      byClientId.set(clientId, row);
    }
    if (phone) {
      byPhone.set(phone, row);
    }
  }

  return { byClientId, byPhone };
}

function inferServiceKind(service, group = {}, session = {}) {
  const haystack = humanNormalize(
    [
      service.serviceKey,
      service.label,
      service.shortLabel,
      group.serviceId,
      group.groupName,
      session.serviceId,
      session.sessionName,
    ].join(" "),
  );

  if (haystack.includes("pilates")) {
    return "pilates";
  }
  if (haystack.includes("blw")) {
    return "blw";
  }
  if (haystack.includes("charla") || haystack.includes("embarazo")) {
    return "charla";
  }
  return "generic";
}

function serviceLabelForKind(service, kind) {
  if (kind === "pilates") {
    return "Pilates";
  }
  if (kind === "blw") {
    return "BLW";
  }
  if (kind === "charla") {
    return "Charla";
  }
  return service.shortLabel || service.label || service.serviceKey;
}

function firstFilled(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
}

function normalizeHourForTitle(value) {
  const match = String(value ?? "").match(/(\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return "";
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = match[2] && match[2] !== "00" ? `-${match[2]}` : "";
  return `${hour}${minute}`;
}

function buildHorario({ day, date, startTime, endTime }) {
  const dayOrDate = firstFilled(day, date);
  const timeRange = startTime && endTime ? `${startTime}-${endTime}` : firstFilled(startTime, endTime);
  return [dayOrDate, timeRange].filter(Boolean).join(" ");
}

function sanitizeTabTitle(title, maxLength = MAX_TAB_TITLE_LENGTH) {
  const safe = String(title ?? "")
    .replace(/[\[\]\*\/\\\?:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (safe || "GRP grupo").slice(0, maxLength).trim();
}

function shortCollisionSuffix(groupId) {
  const normalized = normalizeSheetText(groupId).replace(/_/g, "");
  return normalized ? normalized.slice(-8) : "grupo";
}

export function buildGroupTabTitle({ prefix = DEFAULT_PREFIX, service, group, session, usedTitles = new Set() }) {
  const kind = inferServiceKind(service, group, session);
  const serviceLabel = serviceLabelForKind(service, kind);
  const center = firstFilled(group.center, session.center);
  const date = firstFilled(session.date, group.date);
  const startTime = firstFilled(session.startTime, group.startTime);
  const hour = normalizeHourForTitle(startTime);

  let rawTitle;
  if (kind === "pilates") {
    rawTitle = [prefix.trimEnd(), serviceLabel, center, hour].filter(Boolean).join(" ");
  } else if (kind === "blw" || kind === "charla") {
    rawTitle = [prefix.trimEnd(), serviceLabel, center, date].filter(Boolean).join(" ");
  } else {
    rawTitle = [prefix.trimEnd(), serviceLabel, firstFilled(group.groupName, group.groupId), center, date || hour]
      .filter(Boolean)
      .join(" ");
  }

  let title = sanitizeTabTitle(rawTitle);
  if (!title.startsWith(prefix.trimEnd())) {
    title = sanitizeTabTitle(`${prefix}${title}`);
  }

  if (usedTitles.has(title)) {
    const suffix = shortCollisionSuffix(group.groupId);
    const baseMax = Math.max(MAX_TAB_TITLE_LENGTH - suffix.length - 1, 20);
    title = sanitizeTabTitle(`${title.slice(0, baseMax).trim()} ${suffix}`);
  }

  usedTitles.add(title);
  return title;
}

function groupSortKey(plan) {
  const kind = plan.serviceKind;
  if (kind === "pilates") {
    return [
      stableKey(plan.center),
      stableKey(plan.day),
      stableKey(plan.startTime),
      stableKey(plan.groupName),
      stableKey(plan.groupId),
    ].join("|");
  }

  return [
    stableKey(plan.date),
    stableKey(plan.startTime),
    stableKey(plan.center),
    stableKey(plan.groupName),
    stableKey(plan.groupId),
  ].join("|");
}

function buildGroupFromRow(row) {
  return {
    groupId: getCell(row, "groupId"),
    groupName: getCell(row, "groupName"),
    serviceId: getCell(row, "serviceId"),
    center: getCell(row, "center"),
    modality: getCell(row, "modality"),
    capacity: parsePositiveInteger(getCell(row, "capacityTotal")),
    status: getCell(row, "status"),
    date: getCell(row, "date"),
    day: getCell(row, "day"),
    startTime: getCell(row, "startTime"),
    endTime: getCell(row, "endTime"),
  };
}

function buildSessionFromRow(row) {
  return {
    sessionId: getCell(row, "sessionId"),
    groupId: getCell(row, "groupId"),
    serviceId: getCell(row, "serviceId"),
    sessionName: getCell(row, "sessionName"),
    center: getCell(row, "center"),
    modality: getCell(row, "modality"),
    capacity: parsePositiveInteger(getCell(row, "capacityTotal")),
    date: getCell(row, "date"),
    day: getCell(row, "day"),
    startTime: getCell(row, "startTime"),
    endTime: getCell(row, "endTime"),
    status: getCell(row, "status"),
  };
}

function selectPrimarySession(group, sessions) {
  return [...sessions].sort((left, right) => {
    const leftKey = [stableKey(left.date), stableKey(left.startTime), stableKey(left.sessionId)].join("|");
    const rightKey = [stableKey(right.date), stableKey(right.startTime), stableKey(right.sessionId)].join("|");
    return leftKey.localeCompare(rightKey);
  })[0] ?? {
    groupId: group.groupId,
    serviceId: group.serviceId,
  };
}

function enrichRegistration(row, clientIndexes) {
  const clientId = getCell(row, "clientId");
  const phone = normalizePhoneForMatch(getCell(row, "phone"));
  const client = (clientId && clientIndexes.byClientId.get(clientId)) || (phone && clientIndexes.byPhone.get(phone)) || {};
  const fullName = firstFilled(getCell(row, "fullName"), getCell(client, "fullName"));
  const firstName = firstFilled(getCell(row, "firstName"), getCell(client, "firstName"), fullName.split(/\s+/)[0]);
  const lastName = firstFilled(
    getCell(row, "lastName"),
    getCell(client, "lastName"),
    fullName.split(/\s+/).slice(1).join(" "),
  );

  return {
    inscripcion_id: getCell(row, "registrationId"),
    cliente_id: clientId,
    nombre: firstName,
    apellidos: lastName,
    telefono: firstFilled(getCell(row, "phone"), getCell(client, "phone")),
    email: firstFilled(getCell(row, "email"), getCell(client, "email")),
    grupo_id: getCell(row, "groupId"),
    servicio_id: getCell(row, "serviceId"),
    fecha_inscripcion: getCell(row, "createdAt"),
    canal_origen: getCell(row, "source"),
    precio_acordado: getCell(row, "price"),
    estado_pago: getCell(row, "paymentStatus"),
    estado_inscripcion: getCell(row, "registrationStatus"),
    fpp: getCell(row, "fppOrDueDate"),
    fecha_nacimiento_bebe: getCell(row, "babyBirthDate"),
    pareja_nombre: getCell(row, "partnerName"),
    observaciones: getAnyCell(row, EXTRA_ALIASES.observations),
  };
}

export function buildGroupPlans({ service, tabs, prefix = DEFAULT_PREFIX, includeEmpty = false, now = new Date() }) {
  const groupsById = new Map();
  const sessionsByGroupId = new Map();
  const registrationsByGroupId = new Map();
  const clientIndexes = buildClientIndexes(tabs.Clientes_Local?.rows ?? []);

  for (const row of tabs.Grupos_Ediciones?.rows ?? []) {
    const group = buildGroupFromRow(row);
    if (group.groupId) {
      groupsById.set(group.groupId, group);
    }
  }

  for (const row of tabs.Sesiones?.rows ?? []) {
    const session = buildSessionFromRow(row);
    if (!session.groupId) {
      continue;
    }
    if (!sessionsByGroupId.has(session.groupId)) {
      sessionsByGroupId.set(session.groupId, []);
    }
    sessionsByGroupId.get(session.groupId).push(session);
    if (!groupsById.has(session.groupId)) {
      groupsById.set(session.groupId, {
        groupId: session.groupId,
        groupName: session.sessionName || session.groupId,
        serviceId: session.serviceId,
      });
    }
  }

  for (const row of tabs.Inscripciones?.rows ?? []) {
    const groupId = getCell(row, "groupId");
    if (!groupId) {
      continue;
    }
    if (!registrationsByGroupId.has(groupId)) {
      registrationsByGroupId.set(groupId, []);
    }
    registrationsByGroupId.get(groupId).push(row);
    if (!groupsById.has(groupId)) {
      groupsById.set(groupId, {
        groupId,
        groupName: groupId,
        serviceId: getCell(row, "serviceId"),
      });
    }
  }

  const usedTitles = new Set();
  const plans = [];
  for (const group of groupsById.values()) {
    const registrations = registrationsByGroupId.get(group.groupId) ?? [];
    if (!includeEmpty && registrations.length === 0) {
      continue;
    }

    const sessions = sessionsByGroupId.get(group.groupId) ?? [];
    const session = selectPrimarySession(group, sessions);
    const serviceKind = inferServiceKind(service, group, session);
    const groupName = firstFilled(group.groupName, session.sessionName, group.groupId);
    const center = firstFilled(group.center, session.center);
    const modality = firstFilled(group.modality, session.modality);
    const date = firstFilled(group.date, session.date);
    const day = firstFilled(group.day, session.day);
    const startTime = firstFilled(group.startTime, session.startTime);
    const endTime = firstFilled(group.endTime, session.endTime);
    const capacity = group.capacity ?? session.capacity ?? "";
    const tabTitle = buildGroupTabTitle({ prefix, service, group: { ...group, groupName, center }, session, usedTitles });
    const rows = registrations.map((registration) => enrichRegistration(registration, clientIndexes));

    plans.push({
      groupId: group.groupId,
      groupName,
      serviceId: firstFilled(group.serviceId, session.serviceId, service.serviceKey),
      serviceLabel: serviceLabelForKind(service, serviceKind),
      serviceKind,
      center,
      modality,
      date,
      day,
      startTime,
      endTime,
      horario: buildHorario({ day, date, startTime, endTime }),
      capacity,
      tabTitle,
      registrationsCount: rows.length,
      rows,
      generatedAt: now.toISOString(),
    });
  }

  return plans.sort((left, right) => groupSortKey(left).localeCompare(groupSortKey(right)));
}

function rowValuesForPlan(plan) {
  return plan.rows.map((row) => SUMMARY_HEADERS.map((header) => row[header] ?? ""));
}

export function buildTabValues(plan) {
  return [
    [`Inscripciones — ${plan.groupName}`],
    [
      "Servicio",
      plan.serviceLabel,
      "Centro",
      plan.center,
      "Modalidad",
      plan.modality,
      "Horario",
      plan.horario,
      "Fecha",
      plan.date,
      "Capacidad",
      String(plan.capacity ?? ""),
      "Actualizado",
      plan.generatedAt,
      "Fuente",
      "Inscripciones",
    ],
    ["VISTA GENERADA AUTOMÁTICAMENTE. Editar la pestaña Inscripciones como fuente de verdad."],
    [...SUMMARY_HEADERS],
    ...rowValuesForPlan(plan),
  ];
}

function color(red, green, blue) {
  return { red, green, blue };
}

export function buildFormatRequests(sheetId, columnCount, rowCount) {
  const fullWidth = {
    sheetId,
    startColumnIndex: 0,
    endColumnIndex: columnCount,
  };

  return [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 4 },
        },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: { ...fullWidth, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: color(0.05, 0.23, 0.28),
            textFormat: { foregroundColor: color(1, 1, 1), bold: true },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { ...fullWidth, startRowIndex: 1, endRowIndex: 3 },
        cell: {
          userEnteredFormat: {
            backgroundColor: color(0.93, 0.98, 0.98),
            textFormat: { foregroundColor: color(0.02, 0.12, 0.14), bold: false },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { ...fullWidth, startRowIndex: 3, endRowIndex: 4 },
        cell: {
          userEnteredFormat: {
            backgroundColor: color(0.02, 0.45, 0.42),
            textFormat: { foregroundColor: color(1, 1, 1), bold: true },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { ...fullWidth, startRowIndex: 4, endRowIndex: Math.max(rowCount, 5) },
        cell: {
          userEnteredFormat: {
            textFormat: { foregroundColor: color(0, 0, 0) },
          },
        },
        fields: "userEnteredFormat.textFormat.foregroundColor",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: columnCount,
        },
      },
    },
  ];
}

async function ensureSheet({ sheets, spreadsheetId, tabTitle, existingTabs }) {
  const existingSheetId = existingTabs.get(tabTitle);
  if (existingSheetId !== undefined && existingSheetId !== null) {
    return { sheetId: existingSheetId, created: false };
  }

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title: tabTitle },
          },
        },
      ],
    },
  });
  const sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    const refreshedTabs = await profileTabs(sheets, spreadsheetId);
    const refreshedSheetId = refreshedTabs.get(tabTitle);
    if (refreshedSheetId === undefined || refreshedSheetId === null) {
      throw new Error(`add_sheet_missing_reply:${tabTitle}`);
    }
    existingTabs.set(tabTitle, refreshedSheetId);
    return { sheetId: refreshedSheetId, created: true };
  }

  existingTabs.set(tabTitle, sheetId);
  return { sheetId, created: true };
}

async function applyGroupTab({ sheets, spreadsheetId, plan, existingTabs }) {
  const ensured = await ensureSheet({ sheets, spreadsheetId, tabTitle: plan.tabTitle, existingTabs });
  const values = buildTabValues(plan);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${escapeSheetName(plan.tabTitle)}'!A:AZ`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${escapeSheetName(plan.tabTitle)}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: buildFormatRequests(ensured.sheetId, SUMMARY_HEADERS.length, values.length),
    },
  });

  return { created: ensured.created, updated: !ensured.created, rowsWritten: values.length };
}

async function processService({ sheets, service, validation, now, env }) {
  const result = {
    serviceKey: service.serviceKey,
    label: service.label,
    redactedSheetId: redactSheetId(service.sheetId),
    status: "pending",
    missingTabs: [],
    parseErrors: [],
    groups: [],
    tabsCreated: 0,
    tabsUpdated: 0,
    writesApplied: 0,
    warnings: [],
  };

  try {
    const snapshot = await readServiceSnapshot({ sheets, service });
    result.missingTabs = snapshot.missingTabs;
    if (snapshot.missingTabs.length) {
      result.status = "skipped_missing_tabs";
      return result;
    }

    result.parseErrors = Object.entries(snapshot.tabs)
      .filter(([, tab]) => tab.parseError)
      .map(([tab, parsed]) => ({ tab, error: parsed.parseError }));
    if (result.parseErrors.length) {
      result.status = "skipped_header_not_found";
      return result;
    }

    const plans = buildGroupPlans({
      service,
      tabs: snapshot.tabs,
      prefix: validation.prefix,
      includeEmpty: validation.includeEmpty,
      now,
    });
    result.groups = plans.map((plan) => ({
      groupId: plan.groupId,
      groupName: plan.groupName,
      tabTitle: plan.tabTitle,
      registrationsCount: plan.registrationsCount,
      serviceKind: plan.serviceKind,
      center: plan.center,
      date: plan.date,
      startTime: plan.startTime,
    }));

    if (validation.mode === "dry_run") {
      result.status = "dry_run";
      return result;
    }

    for (const plan of plans) {
      const write = await applyGroupTab({
        sheets,
        spreadsheetId: service.sheetId,
        plan,
        existingTabs: snapshot.existingTabs,
      });
      result.tabsCreated += write.created ? 1 : 0;
      result.tabsUpdated += write.updated ? 1 : 0;
      result.writesApplied += 1;
    }

    result.status = "applied";
    return result;
  } catch (error) {
    result.status = result.writesApplied > 0 ? "error_after_partial_write" : "error";
    result.error = sanitizeErrorMessage(error, env, validation.serviceTargets);
    return result;
  }
}

export function buildMarkdownReport(result) {
  const lines = [
    "# Maternaly Sheets Group Tabs Sync",
    "",
    `- timestamp: ${result.startedAt}`,
    `- status: ${result.ok ? "ok" : "not_ok"}`,
    `- skipped: ${result.skipped}`,
    `- reason: ${result.reason ?? "n/a"}`,
    `- mode: ${result.mode}`,
    `- live_write_attempted: ${result.liveWriteAttempted}`,
    `- writes_applied: ${result.writesApplied}`,
    `- prefix: ${result.validation.prefix}`,
    `- include_empty: ${result.validation.includeEmpty}`,
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
    "## Services",
    "",
    "| service | sheet | status | groups | created | updated |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...(result.services.length
      ? result.services.map(
          (service) =>
            `| ${service.serviceKey} | ${service.redactedSheetId} | ${service.status} | ${service.groups.length} | ${service.tabsCreated} | ${service.tabsUpdated} |`,
        )
      : ["| n/a | n/a | not_started | 0 | 0 | 0 |"]),
    "",
    "## Generated Tabs",
    "",
    "| service | group_id | tab | inscriptions | center | date | hour |",
    "| --- | --- | --- | ---: | --- | --- | --- |",
    ...result.services.flatMap((service) =>
      service.groups.length
        ? service.groups.map(
            (group) =>
              `| ${service.serviceKey} | ${group.groupId} | ${group.tabTitle} | ${group.registrationsCount} | ${group.center || ""} | ${group.date || ""} | ${group.startTime || ""} |`,
          )
        : [`| ${service.serviceKey} | n/a | n/a | 0 |  |  |  |`],
    ),
    "",
    "## Notes",
    "",
    "- Source of truth remains Inscripciones.",
    "- Generated group tabs are views managed only when their title starts with the configured prefix.",
    "- Dry-run mode does not call batchUpdate, values.clear or values.update.",
  ];

  return `${lines.join("\n")}\n`;
}

async function writeReport(result, env) {
  const reportDir = env.MATERNALY_GROUP_TABS_REPORT_DIR?.trim() || path.join(process.cwd(), "reports");
  const fileBase = `maternaly_group_tabs_sync_${compactIsoTimestamp(new Date(result.startedAt))}`;
  await mkdir(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, `${fileBase}.json`);
  const mdPath = path.join(reportDir, `${fileBase}.md`);
  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(mdPath, buildMarkdownReport(result), "utf8");
  return [jsonPath, mdPath];
}

export async function runGroupTabsSync(options = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const validation = validateGroupTabsEnvironment(env);
  const result = {
    ok: false,
    skipped: false,
    reason: validation.primaryReason,
    startedAt: now.toISOString(),
    mode: validation.mode,
    liveWriteAttempted: false,
    writesApplied: 0,
    validation: publicValidation(validation),
    services: [],
    reportPaths: [],
    exitCode: 0,
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
    result.error = sanitizeErrorMessage(error, env, validation.serviceTargets);
    result.reportPaths = await writeReport(result, env);
    return result;
  }

  result.liveWriteAttempted = validation.mode === "live";
  for (const service of validation.serviceTargets) {
    const serviceResult = await processService({
      sheets,
      service,
      validation,
      now,
      env,
    });
    result.services.push(serviceResult);
    result.writesApplied += serviceResult.writesApplied;
  }

  const fatalStatuses = new Set(["error", "error_after_partial_write", "skipped_missing_tabs", "skipped_header_not_found"]);
  const hasFatalStatus = result.services.some((service) => fatalStatuses.has(service.status));
  result.ok = result.services.length > 0 && !hasFatalStatus;
  result.skipped = result.services.every((service) => service.writesApplied === 0);
  result.reason = result.ok
    ? validation.mode === "dry_run"
      ? "dry_run"
      : "applied"
    : "service_sync_not_applied";
  result.exitCode = result.ok ? 0 : 1;
  result.reportPaths = await writeReport(result, env);
  return result;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  runGroupTabsSync()
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
