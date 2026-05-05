import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOTEL_SHEET_BOOTSTRAP_SOURCE,
  inspectHotelWorkbook,
} from "../bootstrap-excel";

describe("Client workbook inspection", () => {
  it.skipIf(!existsSync(DEFAULT_HOTEL_SHEET_BOOTSTRAP_SOURCE))(
    "detects the real client workbook contract",
    async () => {
      const inspection = await inspectHotelWorkbook(
        DEFAULT_HOTEL_SHEET_BOOTSTRAP_SOURCE,
      );

      expect(inspection.sheetNames).toContain("NIVEL DE OCUPACIÓN");
      expect(inspection.monthlySheets).toContain("ENERO 2026");
      expect(inspection.rejectedSheets.length).toBeGreaterThan(0);
      expect(inspection.monthSheetMap["2026-01"]).toBe("ENERO 2026");
      expect(inspection.derivedLayout.dayHeaderRowIndex).toBe(3);
      expect(inspection.derivedLayout.firstDataRowIndex).toBe(4);
      expect(inspection.derivedLayout.lastDataRowIndex).toBe(39);
      expect(inspection.legendRows.some((item) => item.label === "Sociable")).toBe(
        true,
      );
    },
    15000,
  );
});
