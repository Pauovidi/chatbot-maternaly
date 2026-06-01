export type GoogleSheetsAccessMode = "read_only" | "dry_run" | "live";
export type WhatsAppProviderMode = "ycloud" | "mock" | "twilio";
export type LlmProviderMode = "openai" | "mock";

const DEFAULT_SHEET_IDS = [
  "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI",
  "1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do",
];

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function boolFromEnv(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function splitCsv(value: string | undefined): string[] {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [...DEFAULT_SHEET_IDS];
}

export interface MaternalyRuntimeConfig {
  appName: string;
  appEnv: string;
  appBaseUrl?: string;
  whatsappProvider: WhatsAppProviderMode;
  sheetsAccessMode: GoogleSheetsAccessMode;
  liveSheetsWriteEnabled: boolean;
  sheetIds: string[];
  llmProvider: LlmProviderMode;
  llmModel?: string;
  panelAdminUsername?: string;
    configured: {
      database: boolean;
      ycloud: boolean;
      ycloudWebhookSecret: boolean;
      twilio: boolean;
      twilioFrom: boolean;
      twilioWebhookToken: boolean;
      googleSheets: boolean;
      llm: boolean;
    };
}

export function readMaternalyRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): MaternalyRuntimeConfig {
  const llmProvider = oneOf(env.LLM_PROVIDER, ["openai", "mock"] as const, "mock");

  return {
    appName: env.APP_NAME?.trim() || "Maternaly",
    appEnv: env.APP_ENV?.trim() || env.NODE_ENV || "development",
    appBaseUrl: env.APP_BASE_URL?.trim() || undefined,
    whatsappProvider: oneOf(
      env.WHATSAPP_PROVIDER,
      ["ycloud", "mock", "twilio"] as const,
      "mock",
    ),
    sheetsAccessMode: oneOf(
      env.GOOGLE_SHEETS_ACCESS_MODE,
      ["read_only", "dry_run", "live"] as const,
      "dry_run",
    ),
    liveSheetsWriteEnabled: boolFromEnv(env.BOT_SHEETS_LIVE_WRITE_ENABLED, false),
    sheetIds: splitCsv(env.MATERNALY_SHEET_IDS),
    llmProvider,
    llmModel: env.LLM_MODEL?.trim() || undefined,
    panelAdminUsername:
      env.PANEL_ADMIN_USERNAME?.trim() || env.HOTEL_PANEL_USERNAME?.trim() || undefined,
    configured: {
      database: Boolean(env.DATABASE_URL?.trim()),
      ycloud: Boolean(env.YCLOUD_API_KEY?.trim()),
      ycloudWebhookSecret: Boolean(env.YCLOUD_WEBHOOK_SECRET?.trim()),
      twilio: Boolean(
        env.TWILIO_ACCOUNT_SID?.trim() &&
          env.TWILIO_AUTH_TOKEN?.trim() &&
          (env.TWILIO_WHATSAPP_FROM?.trim() || env.TWILIO_MESSAGING_SERVICE_SID?.trim()),
      ),
      twilioFrom: Boolean(env.TWILIO_WHATSAPP_FROM?.trim()),
      twilioWebhookToken: Boolean(env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim()),
      googleSheets: Boolean(
        env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
          env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
      ),
      llm: llmProvider === "mock" || Boolean(env.OPENAI_API_KEY?.trim()),
    },
  };
}

export function getGoogleServiceAccountJson(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const base64 = env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (base64) {
    return Buffer.from(base64, "base64").toString("utf8");
  }

  return null;
}
