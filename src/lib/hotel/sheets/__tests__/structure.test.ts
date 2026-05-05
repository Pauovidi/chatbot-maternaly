import { describe, expect, it } from "vitest";

import type { DemoReservationRecord, SheetsAvailabilityInput } from "@/lib/hotel/integrations/types";
import {
  buildAvailabilityResult,
  buildMonthSnapshotFromGrid,
  buildWritePlanForReservation,
  seedBlankMonthMatrix,
  validateMonthGrid,
} from "../structure";

function setCell(values: string[][], rowIndex: number, columnIndex: number, value: string): void {
  while (values.length < rowIndex) {
    values.push([]);
  }

  const row = values[rowIndex - 1];
  while (row.length < columnIndex) {
    row.push("");
  }

  row[columnIndex - 1] = value;
}

function createWorkbookLikeMatrix(): string[][] {
  const values = seedBlankMonthMatrix("2026-08");
  setCell(values, 4, 2, "LUCIA");
  setCell(values, 4, 3, "LUCIA");
  setCell(values, 4, 4, "LUCIA");
  setCell(values, 6, 2, "BRUNO");
  setCell(values, 6, 3, "BRUNO");
  setCell(values, 6, 4, "BRUNO");
  return values;
}

describe("Sheets structure", () => {
  it("valida la estructura mensual y construye una snapshot por dias", () => {
    const values = createWorkbookLikeMatrix();
    const report = validateMonthGrid(values, "2026-08");
    const snapshot = buildMonthSnapshotFromGrid(values, "2026-08");

    expect(report.ok).toBe(true);
    expect(report.dayHeaders).toContain(1);
    expect(report.sheetName).toBe("AGOSTO 2026");
    expect(snapshot.sheetName).toBe("AGOSTO 2026");
    expect(snapshot.occupiedByDate["2026-08-01"]?.morning).toBe(2);
    expect(snapshot.occupiedByDate["2026-08-02"]?.morning).toBe(2);
    expect(snapshot.reservations.length).toBeGreaterThan(0);
  });

  it("permite la entrada por la tarde el mismo dia que una salida por la manana", () => {
    const values = createWorkbookLikeMatrix();
    const snapshot = buildMonthSnapshotFromGrid(values, "2026-08");
    const input: SheetsAvailabilityInput = {
      entryDate: "2026-08-04",
      entrySlot: "afternoon",
      exitDate: "2026-08-06",
      exitSlot: "morning",
      dogs: 1,
    };

    const result = buildAvailabilityResult(snapshot, input, values);
    expect(result.available).toBe(true);
    expect(result.conflicts.length).toBe(0);
  });

  it("permite una nueva entrada por la tarde si la reserva existente sale esa misma mañana", () => {
    const values = seedBlankMonthMatrix("2026-04");
    setCell(values, 4, 3, "LUCIA");
    setCell(values, 4, 4, "LUCIA");

    const snapshot = buildMonthSnapshotFromGrid(values, "2026-04");
    const result = buildAvailabilityResult(
      snapshot,
      {
        entryDate: "2026-04-03",
        entrySlot: "afternoon",
        exitDate: "2026-04-04",
        exitSlot: "morning",
        dogs: 1,
      },
      values,
    );

    expect(result.available).toBe(true);
    expect(result.debug?.analyzedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 4,
          label: "CHENIL 1",
          status: "free",
          conflictingSlots: [],
        }),
      ]),
    );
  });

  it("bloquea una nueva entrada por la mañana si la reserva existente sale esa misma mañana", () => {
    const values = seedBlankMonthMatrix("2026-04");
    setCell(values, 4, 3, "LUCIA");
    setCell(values, 4, 4, "LUCIA");

    const snapshot = buildMonthSnapshotFromGrid(values, "2026-04");
    const result = buildAvailabilityResult(
      snapshot,
      {
        entryDate: "2026-04-03",
        entrySlot: "morning",
        exitDate: "2026-04-04",
        exitSlot: "morning",
        dogs: 16,
      },
      values,
    );

    expect(result.available).toBe(false);
    expect(result.debug?.analyzedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 4,
          label: "CHENIL 1",
          status: "occupied",
          conflictingSlots: expect.arrayContaining(["2026-04-03:morning"]),
        }),
      ]),
    );
  });

  it("elige la primera fila libre al preparar la escritura", () => {
    const values = createWorkbookLikeMatrix();
    const reservation: DemoReservationRecord = {
      id: "res-1",
      petKey: "res-1",
      petName: "Nala",
      ownerName: "Marta",
      phoneE164: "+34600111222",
      entryDate: "2026-08-08",
      entrySlot: "morning",
      exitDate: "2026-08-10",
      exitSlot: "morning",
      dogs: 1,
      notes: "demo",
      status: "pending",
      source: "mock",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plan = buildWritePlanForReservation(reservation, values);
    expect(plan.rowHint).toBeGreaterThanOrEqual(3);
    expect(plan.cellUpdates.length).toBeGreaterThan(0);
  });

  it("encuentra CHENIL 3 libre del 1 al 5 de abril y explica el analisis tecnico", () => {
    const values = seedBlankMonthMatrix("2026-04");
    const requestedColumns = [2, 3, 4, 5, 6];
    const occupiedRows = [
      4, 5, 6, 7,
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
      34, 35,
    ];

    for (const rowIndex of occupiedRows) {
      for (const columnIndex of requestedColumns) {
        setCell(values, rowIndex, columnIndex, `OCUPADO-${rowIndex}`);
      }
    }

    const snapshot = buildMonthSnapshotFromGrid(values, "2026-04");
    const input: SheetsAvailabilityInput = {
      entryDate: "2026-04-01",
      entrySlot: "morning",
      exitDate: "2026-04-05",
      exitSlot: "afternoon",
      dogs: 1,
    };

    const result = buildAvailabilityResult(snapshot, input, values);

    expect(result.available).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.suggestedUnit).toEqual({
      rowIndex: 8,
      label: "CHENIL 3",
      sourceLabel: "HAB 3",
      rowIndices: [8, 9],
    });
    expect(result.suggestedUnits).toEqual([
      {
        rowIndex: 8,
        label: "CHENIL 3",
        sourceLabel: "HAB 3",
        rowIndices: [8, 9],
      },
    ]);
    expect(result.debug?.analyzedColumns.map((column) => column.columnLetter)).toEqual([
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
    expect(result.debug?.analyzedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 8,
          rowIndices: [8, 9],
          label: "CHENIL 3",
          status: "free",
          blockedCells: [],
          reason: "La unidad es compatible: no tiene ningún slot ocupado que choque con la nueva reserva.",
        }),
      ]),
    );
    expect(result.debug?.summary).toContain("CHENIL 3");
  });

  it("marca agosto del 17 al 28 como sin disponibilidad si ninguna unidad está libre durante todo el tramo", () => {
    const values = seedBlankMonthMatrix("2026-08");
    const requestedColumns = Array.from({ length: 12 }, (_, index) => 18 + index);
    const anchorRows = Array.from({ length: 16 }, (_, index) => 4 + index * 2);

    for (const rowIndex of anchorRows) {
      setCell(values, rowIndex, requestedColumns[0], `OCUPADO-${rowIndex}`);
    }

    const snapshot = buildMonthSnapshotFromGrid(values, "2026-08");
    const input: SheetsAvailabilityInput = {
      entryDate: "2026-08-17",
      entrySlot: "morning",
      exitDate: "2026-08-28",
      exitSlot: "morning",
      dogs: 1,
    };

    const result = buildAvailabilityResult(snapshot, input, values);

    expect(result.available).toBe(false);
    expect(result.suggestedUnit).toBeUndefined();
    expect(result.debug?.analyzedColumns.map((column) => column.columnLetter)).toEqual([
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "AA",
      "AB",
      "AC",
    ]);
    expect(result.debug?.analyzedRows).toHaveLength(16);
    expect(result.debug?.analyzedRows.every((row) => row.status === "occupied")).toBe(true);
    expect(result.debug?.summary).toContain("ninguna unidad completamente libre");
  });
});
