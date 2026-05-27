import { describe, expect, it } from "vitest";
import { buildEntryLogRecord } from "./entry-log";
import type { ReservationRecord } from "../domain/contracts";

function reservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    reservationId: "res_test_001",
    petKey: "luna",
    status: "confirmada",
    reviewState: "ok",
    source: "demo",
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
    ownerName: "Cliente Test",
    petName: "Luna",
    phone: "+34 612 345 678",
    checkInDate: "2026-06-01",
    checkInSlot: "morning",
    checkOutDate: "2026-06-03",
    checkOutSlot: "afternoon",
    petCount: 1,
    reviewFlags: [],
    ...overrides,
  };
}

describe("entry log", () => {
  it("builds an operational entry from confirmed chatbot reservations", () => {
    const entry = buildEntryLogRecord(reservation());

    expect(entry).toMatchObject({
      reservationId: "res_test_001",
      source: "chatbot",
      action: "confirmada",
      clientName: "Cliente Test",
      clientStatus: "nuevo contacto",
      phoneNormalized: "+34612345678",
      petName: "Luna",
      gestetStatus: "pendiente Gestet",
    });
    expect(JSON.stringify(entry).toLowerCase()).not.toContain("nif");
    expect(JSON.stringify(entry).toLowerCase()).not.toContain("dni");
  });

  it("marks manual review entries without inventing processing state", () => {
    const entry = buildEntryLogRecord(
      reservation({
        status: "pendiente",
        reviewState: "necesita_revision",
        manualFollowupRequired: true,
        source: "manual",
      }),
    );

    expect(entry.source).toBe("manual/revisión");
    expect(entry.action).toBe("revisión manual");
    expect(entry.clientStatus).toBe("bloqueado/revisión");
    expect(entry.gestetStatus).toBe("pendiente Gestet");
  });
});
