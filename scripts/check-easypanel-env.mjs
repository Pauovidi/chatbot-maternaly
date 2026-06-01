#!/usr/bin/env node

const requiredNonSecret = {
  APP_NAME: "Maternaly",
  APP_ENV: "production",
  NODE_ENV: "production",
  WHATSAPP_PROVIDER: "mock|ycloud|twilio",
  GOOGLE_SHEETS_ACCESS_MODE: "read_only|dry_run",
  BOT_SHEETS_LIVE_WRITE_ENABLED: "false",
  MATERNALY_SHEET_IDS: "comma-separated sheet ids",
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
