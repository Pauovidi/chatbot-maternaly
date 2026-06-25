import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFormatRequests,
  buildGroupPlans,
  buildGroupTabTitle,
  buildMarkdownReport,
  buildTabValues,
  redactSheetId,
  runGroupTabsSync,
  validateGroupTabsEnvironment,
} from "./maternaly-sheets-sync-group-tabs.mjs";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");

const GROUP_HEADERS = [
  "grupo_id",
  "servicio_id",
  "nombre_grupo",
  "centro",
  "modalidad",
  "capacidad_total",
  "estado",
];
const SESSION_HEADERS = [
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
];
const REGISTRATION_HEADERS = [
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
  "fecha_nacimiento_bebe",
  "pareja_nombre",
  "observaciones",
];
const CLIENT_HEADERS = ["cliente_id", "nombre", "apellidos", "telefono_normalizado", "email"];

function syncEnv(overrides: Record<string, string> = {}) {
  return {
    MATERNALY_GROUP_TABS_SYNC_MODE: "dry_run",
    MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "sheet_charla_1234567890",
    MATERNALY_BLW_SHEET_ID: "sheet_blw_1234567890",
    MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20,taller_blw",
    MATERNALY_NORMALIZED_SHEET_IDS: "sheet_charla_1234567890,sheet_blw_1234567890",
    GOOGLE_APPLICATION_CREDENTIALS: "C:\\synthetic\\google-credentials.json",
    ...overrides,
  };
}

function pilatesWorkbook() {
  return {
    Grupos_Ediciones: [
      GROUP_HEADERS,
      ["pilates_bilbao_10", "pilates", "Pilates Bilbao 10", "Bilbao", "Presencial", "10", "Activa"],
      ["pilates_bilbao_11", "pilates", "Pilates Bilbao 11", "Bilbao", "Presencial", "10", "Activa"],
      ["pilates_erandio_13", "pilates", "Pilates Erandio 13", "Erandio", "Presencial", "10", "Activa"],
    ],
    Sesiones: [
      SESSION_HEADERS,
      ["sesion_pilates_bilbao_10", "pilates_bilbao_10", "pilates", "2026-09-01", "10:00", "11:00", "Bilbao", "Presencial", "Activa", "10"],
      ["sesion_pilates_bilbao_11", "pilates_bilbao_11", "pilates", "2026-09-01", "11:00", "12:00", "Bilbao", "Presencial", "Activa", "10"],
      ["sesion_pilates_erandio_13", "pilates_erandio_13", "pilates", "2026-09-02", "13:00", "14:00", "Erandio", "Presencial", "Activa", "10"],
    ],
    Inscripciones: [
      REGISTRATION_HEADERS,
      ["ins_10_a", "cli_1", "Ane", "Lopez", "+34 600 000 001", "pilates_bilbao_10", "pilates", "2026-06-01", "whatsapp", "45", "pendiente", "activa", "", "", "", ""],
      ["ins_11_a", "cli_2", "Nora", "Garcia", "+34 600 000 002", "pilates_bilbao_11", "pilates", "2026-06-02", "whatsapp", "45", "pagado", "confirmada", "", "", "", ""],
      ["ins_13_a", "cli_3", "Leire", "Martin", "+34 600 000 003", "pilates_erandio_13", "pilates", "2026-06-03", "web", "45", "pendiente", "preinscrita", "", "", "", ""],
    ],
    Clientes_Local: [
      CLIENT_HEADERS,
      ["cli_1", "Ane", "Lopez", "+34600000001", "ane@example.test"],
      ["cli_2", "Nora", "Garcia", "+34600000002", "nora@example.test"],
      ["cli_3", "Leire", "Martin", "+34600000003", "leire@example.test"],
    ],
    "GRP Pilates Bilbao 10": [["old"]],
    "Notas internas": [["manual"]],
  };
}

