import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  TAB_REQUIRED_COLUMNS,
  applyVisibleAppendFormat,
  buildMarkdownReport,
  buildVisibleTextFormatRequest,
  detectHeaderRow,
  parseUpdatedA1Range,
  redactSheetId,
  rowsToObjects,
  runLiveWriteTest,
  sanitizeErrorMessage,
  validateLiveWriteEnvironment,
  validateRequiredColumns,
} from "./maternaly-sheets-live-write-test.mjs";

const execFileAsync = promisify(execFile);
const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const scriptPath = path.join(scriptsDir, "maternaly-sheets-live-write-test.mjs");

const LEGACY_SHEET_ID = "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI";
const REAL_CLIENT_HEADERS = [
  "cliente_id",
  "nombre",
  "apellidos",
  "telefono_normalizado",
  "email",
  "dni_nif",
  "fpp",
  "fecha_nacimiento_bebe",
  "centro_preferente",
  "canal_origen",
  "consentimiento_comunicaciones",
  "estado_cliente",
  "cliente_global_id",
  "notas_privadas",
  "fecha_alta",
  "ultima_actualizacion",
];
const REAL_REGISTRATION_HEADERS = [
  "inscripcion_id",
  "cliente_id",
  "nombre",
  "apellidos",
  "telefono",
  "grupo_id",
  "servicio_id",
  "fecha_inscripcion",
  "canal_origen",
  "precio_acordado",
  "estado_pago",
  "estado_inscripcion",
  "fpp",
  "pareja_nombre",
  "consentimiento_comunicaciones",
  "observaciones",
];
const REAL_INTERACTION_HEADERS = [
  "interaccion_id",
  "fecha_hora",
  "canal",
  "telefono",
  "cliente_id",
  "lead_id",
  "servicio_id",
  "intent",
  "mensaje_usuario_resumen",
  "respuesta_bot_resumen",
  "accion_realizada",
  "resultado",
  "requiere_humano",
  "conversation_id",
  "observaciones",
];
const REAL_GROUP_HEADERS = [
  "grupo_id",
  "servicio_id",
  "nombre_grupo",
  "centro",
  "modalidad",
  "capacidad_total",
  "estado",
  "visible_chatbot",
  "reservable_chatbot",
];
const REAL_SESSION_HEADERS = [
  "sesion_id",
  "grupo_id",
  "servicio_id",
  "fecha",
  "hora_inicio",
  "hora_fin",
  "centro",
  "modalidad",
  "estado_sesion",
  "capacidad_total",
  "plazas_ocupadas",
  "plazas_disponibles",
  "visible_chatbot",
  "reservable_chatbot",
];

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

function fakeServiceWorkbook(serviceKey: "charla_embarazo_1_20" | "taller_blw", withSession: boolean) {
  const isBlw = serviceKey === "taller_blw";
  const groupId = isBlw ? "grupo_blw_erandio" : "grupo_charla_erandio";
  return {
    Clientes_Local: [REAL_CLIENT_HEADERS],
    Inscripciones: [REAL_REGISTRATION_HEADERS],
    Interacciones_Chatbot: [REAL_INTERACTION_HEADERS],
    Grupos_Ediciones: [
      REAL_GROUP_HEADERS,
      [
        groupId,
        serviceKey,
        isBlw ? "Taller BLW Erandio" : "Charla Erandio",
        "Erandio",
        "Presencial",
        "14",
        "Activa",
        "sí",
        "sí",
      ],
    ],
    Sesiones: [
      REAL_SESSION_HEADERS,
      ...(withSession
        ? [[
            isBlw ? "sesion_blw_erandio_20260902" : "sesion_charla_erandio_20260924",
            groupId,
            serviceKey,
            isBlw ? "2026-09-02" : "2026-09-24",
            isBlw ? "17:00" : "18:30",
            isBlw ? "20:00" : "20:00",
            "Erandio",
            "Presencial",
            "Activa",
            "14",
            "0",
            "14",
            "sí",
            "sí",
          ]]
        : []),
    ],
  };
}

