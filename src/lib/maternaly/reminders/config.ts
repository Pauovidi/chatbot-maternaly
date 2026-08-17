import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";

function readBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function readBatchSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "50", 10);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
}

const TWILIO_CONTENT_SID = /^HX[a-fA-F0-9]{32}$/;

export interface MaternalyReminderRuntimeConfig {
  enabled: boolean;
  databaseUrl?: string;
  batchSize: number;
  twilio: {
    accountSid?: string;
    authToken?: string;
    from?: string;
    messagingServiceSid?: string;
    statusCallbackUrl?: string;
    contentSidOnline?: string;
    contentSidPresencial?: string;
  };
  missing: string[];
  ready: boolean;
}

export function readMaternalyReminderRuntimeConfig(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): MaternalyReminderRuntimeConfig {
  const maternaly = readMaternalyRuntimeConfig(env as NodeJS.ProcessEnv);
  const enabled = readBoolean(env.MATERNALY_REMINDERS_ENABLED);
  const twilio = {
    accountSid: env.TWILIO_ACCOUNT_SID?.trim() || undefined,
    authToken: env.TWILIO_AUTH_TOKEN?.trim() || undefined,
    from: env.TWILIO_WHATSAPP_FROM?.trim() || undefined,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined,
    statusCallbackUrl: env.TWILIO_STATUS_CALLBACK_URL?.trim() || undefined,
    contentSidOnline:
      env.MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE?.trim() || undefined,
    contentSidPresencial:
      env.MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL?.trim() || undefined,
  };
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  const missing: string[] = [];

  if (!enabled) {
    missing.push("MATERNALY_REMINDERS_ENABLED=true");
  }
  if (!env.MATERNALY_ADMIN_TASK_TOKEN?.trim()) {
    missing.push("MATERNALY_ADMIN_TASK_TOKEN");
  }
  if (!databaseUrl) {
    missing.push("DATABASE_URL");
  }
  if (!twilio.accountSid) {
    missing.push("TWILIO_ACCOUNT_SID");
  }
  if (!twilio.authToken) {
    missing.push("TWILIO_AUTH_TOKEN");
  }
  if (!twilio.from && !twilio.messagingServiceSid) {
    missing.push("TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID");
  }
  if (!twilio.contentSidOnline) {
    missing.push("MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE");
  } else if (!TWILIO_CONTENT_SID.test(twilio.contentSidOnline)) {
    missing.push("MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE (invalid ContentSid)");
  }
  if (!twilio.contentSidPresencial) {
    missing.push("MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL");
  } else if (!TWILIO_CONTENT_SID.test(twilio.contentSidPresencial)) {
    missing.push("MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL (invalid ContentSid)");
  }
  if (!maternaly.normalizedSheets.enabled) {
    missing.push("MATERNALY_NORMALIZED_SHEETS_ENABLED=true");
  }
  if (!maternaly.normalizedSheets.serviceIds.includes("charla_embarazo_1_20")) {
    missing.push("MATERNALY_NORMALIZED_SERVICE_IDS includes charla_embarazo_1_20");
  }
  if (!maternaly.normalizedSheets.serviceSheetIds.charla_embarazo_1_20) {
    missing.push("MATERNALY_CHARLA_EMBARAZO_SHEET_ID");
  }
  if (!maternaly.configured.googleSheets) {
    missing.push("Google Sheets service account credentials");
  }

  return {
    enabled,
    databaseUrl,
    batchSize: readBatchSize(env.MATERNALY_REMINDER_DISPATCH_BATCH_SIZE),
    twilio,
    missing,
    ready: missing.length === 0,
  };
}
