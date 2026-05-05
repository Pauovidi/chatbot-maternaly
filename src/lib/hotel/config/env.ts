import { HOTEL_DEMO_CONFIG, HOTEL_FEATURE_FLAGS } from "./hotel-config";
import { getSheetsAdapterContextFromEnv } from "./sheets";
import type { HotelFeatureFlags } from "../domain/contracts";

export interface GoogleSheetsConfigStatus {
  mode: "mock" | "real";
  activeAdapter: "mock" | "real";
  isReady: boolean;
  reason: string;
  missing: string[];
  spreadsheetId?: string;
  spreadsheetIdSummary?: string;
  authMode: "service_account" | "access_token" | "missing";
  connectionStatus?: "unknown" | "ok" | "error";
  connectionReason?: string;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readBooleanEnvAliases(
  names: string[],
  fallback: boolean,
): boolean {
  for (const name of names) {
    if (process.env[name] !== undefined) {
      return readBooleanEnv(name, fallback);
    }
  }

  return fallback;
}

function readOptionalBooleanEnvAliases(
  names: string[],
): boolean | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value === undefined) {
      continue;
    }

    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  return undefined;
}

function readStringEnvAliases(
  names: string[],
  fallback: string,
): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return fallback;
}

function summarizeSpreadsheetId(spreadsheetId: string | undefined): string | undefined {
  if (!spreadsheetId) {
    return undefined;
  }

  if (spreadsheetId.length <= 10) {
    return spreadsheetId;
  }

  return `${spreadsheetId.slice(0, 6)}...${spreadsheetId.slice(-4)}`;
}

export function getGoogleSheetsConfigStatus(): GoogleSheetsConfigStatus {
  const explicitMode = readOptionalBooleanEnvAliases([
    "HOTEL_USE_GOOGLE_SHEETS_REAL",
    "HOTEL_USE_REAL_GOOGLE_SHEETS",
  ]);
  const context = getSheetsAdapterContextFromEnv("real");
  const hasSpreadsheetId = Boolean(context.spreadsheetId?.trim());
  const hasAccessToken = Boolean(context.accessToken?.trim());
  const hasServiceAccount = Boolean(context.serviceAccountJson?.trim());
  const missing: string[] = [];

  if (!hasSpreadsheetId) {
    missing.push("HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID");
  }

  if (!hasServiceAccount && !hasAccessToken) {
    missing.push(
      "service account de Google Sheets (HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON o email + private key)",
    );
  }

  const spreadsheetId = context.spreadsheetId?.trim();
  const spreadsheetIdSummary = summarizeSpreadsheetId(spreadsheetId);
  const authMode = hasServiceAccount
    ? "service_account"
    : hasAccessToken
      ? "access_token"
      : "missing";

  if (explicitMode === false) {
    return {
      mode: "mock",
      activeAdapter: "mock",
      isReady: false,
      reason: "Google Sheets real está desactivado por configuración.",
      missing,
      spreadsheetId,
      spreadsheetIdSummary,
      authMode,
    };
  }

  if (missing.length > 0) {
    return {
      mode: "mock",
      activeAdapter: "mock",
      isReady: false,
      reason: `Google Sheets real no está listo: falta ${missing.join(" y ")}.`,
      missing,
      spreadsheetId,
      spreadsheetIdSummary,
      authMode,
    };
  }

  return {
    mode: "real",
    activeAdapter: "real",
    isReady: true,
    reason: "Google Sheets real está listo y el adapter activo es real.",
    missing: [],
    spreadsheetId,
    spreadsheetIdSummary,
    authMode,
  };
}

export function getHotelFeatureFlags(): HotelFeatureFlags {
  const googleSheetsStatus = getGoogleSheetsConfigStatus();

  return {
    useMockEmailInput: readBooleanEnvAliases(
      ["HOTEL_USE_MOCK_EMAIL_INPUT"],
      HOTEL_FEATURE_FLAGS.useMockEmailInput,
    ),
    useMockWhatsappSend: readBooleanEnvAliases(
      ["HOTEL_USE_MOCK_WHATSAPP_SEND", "HOTEL_USE_MOCK_WHATSAPP"],
      HOTEL_FEATURE_FLAGS.useMockWhatsappSend,
    ),
    useGoogleSheetsReal: googleSheetsStatus.isReady,
    useRemindersReal: readBooleanEnvAliases(
      ["HOTEL_USE_REMINDERS_REAL", "HOTEL_USE_REAL_REMINDERS"],
      HOTEL_FEATURE_FLAGS.useRemindersReal,
    ),
    useDemoPersistence: readBooleanEnvAliases(
      ["HOTEL_USE_DEMO_PERSISTENCE", "HOTEL_USE_MOCK_PERSISTENCE"],
      HOTEL_FEATURE_FLAGS.useDemoPersistence,
    ),
  };
}

export function getHotelRuntimeConfig() {
  const bookingFormUrl = readStringEnvAliases(
    ["HOTEL_BOOKING_FORM_URL", "NEXT_PUBLIC_FORM_URL"],
    HOTEL_DEMO_CONFIG.bookingFormUrl,
  );
  const whatsappUrl = readStringEnvAliases(
    ["HOTEL_WHATSAPP_URL"],
    HOTEL_DEMO_CONFIG.whatsappUrl,
  );
  const whatsappPhone = readStringEnvAliases(
    ["HOTEL_WHATSAPP_PHONE", "WHATSAPP_PHONE_NUMBER"],
    HOTEL_DEMO_CONFIG.whatsappPhone,
  );
  const timezone = readStringEnvAliases(
    ["HOTEL_TIMEZONE"],
    HOTEL_DEMO_CONFIG.defaultTimezone,
  );
  const reminderLeadHours = Number(
    readStringEnvAliases(
      ["HOTEL_REMINDER_LEAD_HOURS"],
      String(HOTEL_DEMO_CONFIG.reminderLeadHours),
    ),
  );

  return {
    ...HOTEL_DEMO_CONFIG,
    bookingFormUrl,
    whatsappUrl,
    whatsappPhone,
    defaultTimezone: timezone,
    reminderLeadHours: Number.isFinite(reminderLeadHours) ? reminderLeadHours : HOTEL_DEMO_CONFIG.reminderLeadHours,
  };
}