function fakeSheets(
  workbooks: Record<string, Record<string, unknown[][]>>,
  options: { failFormatting?: boolean } = {},
) {
  const tabFromRange = (range: string) => range.match(/^'((?:''|[^'])+)'!/)?.[1].replace(/''/g, "'");
  const formatRequests: unknown[] = [];

  return {
    formatRequests,
    spreadsheets: {
      get: async ({ spreadsheetId }: { spreadsheetId: string }) => ({
        data: {
          sheets: Object.keys(workbooks[spreadsheetId] ?? {}).map((title, index) => ({
            properties: { title, sheetId: index + 100 },
          })),
        },
      }),
      batchUpdate: async (request: unknown) => {
        if (options.failFormatting) {
          throw new Error("synthetic_format_failure");
        }
        formatRequests.push(request);
        return { data: {} };
      },
      values: {
        get: async ({ spreadsheetId, range }: { spreadsheetId: string; range: string }) => ({
          data: {
            values: workbooks[spreadsheetId]?.[tabFromRange(range) ?? ""] ?? [],
          },
        }),
        append: async ({
          spreadsheetId,
          range,
          requestBody,
        }: {
          spreadsheetId: string;
          range: string;
          requestBody: { values: unknown[][] };
        }) => {
          const tab = tabFromRange(range) ?? "";
          workbooks[spreadsheetId]?.[tab]?.push(...requestBody.values);
          const rowNumber = workbooks[spreadsheetId]?.[tab]?.length ?? 1;
          return {
            data: {
              updates: {
                updatedRange: `${tab}!A${rowNumber}:AZ${rowNumber}`,
                updatedRows: requestBody.values.length,
              },
            },
          };
        },
      },
    },
  };
}

