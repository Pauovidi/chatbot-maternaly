import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CopySheetsRealWriteService,
  MATERNALY_ORIGINAL_SHEET_IDS,
  addDaysLiteral,
  assertCopySheetAllowed,
  auditTab,
  buildTestAdnProposal,
  writeCopyWriteResultReports,
  type ReservationWritePlan,
} from "./copy-real-write";

const COPY_ID = "copy_sheet_1_allowed";
const rows = [
  ["Fecha", "Hora", "Profesional", "Prueba", "Sede", "Nombre", "Apellidos", "Telefono", "Email", "Estado", "Forma de pago", "Pago", "Observaciones"],
  ["01/06/2026", "10:00", "MAIDER", "DETESEX", "BILBAO", "Ana", "Cliente", "+34611111222", "ana@example.com", "", "", "", ""],
  ["04/06/2026", "17:10", "MAIDER", "DETESEX", "BILBAO", "Erika", "Ramirez", "+34600000123", "erika@test.com", "", "", "", ""],
  ["05/06/2026", "09:00", "MAIDER", "DETESEX", "BILBAO", "Cancelada", "", "", "", "CANCELADA", "", "", ""],
];

function configureCopyWrite() {
  vi.stubEnv("MATERNALY_COPY_SHEET_1_ID", COPY_ID);
  vi.stubEnv("MATERNALY_REAL_STRUCTURE_WRITE_ENABLED", "true");
  vi.stubEnv("MATERNALY_REAL_STRUCTURE_WRITE_MODE", "copy_only");
  vi.stubEnv("MATERNALY_DEMO_PAYMENT_LINK", "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh");
}

type FakeSheetsClient = {
  profileSpreadsheet: ReturnType<typeof vi.fn>;
  readTabSample: ReturnType<typeof vi.fn>;
  duplicateTab: ReturnType<typeof vi.fn>;
  appendRow: ReturnType<typeof vi.fn>;
};

