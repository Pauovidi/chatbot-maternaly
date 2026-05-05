import { describe, expect, it } from "vitest";
import { evaluateAvailability } from "./engine";
import { demoAvailabilityConfig } from "./config";

describe("availability engine", () => {
  it("entrada mañana y salida mañana ocupa un solo slot", () => {
    const result = evaluateAvailability({
      requestedWindow: {
        checkIn: { date: "2026-05-10", slot: "morning" },
        checkOut: { date: "2026-05-10", slot: "morning" },
      },
      requestedUnits: 1,
      existingStays: [],
      capacity: demoAvailabilityConfig,
    });

    expect(result.status).toBe("available_standard");
    expect(result.occupiedSlotCount).toBe(1);
    expect(result.slotSnapshots).toHaveLength(1);
  });

  it("entrada tarde y salida mañana ocupa dos slots", () => {
    const result = evaluateAvailability({
      requestedWindow: {
        checkIn: { date: "2026-05-10", slot: "afternoon" },
        checkOut: { date: "2026-05-11", slot: "morning" },
      },
      requestedUnits: 1,
      existingStays: [],
      capacity: demoAvailabilityConfig,
    });

    expect(result.status).toBe("available_standard");
    expect(result.occupiedSlotCount).toBe(2);
    expect(result.slotSnapshots).toHaveLength(2);
  });

  it("una salida por la mañana libera hueco para entrada por la tarde del mismo día", () => {
    const result = evaluateAvailability({
      requestedWindow: {
        checkIn: { date: "2026-04-03", slot: "afternoon" },
        checkOut: { date: "2026-04-04", slot: "morning" },
      },
      requestedUnits: 1,
      existingStays: [
        {
          id: "same-day-release",
          units: 1,
          window: {
            checkIn: { date: "2026-04-02", slot: "morning" },
            checkOut: { date: "2026-04-03", slot: "morning" },
          },
        },
      ],
      capacity: demoAvailabilityConfig,
    });

    expect(result.status).toBe("available_standard");
  });

  it("detecta falta de disponibilidad ante conflicto parcial", () => {
    const result = evaluateAvailability({
      requestedWindow: {
        checkIn: { date: "2026-04-04", slot: "morning" },
        checkOut: { date: "2026-04-05", slot: "morning" },
      },
      requestedUnits: 8,
      existingStays: [
        {
          id: "busy",
          units: 14,
          window: {
            checkIn: { date: "2026-04-04", slot: "morning" },
            checkOut: { date: "2026-04-05", slot: "morning" },
          },
        },
      ],
      capacity: {
        standardUnits: 18,
        overflowUnits: 0,
        overflowEnabled: false,
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.bottlenecks.length).toBeGreaterThan(0);
  });
});