function blwWorkbook() {
  return {
    Grupos_Ediciones: [
      GROUP_HEADERS,
      ["blw_erandio_20260902", "taller_blw", "Taller BLW Erandio", "Erandio", "Presencial", "14", "Activa"],
      ["blw_bilbao_20260909", "taller_blw", "Taller BLW Bilbao", "Bilbao", "Presencial", "14", "Activa"],
    ],
    Sesiones: [
      SESSION_HEADERS,
      ["sesion_blw_erandio_20260902", "blw_erandio_20260902", "taller_blw", "2026-09-02", "17:00", "20:00", "Erandio", "Presencial", "Activa", "14"],
      ["sesion_blw_bilbao_20260909", "blw_bilbao_20260909", "taller_blw", "2026-09-09", "17:00", "20:00", "Bilbao", "Presencial", "Activa", "14"],
    ],
    Inscripciones: [
      REGISTRATION_HEADERS,
      ["ins_blw_erandio", "cli_blw_1", "Irati", "Sanz", "+34 600 000 004", "blw_erandio_20260902", "taller_blw", "2026-06-04", "whatsapp", "45", "pendiente", "activa", "", "2026-01-10", "", ""],
      ["ins_blw_bilbao", "cli_blw_2", "June", "Ruiz", "+34 600 000 005", "blw_bilbao_20260909", "taller_blw", "2026-06-05", "web", "45", "pagado", "confirmada", "", "2026-01-12", "", ""],
    ],
    Clientes_Local: [
      CLIENT_HEADERS,
      ["cli_blw_1", "Irati", "Sanz", "+34600000004", "irati@example.test"],
      ["cli_blw_2", "June", "Ruiz", "+34600000005", "june@example.test"],
    ],
  };
}

function emptyGroupsWorkbook() {
  return {
    Grupos_Ediciones: [
      GROUP_HEADERS,
      ["charla_erandio_20260924", "charla_embarazo_1_20", "Charla Erandio", "Erandio", "Presencial", "20", "Activa"],
      ["charla_bilbao_20261001", "charla_embarazo_1_20", "Charla Bilbao", "Bilbao", "Presencial", "20", "Activa"],
    ],
    Sesiones: [
      SESSION_HEADERS,
      ["sesion_charla_erandio_20260924", "charla_erandio_20260924", "charla_embarazo_1_20", "2026-09-24", "18:30", "20:00", "Erandio", "Presencial", "Activa", "20"],
      ["sesion_charla_bilbao_20261001", "charla_bilbao_20261001", "charla_embarazo_1_20", "2026-10-01", "18:30", "20:00", "Bilbao", "Presencial", "Activa", "20"],
    ],
    Inscripciones: [
      REGISTRATION_HEADERS,
      ["ins_charla_erandio", "cli_charla_1", "Maialen", "Arias", "+34 600 000 006", "charla_erandio_20260924", "charla_embarazo_1_20", "2026-06-06", "whatsapp", "0", "n/a", "activa", "2027-02-01", "", "Iker", ""],
    ],
    Clientes_Local: [CLIENT_HEADERS],
  };
}

function fakeSheets(workbooks: Record<string, Record<string, unknown[][]>>) {
  const calls = {
    batchUpdate: [] as unknown[],
    clear: [] as unknown[],
    update: [] as unknown[],
  };
  let nextSheetId = 1000;

  const tabFromRange = (range: string) => {
    const quoted = range.match(/^'((?:''|[^'])+)'!/);
    if (quoted) {
      return quoted[1].replace(/''/g, "'");
    }
    return range.split("!")[0];
  };

  return {
    calls,
    spreadsheets: {
      get: async ({ spreadsheetId }: { spreadsheetId: string }) => ({
        data: {
          sheets: Object.keys(workbooks[spreadsheetId] ?? {}).map((title, index) => ({
            properties: { title, sheetId: index + 100 },
          })),
        },
      }),
      batchUpdate: async ({
        spreadsheetId,
        requestBody,
      }: {
        spreadsheetId: string;
        requestBody: { requests: Array<Record<string, unknown>> };
      }) => {
        calls.batchUpdate.push({ spreadsheetId, requestBody });
        const replies = requestBody.requests.map((request) => {
          if ("addSheet" in request) {
            const title = (request.addSheet as { properties: { title: string } }).properties.title;
            const sheetId = nextSheetId++;
            workbooks[spreadsheetId][title] = [];
            return { addSheet: { properties: { sheetId, title } } };
          }
          return {};
        });
        return { data: { replies } };
      },
      values: {
        get: async ({ spreadsheetId, range }: { spreadsheetId: string; range: string }) => ({
          data: { values: workbooks[spreadsheetId]?.[tabFromRange(range)] ?? [] },
        }),
        clear: async ({ spreadsheetId, range }: { spreadsheetId: string; range: string }) => {
          calls.clear.push({ spreadsheetId, range });
          const tab = tabFromRange(range);
          workbooks[spreadsheetId][tab] = [];
          return { data: {} };
        },
        update: async ({
          spreadsheetId,
          range,
          requestBody,
        }: {
          spreadsheetId: string;
          range: string;
          requestBody: { values: unknown[][] };
        }) => {
          calls.update.push({ spreadsheetId, range, requestBody });
          const tab = tabFromRange(range);
          workbooks[spreadsheetId][tab] = requestBody.values;
          return { data: { updatedRows: requestBody.values.length } };
        },
      },
    },
  };
}

