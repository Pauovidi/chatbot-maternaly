import { describe, expect, it } from "vitest";

import { normalizeReceptionTime, normalizeReservationMoment } from "./index";

describe("date normalization", () => {
  it("ajusta 12:00 a la hora valida mas cercana de manana", () => {
    const result = normalizeReceptionTime("12:00");

    expect(result.originalRequestedTime).toBe("12:00");
    expect(result.normalizedReceptionTime).toBe("11:00");
    expect(result.wasAdjusted).toBe(true);
    expect(result.turn).toBe("manana");
  });

  it("ajusta 15:00 a la hora operativa valida mas cercana en solicitudes", () => {
    const result = normalizeReservationMoment("2026-08-17 15:00", "entrada");

    expect(result.isoDate).toBe("2026-08-17");
    expect(result.time).toBe("15:00");
    expect(result.normalizedReceptionTime).toBe("16:30");
    expect(result.turn).toBe("tarde");
    expect(result.wasTimeAdjusted).toBe(true);
    expect(result.notes[0]).toContain("fuera del horario operativo");
  });

  it("no marca como ajustadas las horas ya validas", () => {
    const samples = [
      ["08:00", "manana"],
      ["11:00", "manana"],
      ["16:30", "tarde"],
      ["19:30", "tarde"],
    ] as const;

    for (const [time, turn] of samples) {
      const result = normalizeReceptionTime(time);

      expect(result.normalizedReceptionTime).toBe(time);
      expect(result.turn).toBe(turn);
      expect(result.wasAdjusted).toBe(false);
    }
  });

  it("cubre bordes cercanos a las ventanas oficiales", () => {
    expect(normalizeReceptionTime("07:59").normalizedReceptionTime).toBe("08:00");
    expect(normalizeReceptionTime("11:01").normalizedReceptionTime).toBe("11:00");
    expect(normalizeReceptionTime("16:29").normalizedReceptionTime).toBe("16:30");
    expect(normalizeReceptionTime("19:31").normalizedReceptionTime).toBe("19:30");
  });
});