describe("maternaly live write Node script", () => {
  it("uses node, not tsx, from package.json", async () => {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

    expect(packageJson.scripts["maternaly:sheets:live-write-test"]).toBe(
      "node scripts/maternaly-sheets-live-write-test.mjs",
    );
  });

  it("copies the production Node script and dependencies into the Docker runner", async () => {
    const dockerfile = await readFile(path.join(repoRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toContain("FROM node:22-bookworm-slim AS prod-deps");
    expect(dockerfile).toContain("npm ci --omit=dev");
    expect(dockerfile).toContain("/app/node_modules ./node_modules");
    expect(dockerfile).toContain(
      "/app/scripts/maternaly-sheets-live-write-test.mjs ./scripts/maternaly-sheets-live-write-test.mjs",
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
  }, 15_000);

  it("reports missing columns without producing append values", () => {
    const missing = validateRequiredColumns(
      ["nombre_completo", "email", "idempotency_key"],
      ["fullName", "phone", "email", "idempotencyKey"],
    );

    expect(missing).toEqual(["phone"]);
  });

  it("accepts real template write headers without idempotency_key", () => {
    expect(validateRequiredColumns(REAL_CLIENT_HEADERS, TAB_REQUIRED_COLUMNS.Clientes_Local)).toEqual([]);
    expect(validateRequiredColumns(REAL_REGISTRATION_HEADERS, TAB_REQUIRED_COLUMNS.Inscripciones)).toEqual([]);
    expect(validateRequiredColumns(REAL_INTERACTION_HEADERS, TAB_REQUIRED_COLUMNS.Interacciones_Chatbot)).toEqual([]);
  });

  it("detects shifted headers in the production Node parser", () => {
    const parsed = rowsToObjects(
      [
        ["Sesiones"],
        ["Ayuda visual para la plantilla"],
        ["sesion_id", "grupo_id", "fecha", "hora_inicio", "hora_fin", "capacidad_total", "estado"],
        ["sesion_blw_erandio_20260902", "grupo_blw_erandio", "2026-09-02", "17:00", "20:00", "14", "Activa"],
      ],
      "Sesiones",
    );

    expect(parsed.headerRowNumber).toBe(3);
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.rows[0]).toMatchObject({
      sesion_id: "sesion_blw_erandio_20260902",
      fecha: "2026-09-02",
      hora_inicio: "17:00",
      hora_fin: "20:00",
      capacidad_total: "14",
    });
  });

  it("detects shifted real-template write headers in the production Node parser", () => {
    const clients = rowsToObjects(
      [
        ["Clientes_Local"],
        ["Ayuda visual para la plantilla"],
        REAL_CLIENT_HEADERS,
        ["CLI_BOT_TEST", "PRUEBA", "BOT", "+34999000111", "prueba.bot@example.test"],
      ],
      "Clientes_Local",
    );
    const registrations = rowsToObjects(
      [
        ["Inscripciones"],
        ["Ayuda visual para la plantilla"],
        REAL_REGISTRATION_HEADERS,
        ["INS_BOT_TEST", "CLI_BOT_TEST", "PRUEBA", "BOT", "+34999000111", "grupo_blw_bilbao", "taller_blw"],
      ],
      "Inscripciones",
    );
    const interactions = rowsToObjects(
      [
        ["Interacciones_Chatbot"],
        ["Ayuda visual para la plantilla"],
        REAL_INTERACTION_HEADERS,
        ["INT_BOT_TEST", "2026-06-21T00:00:00.000Z", "whatsapp", "+34999000111", "CLI_BOT_TEST"],
      ],
      "Interacciones_Chatbot",
    );

    expect(clients.headerRowNumber).toBe(3);
    expect(clients.rows[0]).toMatchObject({
      cliente_id: "CLI_BOT_TEST",
      nombre: "PRUEBA",
      telefono_normalizado: "+34999000111",
    });
    expect(registrations.headerRowNumber).toBe(3);
    expect(registrations.rows[0]).toMatchObject({
      inscripcion_id: "INS_BOT_TEST",
      cliente_id: "CLI_BOT_TEST",
      grupo_id: "grupo_blw_bilbao",
    });
    expect(interactions.headerRowNumber).toBe(3);
    expect(interactions.rows[0]).toMatchObject({
      interaccion_id: "INT_BOT_TEST",
      fecha_hora: "2026-06-21T00:00:00.000Z",
      canal: "whatsapp",
    });
  });

  it("parses and formats an appended row range with black visible text", async () => {
    expect(parseUpdatedA1Range("Clientes_Local!A5:P5")).toMatchObject({
      sheetTitle: "Clientes_Local",
      startRowIndex: 4,
      endRowIndex: 5,
      startColumnIndex: 0,
      endColumnIndex: 16,
    });

    const sheets = fakeSheets({
      sheet_blw_synthetic: fakeServiceWorkbook("taller_blw", true),
    });
    await expect(
      applyVisibleAppendFormat({
        sheets,
        sheetId: "sheet_blw_synthetic",
        updatedRange: "Clientes_Local!A5:P5",
      }),
    ).resolves.toEqual({
      formattedRange: "Clientes_Local!A5:P5",
      formatApplied: true,
    });

    expect(sheets.formatRequests).toEqual([
      {
        spreadsheetId: "sheet_blw_synthetic",
        requestBody: {
          requests: [
            buildVisibleTextFormatRequest(100, {
              startRowIndex: 4,
              endRowIndex: 5,
              startColumnIndex: 0,
              endColumnIndex: 16,
            }),
          ],
        },
      },
    ]);
  });

  it("does not treat visual title rows as headers in the Node parser", () => {
    const detection = detectHeaderRow(
      [
        ["Sesiones"],
        ["Ayuda visual para la plantilla"],
        ["fila sin columnas normalizadas"],
      ],
      "Sesiones",
    );

    expect(detection.headerRowIndex).toBe(-1);
    expect(detection.parseError).toMatch(/header_not_found/);
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

  it("reports partial_success when one service writes and another has no available session", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-live-write-partial-"));

    try {
      const sheets = fakeSheets({
        sheet_charla_synthetic: fakeServiceWorkbook("charla_embarazo_1_20", false),
        sheet_blw_synthetic: fakeServiceWorkbook("taller_blw", true),
      });
      const result = await runLiveWriteTest({
        env: liveEnv({ MATERNALY_LIVE_WRITE_TEST_REPORT_DIR: reportDir }),
        now: new Date("2026-06-21T00:00:00.000Z"),
        sheets,
      });

      expect(result.ok).toBe(true);
      expect(result.reason).toBe("partial_success");
      expect(result.exitCode).toBe(0);
      expect(result.appendApplied).toBe(3);
      expect(result.formattedRanges).toEqual([
        "Clientes_Local!A2:AZ2",
        "Inscripciones!A2:AZ2",
        "Interacciones_Chatbot!A2:AZ2",
      ]);
      expect(result.formatApplied).toBe(true);
      expect(result.formatWarnings).toEqual([]);
      expect(result.services.map((service) => [service.serviceKey, service.status])).toEqual([
        ["charla_embarazo_1_20", "skipped_no_available_session"],
        ["taller_blw", "applied"],
      ]);
      expect(sheets.formatRequests).toHaveLength(3);
      expect(JSON.stringify(sheets.formatRequests)).toContain('"foregroundColor":{"red":0,"green":0,"blue":0}');
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("keeps live-write applied when row formatting fails after append", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-live-write-format-warning-"));

    try {
      const result = await runLiveWriteTest({
        env: liveEnv({ MATERNALY_LIVE_WRITE_TEST_REPORT_DIR: reportDir }),
        now: new Date("2026-06-21T00:00:00.000Z"),
        sheets: fakeSheets({
          sheet_charla_synthetic: fakeServiceWorkbook("charla_embarazo_1_20", false),
          sheet_blw_synthetic: fakeServiceWorkbook("taller_blw", true),
        }, { failFormatting: true }),
      });

      expect(result.ok).toBe(true);
      expect(result.reason).toBe("partial_success");
      expect(result.appendApplied).toBe(3);
      expect(result.formattedRanges).toEqual([]);
      expect(result.formatApplied).toBe(false);
      expect(result.formatWarnings).toEqual([
        "Clientes_Local:synthetic_format_failure",
        "Inscripciones:synthetic_format_failure",
        "Interacciones_Chatbot:synthetic_format_failure",
      ]);
      expect(result.services.find((service) => service.serviceKey === "taller_blw")).toMatchObject({
        status: "applied",
        appendApplied: 3,
        formatApplied: false,
      });
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
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