function fakeClient(overrides: Partial<FakeSheetsClient> = {}): FakeSheetsClient {
  return {
    profileSpreadsheet: vi.fn(async () => ({
      spreadsheetId: COPY_ID,
      title: "Maternaly copia demo",
      readMethod: "service_account",
      tabs: [{ title: "Reservas", gid: 123 }],
    })),
    readTabSample: vi.fn(async () => rows),
    duplicateTab: vi.fn(async () => ({ backupSheetId: 456, title: "BACKUP_BOT_20260602_Reservas" })),
    appendRow: vi.fn(async () => ({ updatedRange: "'Reservas'!A5:M5", updatedRows: 1 })),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Maternaly copy-only real structure write policy", () => {
  it("aborts if the sheet ID is an original", () => {
    expect(assertCopySheetAllowed(MATERNALY_ORIGINAL_SHEET_IDS[0], {
      copySheetIds: [MATERNALY_ORIGINAL_SHEET_IDS[0]],
      originalSheetIds: [...MATERNALY_ORIGINAL_SHEET_IDS],
      writeEnabled: true,
      writeMode: "copy_only",
      paymentLink: "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh",
    })).toContain("Target spreadsheet is one of the protected original Maternaly Sheets.");
  });

  it("aborts if the sheet ID is not allowlisted as a copy", () => {
    expect(assertCopySheetAllowed("not_allowlisted", {
      copySheetIds: [COPY_ID],
      originalSheetIds: [...MATERNALY_ORIGINAL_SHEET_IDS],
      writeEnabled: true,
      writeMode: "copy_only",
      paymentLink: "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh",
    })).toContain("Target spreadsheet is not allowlisted as a copy.");
  });

  it("detects the last valid non-cancelled row and proposes +4 days at 18:20", () => {
    const audit = auditTab("Reservas", 123, rows);
    expect(audit.lastValidRow?.date).toBe("04/06/2026");
    expect(audit.lastValidRow?.time).toBe("17:10");
    expect(buildTestAdnProposal(audit.lastValidRow!).proposedDate).toBe("08/06/2026");
    expect(buildTestAdnProposal(audit.lastValidRow!).proposedTime).toBe("18:20");
    expect(`${buildTestAdnProposal(audit.lastValidRow!).proposedDate} ${buildTestAdnProposal(audit.lastValidRow!).proposedTime}`).not.toBe("04/06/2026 17:10");
    expect(addDaysLiteral("04/06/2026", 4)).toBe("08/06/2026");
  });

  it("aborts before writing if copy-write flags are disabled and no backup exists", async () => {
    vi.stubEnv("MATERNALY_COPY_SHEET_1_ID", COPY_ID);
    const service = new CopySheetsRealWriteService(fakeClient() as never);
    const report = await service.writeTestAdnReservation({
      fullName: "Erika Ramirez",
      email: "erika@test.com",
      phone: "+34600000123",
      selectedLocation: "BILBAO",
    });

    expect(report.applied).toBe(false);
    expect(report.plan.backupCreated).toBe(false);
    expect(report.error).toMatch(/WRITE_ENABLED|copy_only|not true/i);
  });

  it("creates a backup and appends a new row without overwriting the last row", async () => {
    configureCopyWrite();
    const client = fakeClient();
    const service = new CopySheetsRealWriteService(client as never);
    const report = await service.writeTestAdnReservation({
      fullName: "Erika Ramirez",
      email: "erika@test.com",
      phone: "+34600000123",
      selectedLocation: "BILBAO",
    });

    expect(report.applied).toBe(true);
    expect(report.plan.operation).toBe("append");
    expect(report.plan.backupCreated).toBe(true);
    expect(report.plan.targetRange).toBe("'Reservas'!A5:M5");
    expect(client.duplicateTab).toHaveBeenCalledBefore(client.appendRow);
    expect(client.appendRow).toHaveBeenCalledTimes(1);
    expect(report.plan.sourceLastRowReference.rowNumber).toBe(3);
  });

  it("writes Bilbao and Erandio according to the user choice", async () => {
    configureCopyWrite();
    const service = new CopySheetsRealWriteService(fakeClient() as never);
    const bilbao = await service.writeTestAdnReservation({
      fullName: "Erika Ramirez",
      email: "erika@test.com",
      phone: "+34600000123",
      selectedLocation: "BILBAO",
    });
    const erandio = await service.writeTestAdnReservation({
      fullName: "Erika Ramirez",
      email: "erika@test.com",
      phone: "+34600000123",
      selectedLocation: "ERANDIO",
    });

    expect(bilbao.plan.selectedLocation).toBe("BILBAO");
    expect(bilbao.plan.fields.location).toBe("BILBAO");
    expect(erandio.plan.selectedLocation).toBe("ERANDIO");
    expect(erandio.plan.fields.location).toBe("ERANDIO");
  });

  it("reports 403 as missing Editor permissions", async () => {
    configureCopyWrite();
    const service = new CopySheetsRealWriteService(fakeClient({
      duplicateTab: vi.fn(async () => {
        throw new Error("403 The caller does not have permission");
      }),
      appendRow: vi.fn(async () => {
        throw new Error("append should not run");
      }),
    }) as never);
    const report = await service.writeTestAdnReservation({
      fullName: "Erika Ramirez",
      email: "erika@test.com",
      phone: "+34600000123",
      selectedLocation: "BILBAO",
    });

    expect(report.applied).toBe(false);
    expect(report.error).toMatch(/Editor permissions|Editor/i);
  });

  it("redacts PII in generated write reports", async () => {
    const tmp = path.join(process.cwd(), "reports");
    await mkdir(tmp, { recursive: true });
    const plan = {
      operation: "append",
      targetSpreadsheetId: COPY_ID,
      targetSpreadsheetIdRedacted: "copy_s...owed",
      targetTab: "Reservas",
      sourceLastRowReference: { rowNumber: 3, values: [], date: "04/06/2026", time: "17:10" },
      proposedDate: "08/06/2026",
      proposedTime: "18:20",
      selectedLocation: "BILBAO",
      service: "TEST ADN / DETESEX",
      customer: { fullName: "Erika Ramirez", email: "erika@test.com", phone: "+34600000123" },
      customerRedacted: { fullName: "[REDACTED_NAME]", email: "e***@test.com", phone: "+34******123" },
      paymentLink: "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh",
      fields: {},
      riskLevel: "medium",
      manualReviewRequired: false,
      originalSheetProtected: true,
      copyOnly: true,
      backupCreated: true,
      allowedByPolicy: true,
    } satisfies ReservationWritePlan;
    const reports = await writeCopyWriteResultReports({ generatedAt: "2026-06-02T00:00:00.000Z", plan, applied: true });
    const json = await readFile(reports.jsonPath, "utf8");

    expect(json).not.toContain("Erika Ramirez");
    expect(json).not.toContain("erika@test.com");
    expect(json).not.toContain("+34600000123");
    expect(json).toContain("[REDACTED_NAME]");
    expect(json).toContain("e***@test.com");
  });
});