describe("maternaly group tabs Node sync", () => {
  it("uses node, not tsx, from package.json", async () => {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

    expect(packageJson.scripts["maternaly:sheets:sync-group-tabs"]).toBe(
      "node scripts/maternaly-sheets-sync-group-tabs.mjs",
    );
  });

  it("copies the sync script into the Docker runner", async () => {
    const dockerfile = await readFile(path.join(repoRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toContain(
      "/app/scripts/maternaly-sheets-sync-group-tabs.mjs ./scripts/maternaly-sheets-sync-group-tabs.mjs",
    );
  });

  it("groups registrations by grupo_id", () => {
    const plans = buildGroupPlans({
      service: { serviceKey: "pilates", label: "Pilates", shortLabel: "Pilates", sheetId: "sheet" },
      tabs: {
        Grupos_Ediciones: { rows: pilatesWorkbook().Grupos_Ediciones.slice(1).map((row) => Object.fromEntries(GROUP_HEADERS.map((header, index) => [header, row[index] ?? ""]))) },
        Sesiones: { rows: pilatesWorkbook().Sesiones.slice(1).map((row) => Object.fromEntries(SESSION_HEADERS.map((header, index) => [header, row[index] ?? ""]))) },
        Inscripciones: { rows: pilatesWorkbook().Inscripciones.slice(1).map((row) => Object.fromEntries(REGISTRATION_HEADERS.map((header, index) => [header, row[index] ?? ""]))) },
        Clientes_Local: { rows: [] },
      },
      now: new Date("2026-06-25T00:00:00.000Z"),
    });

    expect(plans.map((plan) => plan.groupId)).toEqual([
      "pilates_bilbao_10",
      "pilates_bilbao_11",
      "pilates_erandio_13",
    ]);
    expect(plans.map((plan) => plan.registrationsCount)).toEqual([1, 1, 1]);
  });

  it("keeps Pilates 10, 11 and 13 in separate generated tabs", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-group-tabs-pilates-"));
    const workbooks = { sheet_charla_1234567890: pilatesWorkbook(), sheet_blw_1234567890: blwWorkbook() };
    const sheets = fakeSheets(workbooks);

    try {
      const result = await runGroupTabsSync({
        env: syncEnv({ MATERNALY_GROUP_TABS_REPORT_DIR: reportDir }),
        now: new Date("2026-06-25T00:00:00.000Z"),
        sheets,
      });

      const pilates = result.services.find((service) => service.serviceKey === "charla_embarazo_1_20");
      expect(result.ok).toBe(true);
      expect(pilates?.groups.map((group) => group.tabTitle)).toEqual([
        "GRP Pilates Bilbao 10",
        "GRP Pilates Bilbao 11",
        "GRP Pilates Erandio 13",
      ]);
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("keeps BLW tabs separate by date and sede", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-group-tabs-blw-"));
    const workbooks = { sheet_blw_1234567890: blwWorkbook() };
    const sheets = fakeSheets(workbooks);

    try {
      const result = await runGroupTabsSync({
        env: syncEnv({
          MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "",
          MATERNALY_NORMALIZED_SERVICE_IDS: "taller_blw",
          MATERNALY_NORMALIZED_SHEET_IDS: "sheet_blw_1234567890",
          MATERNALY_GROUP_TABS_REPORT_DIR: reportDir,
        }),
        now: new Date("2026-06-25T00:00:00.000Z"),
        sheets,
      });

      expect(result.services[0].groups.map((group) => group.tabTitle)).toEqual([
        "GRP BLW Erandio 2026-09-02",
        "GRP BLW Bilbao 2026-09-09",
      ]);
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("includes or excludes empty groups by flag", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-group-tabs-empty-"));
    const workbooks = { sheet_charla_1234567890: emptyGroupsWorkbook() };
    const sheets = fakeSheets(workbooks);

    try {
      const excluded = await runGroupTabsSync({
        env: syncEnv({
          MATERNALY_BLW_SHEET_ID: "",
          MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20",
          MATERNALY_NORMALIZED_SHEET_IDS: "sheet_charla_1234567890",
          MATERNALY_GROUP_TABS_REPORT_DIR: reportDir,
        }),
        now: new Date("2026-06-25T00:00:00.000Z"),
        sheets,
      });
      const included = await runGroupTabsSync({
        env: syncEnv({
          MATERNALY_BLW_SHEET_ID: "",
          MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20",
          MATERNALY_NORMALIZED_SHEET_IDS: "sheet_charla_1234567890",
          MATERNALY_GROUP_TABS_INCLUDE_EMPTY: "true",
          MATERNALY_GROUP_TABS_REPORT_DIR: reportDir,
        }),
        now: new Date("2026-06-25T00:00:00.000Z"),
        sheets,
      });

      expect(excluded.services[0].groups.map((group) => group.groupId)).toEqual(["charla_erandio_20260924"]);
      expect(included.services[0].groups.map((group) => group.groupId)).toEqual([
        "charla_erandio_20260924",
        "charla_bilbao_20261001",
      ]);
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("does not modify Inscripciones and does not touch tabs without the managed prefix", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-group-tabs-guard-"));
    const workbook = pilatesWorkbook();
    const beforeInscripciones = JSON.stringify(workbook.Inscripciones);
    const beforeManual = JSON.stringify(workbook["Notas internas"]);
    const workbooks = { sheet_charla_1234567890: workbook };
    const sheets = fakeSheets(workbooks);

    try {
      await runGroupTabsSync({
        env: syncEnv({
          MATERNALY_GROUP_TABS_SYNC_MODE: "live",
          MATERNALY_GROUP_TABS_SYNC_ENABLED: "true",
          MATERNALY_GROUP_TABS_SYNC_ALLOW_WRITE: "true",
          MATERNALY_BLW_SHEET_ID: "",
          MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20",
          MATERNALY_NORMALIZED_SHEET_IDS: "sheet_charla_1234567890",
          MATERNALY_GROUP_TABS_REPORT_DIR: reportDir,
        }),
        now: new Date("2026-06-25T00:00:00.000Z"),
        sheets,
      });

      expect(JSON.stringify(workbook.Inscripciones)).toBe(beforeInscripciones);
      expect(JSON.stringify(workbook["Notas internas"])).toBe(beforeManual);
      expect(sheets.calls.clear.map((call) => (call as { range: string }).range)).not.toContain("'Notas internas'!A:AZ");
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("does not call write APIs in dry-run mode", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-group-tabs-dry-"));
    const workbooks = { sheet_blw_1234567890: blwWorkbook() };
    const sheets = fakeSheets(workbooks);

    try {
      const result = await runGroupTabsSync({
        env: syncEnv({
          MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "",
          MATERNALY_NORMALIZED_SERVICE_IDS: "taller_blw",
          MATERNALY_NORMALIZED_SHEET_IDS: "sheet_blw_1234567890",
          MATERNALY_GROUP_TABS_REPORT_DIR: reportDir,
        }),
        now: new Date("2026-06-25T00:00:00.000Z"),
        sheets,
      });

      expect(result.reason).toBe("dry_run");
      expect(result.liveWriteAttempted).toBe(false);
      expect(sheets.calls.batchUpdate).toEqual([]);
      expect(sheets.calls.clear).toEqual([]);
      expect(sheets.calls.update).toEqual([]);
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("fake live creates, updates and applies formatting to generated tabs", async () => {
    const reportDir = await mkdtemp(path.join(tmpdir(), "maternaly-group-tabs-live-"));
    const workbooks = { sheet_charla_1234567890: pilatesWorkbook() };
    const sheets = fakeSheets(workbooks);

    try {
      const result = await runGroupTabsSync({
        env: syncEnv({
          MATERNALY_GROUP_TABS_SYNC_MODE: "live",
          MATERNALY_GROUP_TABS_SYNC_ENABLED: "true",
          MATERNALY_GROUP_TABS_SYNC_ALLOW_WRITE: "true",
          MATERNALY_BLW_SHEET_ID: "",
          MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20",
          MATERNALY_NORMALIZED_SHEET_IDS: "sheet_charla_1234567890",
          MATERNALY_GROUP_TABS_REPORT_DIR: reportDir,
        }),
        now: new Date("2026-06-25T00:00:00.000Z"),
        sheets,
      });

      expect(result.ok).toBe(true);
      expect(result.writesApplied).toBe(3);
      expect(result.services[0]).toMatchObject({ tabsCreated: 2, tabsUpdated: 1 });
      expect(workbooks.sheet_charla_1234567890["GRP Pilates Bilbao 10"][0]).toEqual([
        "Inscripciones — Pilates Bilbao 10",
      ]);
      expect(workbooks.sheet_charla_1234567890["GRP Pilates Bilbao 11"]).toBeDefined();
      expect(JSON.stringify(sheets.calls.batchUpdate)).toContain("addSheet");
      expect(JSON.stringify(sheets.calls.batchUpdate)).toContain("repeatCell");
      expect(JSON.stringify(sheets.calls.batchUpdate)).toContain("updateSheetProperties");
      expect(JSON.stringify(sheets.calls.batchUpdate)).toContain("autoResizeDimensions");
      expect(buildFormatRequests(100, 17, 5)).toHaveLength(6);
    } finally {
      await rm(reportDir, { recursive: true, force: true });
    }
  });

  it("sanitizes invalid tab title characters and adds collision suffixes", () => {
    const usedTitles = new Set<string>();
    const service = { serviceKey: "servicio/test", label: "Servicio/Test", shortLabel: "Servicio/Test", sheetId: "sheet" };
    const first = buildGroupTabTitle({
      prefix: "GRP ",
      service,
      group: { groupId: "grupo_12345678", groupName: "Grupo * inválido / raro", center: "Bilbao" },
      session: { date: "2026-09-01", startTime: "10:00" },
      usedTitles,
    });
    const second = buildGroupTabTitle({
      prefix: "GRP ",
      service,
      group: { groupId: "grupo_87654321", groupName: "Grupo * inválido / raro", center: "Bilbao" },
      session: { date: "2026-09-01", startTime: "10:00" },
      usedTitles,
    });

    expect(first).not.toMatch(/[\[\]\*\/\\\?:]/);
    expect(second).not.toBe(first);
    expect(second).toContain("87654321");
  });

  it("redacts sheet IDs in reports", async () => {
    const rawSheetId = "sheet_blw_1234567890";
    const markdown = buildMarkdownReport({
      ok: true,
      skipped: true,
      reason: "dry_run",
      startedAt: "2026-06-25T00:00:00.000Z",
      mode: "dry_run",
      liveWriteAttempted: false,
      writesApplied: 0,
      validation: {
        prefix: "GRP ",
        includeEmpty: false,
        targetSheetIds: [
          {
            serviceKey: "taller_blw",
            configured: true,
            redactedSheetId: redactSheetId(rawSheetId),
          },
        ],
      },
      services: [],
    });

    expect(redactSheetId(rawSheetId)).not.toBe(rawSheetId);
    expect(markdown).toContain(redactSheetId(rawSheetId));
    expect(markdown).not.toContain(rawSheetId);
  });

  it("skips safely without credentials or sheet IDs", () => {
    const withoutSheet = validateGroupTabsEnvironment({});
    const withoutCredentials = validateGroupTabsEnvironment({
      MATERNALY_BLW_SHEET_ID: "sheet_blw_1234567890",
    });

    expect(withoutSheet.ready).toBe(false);
    expect(withoutSheet.primaryReason).toBe("missing_service_sheet_ids");
    expect(withoutCredentials.ready).toBe(false);
    expect(withoutCredentials.primaryReason).toBe("google_credentials_missing");
  });

  it("builds the expected generated tab values with source warning", () => {
    const values = buildTabValues({
      groupName: "Taller BLW Erandio",
      serviceLabel: "BLW",
      center: "Erandio",
      modality: "Presencial",
      horario: "2026-09-02 17:00-20:00",
      date: "2026-09-02",
      capacity: 14,
      generatedAt: "2026-06-25T00:00:00.000Z",
      rows: [
        {
          inscripcion_id: "ins_1",
          cliente_id: "cli_1",
          nombre: "Irati",
          apellidos: "Sanz",
          telefono: "+34600000004",
          email: "irati@example.test",
          grupo_id: "blw_erandio_20260902",
          servicio_id: "taller_blw",
          fecha_inscripcion: "2026-06-04",
          canal_origen: "whatsapp",
          precio_acordado: "45",
          estado_pago: "pendiente",
          estado_inscripcion: "activa",
          fpp: "",
          fecha_nacimiento_bebe: "2026-01-10",
          pareja_nombre: "",
          observaciones: "",
        },
      ],
    });

    expect(values[0]).toEqual(["Inscripciones — Taller BLW Erandio"]);
    expect(values[2]).toEqual([
      "VISTA GENERADA AUTOMÁTICAMENTE. Editar la pestaña Inscripciones como fuente de verdad.",
    ]);
    expect(values[3]).toContain("inscripcion_id");
    expect(values[4][5]).toBe("irati@example.test");
  });
});
