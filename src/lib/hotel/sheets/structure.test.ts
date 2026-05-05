import { describe, expect, it } from "vitest";

import type { DemoReservationRecord } from "@/lib/hotel/integrations/types";
import {
  buildWritePlanForReservation,
  findAvailableRowForReservation,
  seedBlankMonthMatrix,
  validateMonthGrid,
} from "./structure";

const slotGridContext = {
  layout: {
    titleRowIndex: 0,
    titleRequired: false,
    dayCount: 3,
    labelColumnIndex: 1,
    firstDayColumnIndex: 2,
    lastDayColumnIndex: 7,
    lastRelevantColumnIndex: 7,
    firstDataRowIndex: 3,
    lastDataRowIndex: 6,
    overflowRowStartIndex: 6,
    overflowRowEndIndex: 6,
    summaryRowStartIndex: 7,
    summaryRowEndIndex: 9,
    occupancyMode: "slot-grid" as const,
    searchRowRanges: [{ startRowIndex: 3, endRowIndex: 6 }],
  },
};

function setCell(values: string[][], rowIndex: number, columnIndex: number, value: string) {
  while (values.length < rowIndex) {
    values.push([]);
  }

  const row = values[rowIndex - 1];
  while (row.length < columnIndex) {
    row.push("");
  }

  row[columnIndex - 1] = value;
}

describe("sheets structure adapter", () => {
  it("permite reutilizar el mismo día cuando una mañana queda libre para la tarde", () => {
    const values = seedBlankMonthMatrix("2026-04", slotGridContext);
    setCell(values, 3, 2, "Luna");

    const row = findAvailableRowForReservation(
      values,
      {
        entryDate: "2026-04-01",
        entrySlot: "afternoon",
        exitDate: "2026-04-01",
        exitSlot: "afternoon",
      },
      slotGridContext,
    );

    expect(row).toBe(4);
  });

  it("escribe todos los slots requeridos cuando la hoja usa grid morning/afternoon", () => {
    const values = seedBlankMonthMatrix("2026-04", slotGridContext);
    const reservation: DemoReservationRecord = {
      id: "res-1",
      petKey: "luna::34612345678",
      petName: "Luna",
      ownerName: "Ana",
      phoneE164: "+34612345678",
      entryDate: "2026-04-01",
      entrySlot: "afternoon",
      exitDate: "2026-04-01",
      exitSlot: "afternoon",
      dogs: 1,
      status: "confirmed",
      source: "manual",
      createdAt: "2026-03-25T10:00:00.000Z",
      updatedAt: "2026-03-25T10:00:00.000Z",
    };

    const plan = buildWritePlanForReservation(reservation, values, slotGridContext);

    expect(plan.cellUpdates).toHaveLength(2);
    expect(plan.cellUpdates).toEqual(
      expect.arrayContaining([
        { cell: "B4", value: "Luna" },
        { cell: "C4", value: "Luna" },
      ]),
    );
  });

  it("detecta estructura inválida cuando faltan encabezados de día", () => {
    const report = validateMonthGrid([["sin-días"]], "2026-04", slotGridContext);

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "missing_day_header")).toBe(true);
  });
});
