import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

const googleMock = vi.hoisted(() => {
  const filesCreate = vi.fn(async () => ({
    data: {
      id: "spreadsheet-123",
      webViewLink: "https://docs.google.com/spreadsheets/d/spreadsheet-123/edit",
    },
  }));
  const permissionsCreate = vi.fn(async () => ({ data: { id: "perm-1" } }));
  const setCredentials = vi.fn();
  const generateAuthUrl = vi.fn(() => "https://accounts.google.com/mock");
  const getToken = vi.fn(async () => ({
    tokens: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expiry_date: 123456789,
    },
  }));

  class OAuth2 {
    setCredentials = setCredentials;
    generateAuthUrl = generateAuthUrl;
    getToken = getToken;
  }

  const drive = vi.fn(() => ({
    files: { create: filesCreate },
    permissions: { create: permissionsCreate },
  }));

  return { filesCreate, permissionsCreate, setCredentials, generateAuthUrl, getToken, OAuth2, drive };
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: googleMock.OAuth2,
    },
    drive: googleMock.drive,
  },
}));

import {
  bootstrapHotelSpreadsheetFromExcel,
  inspectHotelWorkbook,
} from "../bootstrap-excel";

async function buildWorkbookFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hotel-sheet-bootstrap-"));
  const path = join(dir, "fixture.xlsx");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ENERO 2026");
  sheet.mergeCells("A1:C1");
  sheet.getCell("A1").value = "TEMPORADA ALTA";
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF92D050" },
  };
  sheet.getCell("A2").value = "HAB 1";
  sheet.getCell("B2").value = 1;
  sheet.getCell("C2").value = 2;
  sheet.getCell("B3").value = { formula: "COUNTA(B2:B2)", result: 1 };
  sheet.getCell("A46").value = "Sociable";
  sheet.getCell("D46").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF92D050" },
  };

  const summary = workbook.addWorksheet("NIVEL DE OCUPACIÓN");
  summary.getCell("A1").value = "NIVEL DE OCUPACIÓN";
  summary.getCell("B1").value = { formula: "SUM(1,1)", result: 2 };

  await workbook.xlsx.writeFile(path);
  return path;
}

describe("Hotel Excel bootstrap", () => {
  it("inspects workbook structure and legend colors", async () => {
    const path = await buildWorkbookFixture();
    const inspection = await inspectHotelWorkbook(path);

    expect(inspection.sheetCount).toBe(2);
    expect(inspection.monthlySheets).toContain("ENERO 2026");
    expect(inspection.summarySheets).toContain("NIVEL DE OCUPACIÓN");
    expect(inspection.dominantMonthSheet?.formulaCells).toBeGreaterThan(0);
    expect(inspection.legendRows[0]?.label).toBe("Sociable");
    expect(inspection.legendRows[0]?.colorArgb).toBe("FF92D050");
  });

  it("creates and shares the converted Google Spreadsheet", async () => {
    const path = await buildWorkbookFixture();
    const tempDir = await mkdtemp(join(tmpdir(), "hotel-sheet-contract-"));
    const contractPath = join(tempDir, "contract.json");
    const tokenPath = join(tempDir, "oauth-token.json");
    await writeFile(
      tokenPath,
      JSON.stringify({
        access_token: "persisted-access-token",
        refresh_token: "persisted-refresh-token",
        expiry_date: 123456789,
      }),
      "utf8",
    );
    const result = await bootstrapHotelSpreadsheetFromExcel({
      sourcePath: path,
      spreadsheetTitle: "Hotel canino - reservas",
      shareWithEmail: "ops@example.com",
      serviceAccountEmail: "service@example.iam.gserviceaccount.com",
      oauthClientId: "client-id",
      oauthClientSecret: "client-secret",
      oauthRedirectUri: "http://127.0.0.1:3017/oauth2callback",
      oauthTokenPath: tokenPath,
      googleProjectId: "project-1",
      contractOutputPath: contractPath,
    });
    const persistedContract = JSON.parse(await readFile(contractPath, "utf8")) as {
      monthSheetMap?: Record<string, string>;
    };

    expect(result.spreadsheetId).toBe("spreadsheet-123");
    expect(result.spreadsheetUrl).toContain("spreadsheet-123");
    expect(result.sharedWithEmail).toBe("ops@example.com");
    expect(result.contractPath).toBe(contractPath);
    expect(result.contract.monthSheetMap?.["2026-01"]).toBe("ENERO 2026");
    expect(persistedContract.monthSheetMap?.["2026-01"]).toBe("ENERO 2026");
    expect(googleMock.setCredentials).toHaveBeenCalled();
    expect(googleMock.filesCreate).toHaveBeenCalled();
    expect(googleMock.permissionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "spreadsheet-123",
        requestBody: expect.objectContaining({
          emailAddress: "ops@example.com",
          role: "writer",
        }),
      }),
    );
  });
});
