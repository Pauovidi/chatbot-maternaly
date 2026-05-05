import { describe, expect, it, vi } from "vitest";

import type { DemoReservationRecord } from "@/lib/hotel/integrations/types";
import { seedBlankMonthMatrix } from "../structure";

const googleMock = vi.hoisted(() => {
  const valuesGet = vi.fn(async () => ({ data: { values: buildMatrix() } }));
  const spreadsheetsGet = vi.fn(async () => ({
    data: {
      sheets: [{ properties: { sheetId: 123, title: "AGOSTO 2026" } }],
    },
  }));
  const valuesBatchUpdate = vi.fn(async () => ({ data: { updatedCells: 3 } }));
  const batchUpdate = vi.fn(async () => ({ data: { replies: [] } }));
  const setCredentials = vi.fn();

  class OAuth2 {
    setCredentials = setCredentials;
  }

  class GoogleAuth {
    async getClient(): Promise<Record<string, never>> {
      return {};
    }
  }

  const sheets = vi.fn(() => ({
    spreadsheets: {
      get: spreadsheetsGet,
      values: {
        get: valuesGet,
        batchUpdate: valuesBatchUpdate,
      },
      batchUpdate,
    },
  }));

  return {
    valuesGet,
    spreadsheetsGet,
    valuesBatchUpdate,
    batchUpdate,
    setCredentials,
    sheets,
    OAuth2,
    GoogleAuth,
  };
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: googleMock.OAuth2,
      GoogleAuth: googleMock.GoogleAuth,
    },
    sheets: googleMock.sheets,
  },
}));

import { buildGoogleSheetAdapter } from "../google";

function buildMatrix(): string[][] {
  const values = seedBlankMonthMatrix("2026-08");
  values[3][1] = "DANA";
  values[3][2] = "DANA";
  values[3][3] = "DANA";
  values[4][1] = "PILI";
  values[4][2] = "PILI";
  values[5][1] = "LUNA";
  values[5][2] = "LUNA";
  return values;
}

describe("Google Sheets adapter", () => {
  it("lee, prepara escritura y aplica requests reales contra la API", async () => {
    const adapter = await buildGoogleSheetAdapter(
      {
        mode: "real",
        spreadsheetId: "sheet-1",
        accessToken: "token",
      },
    );

    const reservation: DemoReservationRecord = {
      id: "res-google-1",
      petKey: "nala::marta",
      petName: "Nala",
      ownerName: "Marta",
      phoneE164: "+34600111222",
      entryDate: "2026-08-08",
      entrySlot: "morning",
      exitDate: "2026-08-10",
      exitSlot: "morning",
      dogs: 1,
      notes: "demo",
      status: "confirmed",
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan = await adapter.buildWritePlan(reservation);
    const result = await adapter.writeReservation(reservation);

    expect(plan.rowHint).toBeGreaterThanOrEqual(3);
    expect(plan.cellUpdates.length).toBeGreaterThan(0);
    expect(result.mode).toBe("real");
    expect(googleMock.sheets).toHaveBeenCalled();
    expect(googleMock.spreadsheetsGet).toHaveBeenCalled();
    expect(googleMock.valuesGet).toHaveBeenCalled();
    expect(googleMock.valuesBatchUpdate).toHaveBeenCalled();
    expect(googleMock.batchUpdate).toHaveBeenCalled();
  });
});
