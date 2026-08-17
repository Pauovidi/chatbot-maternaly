import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.unstubAllEnvs();
  });

  it("returns app, WhatsApp and persistence status without secrets", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ENV = "development";
    process.env.WHATSAPP_PROVIDER = "ycloud";
    process.env.YCLOUD_API_KEY = "super-secret-token";
    process.env.DATABASE_URL = "postgres://user:password@example.test/db";
    process.env.HOTEL_PERSISTENCE_PROVIDER = "postgres";
    delete process.env.MATERNALY_REMINDERS_ENABLED;

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.whatsapp).toEqual(
      expect.objectContaining({
        provider: "ycloud",
        ycloudConfigured: true,
        ycloudWebhookSecretConfigured: false,
        ycloudAvailable: true,
      }),
    );
    expect(json.whatsapp.twilio).toEqual(
      expect.objectContaining({
        configured: false,
        fromConfigured: false,
        webhookProtected: false,
        mode: "unknown",
        active: false,
      }),
    );
    expect(json.database.provider).toBe("postgres");
    expect(json.database.migrations).toEqual(
      expect.objectContaining({
        ready: false,
        missing: expect.arrayContaining([1, 2, 3, 4, 5]),
      }),
    );
    expect(json.panel).toEqual(
      expect.objectContaining({
        route: "/admin/conversations",
        ready: true,
      }),
    );
    expect(json.bot).toEqual({
      botDomain: "maternaly",
      knowledgeBase: "maternaly",
      legacyHotelKnowledgeEnabled: false,
    });
    expect(json.conversationsStore).toEqual(
      expect.objectContaining({
        provider: "postgres",
      }),
    );
    expect(json.build).toEqual(
      expect.objectContaining({
        source: expect.any(String),
      }),
    );
    expect(json.googleSheets.writeEnabled).toBe(false);
    expect(json.reminders).toEqual(
      expect.objectContaining({ enabled: false, ready: false, leadHours: 48 }),
    );
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("password@example");
  });

  it("fails production health when EasyPanel Postgres is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ENV = "production";
    process.env.APP_NAME = "Maternaly";
    process.env.WHATSAPP_PROVIDER = "mock";
    delete process.env.DATABASE_URL;

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.runtimeTarget).toBe("easypanel-container");
    expect(json.database.productionReady).toBe(false);
    expect(json.database.warning).toContain("DATABASE_URL");
    expect(json.database.migrations.ready).toBe(false);
    expect(json.panel.ready).toBe(false);
  });

  it("reports Twilio Sandbox readiness without exposing secrets", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ENV = "development";
    process.env.WHATSAPP_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "AC_secret";
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret-token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN = "webhook-secret";
    process.env.TWILIO_PROVIDER_MODE = "sandbox";

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.whatsapp.provider).toBe("twilio");
    expect(json.whatsapp.twilio).toEqual(
      expect.objectContaining({
        configured: true,
        fromConfigured: true,
        webhookProtected: true,
        mode: "sandbox",
        active: true,
      }),
    );
    expect(serialized).not.toContain("AC_secret");
    expect(serialized).not.toContain("twilio-secret-token");
    expect(serialized).not.toContain("webhook-secret");
  });

  it("warns when Twilio is active in production without webhook token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ENV = "production";
    process.env.WHATSAPP_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "AC_secret";
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret-token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    delete process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
    delete process.env.DATABASE_URL;

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.whatsapp.twilio.webhookProtected).toBe(false);
    expect(json.whatsapp.twilio.warning).toContain("TWILIO_WEBHOOK_AUTH_TOKEN");
  });

  it("warns when Twilio is active without sender credentials", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ENV = "development";
    process.env.WHATSAPP_PROVIDER = "twilio";
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN = "webhook-secret";
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_WHATSAPP_FROM;

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.whatsapp.twilio).toEqual(
      expect.objectContaining({
        configured: false,
        fromConfigured: false,
        webhookProtected: true,
        mode: "unknown",
        active: true,
      }),
    );
    expect(json.whatsapp.twilio.warning).toContain("Twilio is active");
    expect(serialized).not.toContain("webhook-secret");
  });

  it("fails reminder readiness when task auth or the normalized Charla source is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ENV = "development";
    process.env.MATERNALY_REMINDERS_ENABLED = "true";
    process.env.TWILIO_ACCOUNT_SID = `AC${"a".repeat(32)}`;
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret-token";
    process.env.TWILIO_WHATSAPP_FROM = "+34600999888";
    process.env.MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE = `HX${"b".repeat(32)}`;
    process.env.MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL = `HX${"c".repeat(32)}`;
    delete process.env.MATERNALY_ADMIN_TASK_TOKEN;
    delete process.env.MATERNALY_NORMALIZED_SHEETS_ENABLED;
    delete process.env.MATERNALY_CHARLA_EMBARAZO_SHEET_ID;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
    delete process.env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    delete process.env.MATERNALY_GOOGLE_SHEETS_PRIVATE_KEY;
    delete process.env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    delete process.env.HOTEL_GOOGLE_SHEETS_PRIVATE_KEY;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    delete process.env.DATABASE_URL;

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(503);
    expect(json.reminders).toEqual(
      expect.objectContaining({
        enabled: true,
        ready: false,
        missing: expect.arrayContaining([
          "MATERNALY_ADMIN_TASK_TOKEN",
          "MATERNALY_NORMALIZED_SHEETS_ENABLED=true",
          "MATERNALY_CHARLA_EMBARAZO_SHEET_ID",
          "Google Sheets service account credentials",
        ]),
      }),
    );
    expect(serialized).not.toContain("twilio-secret-token");
  });

  it("reports normalized Sheets status without full sheet IDs or secrets", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ENV = "development";
    process.env.MATERNALY_NORMALIZED_SHEETS_ENABLED = "true";
    process.env.MATERNALY_NORMALIZED_SERVICE_IDS = "charla_embarazo_1_20,taller_blw";
    process.env.MATERNALY_CHARLA_EMBARAZO_SHEET_ID = "1CharlaSheetSecretFullId";
    delete process.env.MATERNALY_BLW_SHEET_ID;
    process.env.MATERNALY_NORMALIZED_SHEET_IDS = "1CharlaSheetSecretFullId";
    process.env.MATERNALY_NORMALIZED_SHEETS_WRITE_MODE = "dry_run";
    process.env.GOOGLE_SHEETS_ACCESS_MODE = "dry_run";
    process.env.BOT_SHEETS_LIVE_WRITE_ENABLED = "false";
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = "secret-service-account";

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.normalizedSheets).toEqual(
      expect.objectContaining({
        enabled: true,
        configuredServices: ["charla_embarazo_1_20", "taller_blw"],
        missingSheetIds: ["taller_blw"],
        accessMode: "dry_run",
        writeEnabled: false,
        mode: "dry_run",
        liveReady: false,
      }),
    );
    expect(serialized).not.toContain("1CharlaSheetSecretFullId");
    expect(serialized).not.toContain("secret-service-account");
  });

  it("reports Vercel demo with Google Sheets conversations and no Postgres as ready", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ENV = "production";
    process.env.WHATSAPP_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = "AC_secret";
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret-token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN = "webhook-secret";
    process.env.TWILIO_PROVIDER_MODE = "sandbox";
    process.env.GOOGLE_SHEETS_ACCESS_MODE = "read_only";
    process.env.BOT_SHEETS_LIVE_WRITE_ENABLED = "false";
    process.env.LLM_PROVIDER = "mock";
    process.env.OPENAI_API_KEY = "openai-secret";
    process.env.MATERNALY_CONVERSATIONS_STORE_PROVIDER = "google_sheets";
    process.env.MATERNALY_CONVERSATIONS_SHEET_NAME = "CONVERSATIONS";
    process.env.MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID = "maternaly-store-sheet";
    process.env.MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED = "true";
    delete process.env.DATABASE_URL;

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.runtimeTarget).toBe("vercel-demo");
    expect(json.database.configured).toBe(false);
    expect(json.database.required).toBe(false);
    expect(json.conversationsStore).toEqual(
      expect.objectContaining({
        provider: "google_sheets",
        durable: true,
        sheetName: "CONVERSATIONS",
        spreadsheetIdConfigured: true,
        warning: "demo mode, no Postgres",
      }),
    );
    expect(json.panel.ready).toBe(true);
    expect(json.googleSheets.writeEnabled).toBe(false);
    expect(json.googleSheets.liveWriteEnabled).toBe(false);
    expect(json.llm.provider).toBe("mock");
    expect(serialized).not.toContain("twilio-secret-token");
    expect(serialized).not.toContain("webhook-secret");
    expect(serialized).not.toContain("openai-secret");
  });
});
