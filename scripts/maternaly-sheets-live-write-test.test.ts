import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  buildMarkdownReport,
  redactSheetId,
  sanitizeErrorMessage,
  validateLiveWriteEnvironment,
  validateRequiredColumns,
} from "./maternaly-sheets-live-write-test.mjs";

const execFileAsync = promisify(execFile);
const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const scriptPath = path.join(scriptsDir, "maternaly-sheets-live-write-test.mjs");

const LEGACY_SHEET_ID = "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI";

function liveEnv(overrides: Record<string, string> = {}) {
  return {
    MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE: "true",
    MATERNALY_NORMALIZED_SHEETS_ENABLED: "true",
    MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
    GOOGLE_SHEETS_ACCESS_MODE: "live",
    BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
    MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "sheet_charla_synthetic",
    MATERNALY_BLW_SHEET_ID: "sheet_blw_synthetic",
    MATERNALY_NORMALIZED_SHEET_IDS: "sheet_charla_synthetic,sheet_blw_synthetic",
    GOOGLE_APPLICATION_CREDENTIALS: "C:\\synthetic\\google-credentials.json",
    ...overrides,
  };
}

describe("maternaly live write Node script", () => {
  it("uses node, not tsx, from package.json", async () => {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

    expect(packageJson.scripts["maternaly:sheets:live-write-test"]).toBe(
      "node scripts/maternaly-sheets-live-write-test.mjs",
    );
  });

  it("skips safely when the synthetic live write flag is missing", () => {
    const validation = validateLiveWriteEnvironment(liveEnv({
      MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE: "false",
    }));

    expect(validation.ready).toBe(false);
    expect(validation.primaryReason).toBe("missing_required_live_flags");
    expect(validation.missingLiveFlags).toContainEqual({
      name: "MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE",
      expected: "true",
    });
  });

  it("blocks protected legacy original Sheet IDs before auth", () => {
    const validation = validateLiveWriteEnvironment(liveEnv({
      MATERNALY_CHARLA_EMBARAZO_SHEET_ID: LEGACY_SHEET_ID,
      MATERNALY_NORMALIZED_SHEET_IDS: `${LEGACY_SHEET_ID},sheet_blw_synthetic`,
    }));

    expect(validation.ready).toBe(false);
    expect(validation.primaryReason).toBe("protected_legacy_sheet_id");
    expect(JSON.stringify(validation.legacySheetTargets)).not.toContain(LEGACY_SHEET_ID);
    expect(validation.legacySheetTargets).toContainEqual({
      serviceKey: "charla_embarazo_1_20",
      redactedSheetId: redactSheetId(LEGACY_SHEET_ID),
    });
  });

  it("does not print secret-like env values on a real node skip run", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-live-write-test-"));
    const fakeSecret = "secret-value-that-must-not-appear-1234567890";

    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
        cwd: repoRoot,
        env: {
          Path: process.env.Path ?? process.env.PATH ?? "",
          PATH: process.env.PATH ?? process.env.Path ?? "",
          SystemRoot: process.env.SystemRoot ?? "",
          ComSpec: process.env.ComSpec ?? "",
          TEMP: process.env.TEMP ?? tmpdir(),
          TMP: process.env.TMP ?? tmpdir(),
          NODE_ENV: "test",
          GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: fakeSecret,
          TWILIO_AUTH_TOKEN: fakeSecret,
          MATERNALY_LIVE_WRITE_TEST_REPORT_DIR: reportDir,
        },
        timeout: 10_000,
      });

      expect(stdout).toContain("missing_required_live_flags");
      expect(stdout).not.toContain(fakeSecret);
      expect(stderr).not.toContain(fakeSecret);
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("reports missing columns without producing append values", () => {
    const missing = validateRequiredColumns(
      ["nombre_completo", "email", "idempotency_key"],
      ["fullName", "phone", "email", "idempotencyKey"],
    );

    expect(missing).toEqual(["phone"]);
  });

  it("redacts complete Sheet IDs from markdown reports", () => {
    const markdown = buildMarkdownReport({
      ok: false,
      skipped: true,
      reason: "protected_legacy_sheet_id",
      startedAt: "2026-06-21T00:00:00.000Z",
      idempotencyKey: "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL_20260621_000000000Z",
      idempotencyKeyMode: "generated_timestamp",
      liveWriteAttempted: false,
      appendAttempts: 0,
      appendApplied: 0,
      validation: {
        missingLiveFlags: [],
        targetSheetIds: [
          {
            serviceKey: "charla_embarazo_1_20",
            configured: true,
            redactedSheetId: redactSheetId(LEGACY_SHEET_ID),
          },
        ],
      },
      services: [],
    });

    expect(markdown).toContain(redactSheetId(LEGACY_SHEET_ID));
    expect(markdown).not.toContain(LEGACY_SHEET_ID);
  });

  it("redacts known sensitive values from error messages", () => {
    const secret = "very-private-key-value-1234567890";
    const message = sanitizeErrorMessage(new Error(`auth failed: ${secret}`), {
      GOOGLE_PRIVATE_KEY: secret,
    });

    expect(message).toContain("[redacted]");
    expect(message).not.toContain(secret);
  });
});
