#!/usr/bin/env node

const requiredNonSecret = {
  APP_NAME: "Maternaly",
  APP_ENV: "production",
  NODE_ENV: "production",
  WHATSAPP_PROVIDER: "mock|ycloud|twilio",
  GOOGLE_SHEETS_ACCESS_MODE: "read_only|dry_run",
  BOT_SHEETS_LIVE_WRITE_ENABLED: "false",
  MATERNALY_SHEET_IDS: "comma-separated sheet ids",
  MATERNALY_NORMALIZED_SHEETS_ENABLED: "true|false",
  MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "dry_run",
  MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20,taller_blw",
  LLM_PROVIDER: "mock|openai",
  PANEL_ADMIN_USERNAME: "configured",
  APP_BASE_URL: "https://...",
};

const requiredSecrets = [
  "DATABASE_URL",
  "PANEL_ADMIN_PASSWORD",
];

const optionalSecrets = [
  "YCLOUD_API_KEY",
  "YCLOUD_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_WEBHOOK_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 or GOOGLE_APPLICATION_CREDENTIALS",
];

const warnings = [];
const missing = [];
const contentSidPattern = /^HX[a-fA-F0-9]{32}$/;

function hasGoogleSheetsCredentials() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      process.env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      (process.env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.MATERNALY_GOOGLE_SHEETS_PRIVATE_KEY?.trim()) ||
      (process.env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.HOTEL_GOOGLE_SHEETS_PRIVATE_KEY?.trim()) ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.GOOGLE_PRIVATE_KEY?.trim()),
  );
}

for (const key of Object.keys(requiredNonSecret)) {
  if (!process.env[key]?.trim()) {
    missing.push(key);
  }
}

for (const key of requiredSecrets) {
  if (!process.env[key]?.trim()) {
    missing.push(key);
  }
}

if (process.env.NODE_ENV !== "production") {
  warnings.push("NODE_ENV should be production in EasyPanel.");
}

if (process.env.APP_ENV !== "production") {
  warnings.push("APP_ENV should be production in EasyPanel.");
}

if (process.env.GOOGLE_SHEETS_ACCESS_MODE === "live") {
  warnings.push("GOOGLE_SHEETS_ACCESS_MODE=live is not recommended for first deploy.");
}

if (process.env.BOT_SHEETS_LIVE_WRITE_ENABLED !== "false") {
  warnings.push("BOT_SHEETS_LIVE_WRITE_ENABLED should remain false until explicit go-live.");
}

if (process.env.MATERNALY_NORMALIZED_SHEETS_WRITE_MODE === "live") {
  warnings.push("MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=live requires explicit go-live approval.");
}

if (process.env.MATERNALY_NORMALIZED_SHEETS_ENABLED === "true") {
  const services = (process.env.MATERNALY_NORMALIZED_SERVICE_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!services.includes("charla_embarazo_1_20") || !services.includes("taller_blw")) {
    warnings.push("MATERNALY_NORMALIZED_SERVICE_IDS should include charla_embarazo_1_20 and taller_blw.");
  }
  if (!process.env.MATERNALY_CHARLA_EMBARAZO_SHEET_ID?.trim()) {
    warnings.push("MATERNALY_CHARLA_EMBARAZO_SHEET_ID is missing; charla flow will report missing_sheet_ids.");
  }
  if (!process.env.MATERNALY_BLW_SHEET_ID?.trim()) {
    warnings.push("MATERNALY_BLW_SHEET_ID is missing; BLW flow will report missing_sheet_ids.");
  }
}

if (process.env.WHATSAPP_PROVIDER === "ycloud" && !process.env.YCLOUD_API_KEY?.trim()) {
  missing.push("YCLOUD_API_KEY when WHATSAPP_PROVIDER=ycloud");
}

if (process.env.WHATSAPP_PROVIDER === "twilio") {
  if (!process.env.TWILIO_ACCOUNT_SID?.trim()) {
    missing.push("TWILIO_ACCOUNT_SID when WHATSAPP_PROVIDER=twilio");
  }
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) {
    missing.push("TWILIO_AUTH_TOKEN when WHATSAPP_PROVIDER=twilio");
  }
  if (!process.env.TWILIO_WHATSAPP_FROM?.trim() && !process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()) {
    missing.push("TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID when WHATSAPP_PROVIDER=twilio");
  }
  if (!process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim()) {
    warnings.push("TWILIO_WEBHOOK_AUTH_TOKEN should protect the Twilio Sandbox webhook.");
  }
}

if (process.env.LLM_PROVIDER === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  missing.push("OPENAI_API_KEY when LLM_PROVIDER=openai");
}

if (["1", "true", "yes", "on"].includes(process.env.MATERNALY_REMINDERS_ENABLED?.trim().toLowerCase())) {
  if (!process.env.MATERNALY_ADMIN_TASK_TOKEN?.trim()) {
    missing.push("MATERNALY_ADMIN_TASK_TOKEN when MATERNALY_REMINDERS_ENABLED=true");
  }
  for (const key of [
    "MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE",
    "MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL",
  ]) {
    const value = process.env[key]?.trim();
    if (!value || !contentSidPattern.test(value)) {
      missing.push(`${key} with a valid Twilio ContentSid`);
    }
  }
  if (!process.env.TWILIO_ACCOUNT_SID?.trim()) {
    missing.push("TWILIO_ACCOUNT_SID for Maternaly reminders");
  }
  if (!process.env.TWILIO_AUTH_TOKEN?.trim()) {
    missing.push("TWILIO_AUTH_TOKEN for Maternaly reminders");
  }
  if (!process.env.TWILIO_WHATSAPP_FROM?.trim() && !process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()) {
    missing.push("TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID for Maternaly reminders");
  }
  if (process.env.MATERNALY_NORMALIZED_SHEETS_ENABLED !== "true") {
    missing.push("MATERNALY_NORMALIZED_SHEETS_ENABLED=true for Maternaly reminders");
  }
  const normalizedServices = (process.env.MATERNALY_NORMALIZED_SERVICE_IDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!normalizedServices.includes("charla_embarazo_1_20")) {
    missing.push("MATERNALY_NORMALIZED_SERVICE_IDS including charla_embarazo_1_20");
  }
  if (!process.env.MATERNALY_CHARLA_EMBARAZO_SHEET_ID?.trim()) {
    missing.push("MATERNALY_CHARLA_EMBARAZO_SHEET_ID for Maternaly reminders");
  }
  if (!hasGoogleSheetsCredentials()) {
    missing.push("Google Sheets service account credentials for Maternaly reminders");
  }
}

console.log("[info] Required non-secret shape:");
for (const [key, value] of Object.entries(requiredNonSecret)) {
  console.log(`- ${key}: ${value}`);
}

console.log("[info] Required secret names:");
for (const key of requiredSecrets) {
  console.log(`- ${key}`);
}

console.log("[info] Optional secret names:");
for (const key of optionalSecrets) {
  console.log(`- ${key}`);
}

for (const warning of warnings) {
  console.warn(`[warn] ${warning}`);
}

if (missing.length > 0) {
  console.error(`[fail] Missing required env names: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[ok] EasyPanel Maternaly env shape looks valid.");
