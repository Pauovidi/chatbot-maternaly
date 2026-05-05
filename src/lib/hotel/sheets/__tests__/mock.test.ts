import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { DemoReservationRecord } from "@/lib/hotel/integrations/types";
import { loadDemoState } from "@/lib/hotel/persistence/store";
import { buildMockSheetAdapter } from "../mock";

function buildReservation(entryDate: string, exitDate: string): DemoReservationRecord {
  return {
    id: randomUUID(),
    petKey: "nala::marta",
    petName: "Nala",
    ownerName: "Marta",
    phoneE164: "+34600111222",
    entryDate,
    entrySlot: "morning",
    exitDate,
    exitSlot: "morning",
    dogs: 1,
    notes: "demo",
    status: "confirmed",
    source: "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("Mock Sheets adapter", () => {
  it("persista una reserva y actualiza la snapshot mensual", async () => {
    const storeName = `sheets-test-${randomUUID()}.json`;
    const adapter = await buildMockSheetAdapter(storeName);
    const reservation = buildReservation("2026-08-12", "2026-08-14");

    const before = await adapter.readMonth("2026-08");
    const result = await adapter.writeReservation(reservation);
    const after = await adapter.readMonth("2026-08");
    const persisted = await loadDemoState(storeName);

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("mock");
    expect(after.reservations.some((item) => item.petName === reservation.petName)).toBe(true);
    expect(after.occupiedByDate["2026-08-12"]?.morning).toBeGreaterThanOrEqual(
      before.occupiedByDate["2026-08-12"]?.morning ?? 0,
    );
    expect(persisted.reservations.some((item) => item.id === reservation.id)).toBe(true);
  });

  it("revalida disponibilidad antes de escribir y evita dobles reservas", async () => {
    const storeName = `sheets-test-${randomUUID()}.json`;
    const adapter = await buildMockSheetAdapter(storeName);
    const reservation = buildReservation("2026-08-20", "2026-08-21");
    reservation.dogs = 16;
    const conflicting = buildReservation("2026-08-20", "2026-08-21");
    conflicting.id = randomUUID();

    await adapter.writeReservation(reservation);

    await expect(adapter.writeReservation(conflicting)).rejects.toThrow(
      "No hay disponibilidad",
    );
  });

  it("cancela una reserva escrita y deja trazabilidad de celdas liberadas", async () => {
    const storeName = `sheets-test-${randomUUID()}.json`;
    const adapter = await buildMockSheetAdapter(storeName);
    const reservation = buildReservation("2026-08-22", "2026-08-23");

    const write = await adapter.writeReservation(reservation);
    const cancellation = await adapter.cancelReservation(reservation.id);
    const persisted = await loadDemoState(storeName);

    expect(cancellation.ok).toBe(true);
    expect(cancellation.clearedCells).toEqual(write.cellUpdates.map((update) => update.cell));
    expect(cancellation.metadataUpdates[0]?.note).toContain("SMP_CANCELLED_RESERVATION_ID");
    expect(persisted.reservations.find((item) => item.id === reservation.id)?.status).toBe("cancelled");
  });

  it("rechaza cancelar una reserva inexistente", async () => {
    const storeName = `sheets-test-${randomUUID()}.json`;
    const adapter = await buildMockSheetAdapter(storeName);

    await expect(adapter.cancelReservation("missing-reservation")).rejects.toThrow(
      "No se ha encontrado la reserva missing-reservation",
    );
  });
});
