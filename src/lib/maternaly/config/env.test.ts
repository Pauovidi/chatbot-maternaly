import { describe, expect, it } from "vitest";
import { getGoogleServiceAccountJson, readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";

describe("Maternaly env config", () => {
  it("builds service account JSON from email and private key env vars", () => {
    const json = getGoogleServiceAccountJson({
      GOOGLE_PROJECT_ID: "demo-project",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.test",
      GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----\\n",
    });

    expect(json).not.toBeNull();
    expect(JSON.parse(json ?? "")).toEqual({
      project_id: "demo-project",
      client_email: "service@example.test",
      private_key: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n",
    });
  });

  it("reads normalized Sheets non-secret runtime flags", () => {
    const config = readMaternalyRuntimeConfig({
      MATERNALY_NORMALIZED_SHEETS_ENABLED: "true",
      MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "dry_run",
      MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20,taller_blw",
      MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "sheet_charla",
      GOOGLE_SHEETS_ACCESS_MODE: "dry_run",
      BOT_SHEETS_LIVE_WRITE_ENABLED: "false",
    });

    expect(config.normalizedSheets).toEqual(
      expect.objectContaining({
        enabled: true,
        writeMode: "dry_run",
        serviceIds: ["charla_embarazo_1_20", "taller_blw"],
        missingSheetIds: ["taller_blw"],
        liveReady: false,
      }),
    );
  });
});
