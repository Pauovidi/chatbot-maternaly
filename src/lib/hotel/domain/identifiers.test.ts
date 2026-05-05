import { describe, expect, it } from "vitest";

import { buildReservationIdentity } from "./identifiers";

describe("reservation identity hardening", () => {
  it("evita colisiones cuando se repite el nombre del perro con teléfonos distintos", () => {
    const left = buildReservationIdentity({
      petName: "Luna",
      phone: "612 345 678",
      ownerName: "Ana",
      checkInDate: "2026-04-12",
      checkInSlot: "morning",
    });
    const right = buildReservationIdentity({
      petName: "Luna",
      phone: "699 555 444",
      ownerName: "Marta",
      checkInDate: "2026-04-12",
      checkInSlot: "morning",
    });

    expect(left.petKey).not.toBe(right.petKey);
    expect(left.clientKey).not.toBe(right.clientKey);
    expect(left.reservationId).not.toBe(right.reservationId);
  });
});
