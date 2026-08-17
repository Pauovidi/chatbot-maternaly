import { describe, expect, it } from "vitest";
import { readMaternalyReminderRuntimeConfig } from "./config";

const CONTENT_SID = `HX${"a".repeat(32)}`;

function readyEnv(): Partial<NodeJS.ProcessEnv> {
  return {
    MATERNALY_REMINDERS_ENABLED: "true",
    MATERNALY_ADMIN_TASK_TOKEN: "synthetic-admin-task-token",
    DATABASE_URL: "postgres://synthetic.invalid/reminders",
    TWILIO_ACCOUNT_SID: `AC${"b".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "synthetic-auth-token",
    TWILIO_WHATSAPP_FROM: "+34600999888",
    MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE: CONTENT_SID,
    MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL: CONTENT_SID,
    MATERNALY_NORMALIZED_SHEETS_ENABLED: "true",
    MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20,taller_blw",
    MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "synthetic-charla-sheet",
    GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: "synthetic-base64-credentials",
  };
}

describe("Maternaly reminder runtime configuration", () => {
  it("is ready only when task auth and the normalized Charla source are configured", () => {
    const config = readMaternalyReminderRuntimeConfig(readyEnv());

    expect(config.ready).toBe(true);
    expect(config.missing).toEqual([]);
  });

  it("reports task auth and normalized Sheets dependencies without exposing values", () => {
    const env = readyEnv();
    delete env.MATERNALY_ADMIN_TASK_TOKEN;
    env.MATERNALY_NORMALIZED_SHEETS_ENABLED = "false";
    env.MATERNALY_NORMALIZED_SERVICE_IDS = "taller_blw";
    delete env.MATERNALY_CHARLA_EMBARAZO_SHEET_ID;
    delete env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

    const config = readMaternalyReminderRuntimeConfig(env);

    expect(config.ready).toBe(false);
    expect(config.missing).toEqual(
      expect.arrayContaining([
        "MATERNALY_ADMIN_TASK_TOKEN",
        "MATERNALY_NORMALIZED_SHEETS_ENABLED=true",
        "MATERNALY_NORMALIZED_SERVICE_IDS includes charla_embarazo_1_20",
        "MATERNALY_CHARLA_EMBARAZO_SHEET_ID",
        "Google Sheets service account credentials",
      ]),
    );
    expect(JSON.stringify(config)).not.toContain("synthetic-admin-task-token");
  });
});
