import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_SAMPLE_EMAIL,
  REAL_SAMPLE_EMAIL,
} from "./sample-emails";
import { parseReservationEmail } from "./extract";

describe("reservation email parser", () => {
  it("parsea el email real y normaliza las 13:00 a la hora operativa mas cercana", () => {
    const result = parseReservationEmail({
      subject: "Reserva real",
      rawText: REAL_SAMPLE_EMAIL,
    });

    expect(result.draft.reservationType).toBe("hotel");
    expect(result.draft.ownerName).toBe("carolina rodriguez lopez");
    expect(result.draft.ownerEmail).toBe("carolinarolopez381@gmail.com");
    expect(result.draft.phone).toBe("646376965");
    expect(result.draft.whatsapp).toBe("+34646376965");
    expect(result.draft.petName).toBe("luca");
    expect(result.draft.petSex).toBe("macho");
    expect(result.draft.petBreed).toBe("perro de agua");
    expect(result.draft.pets).toEqual([
      {
        name: "luca",
        sex: "macho",
        breed: "perro de agua",
        rawLine: "luca - Macho - perro de agua",
      },
    ]);
    expect(result.draft.checkInDate).toBe("2026-08-17");
    expect(result.draft.checkInTime).toBe("13:00");
    expect(result.draft.normalizedCheckInTime).toBe("11:00");
    expect(result.draft.checkInTurn).toBe("manana");
    expect(result.draft.checkInTimeWasAdjusted).toBe(true);
    expect(result.draft.checkOutDate).toBe("2026-08-28");
    expect(result.draft.checkOutTime).toBe("13:00");
    expect(result.draft.normalizedCheckOutTime).toBe("11:00");
    expect(result.draft.checkOutTurn).toBe("manana");
    expect(result.draft.checkOutTimeWasAdjusted).toBe(true);
    expect(result.draft.petCount).toBe(1);
    expect(result.draft.reviewState).toBe("ok");
    expect(result.draft.reviewFlags).not.toContain("invalid_slot");
  });

  it("marca pendiente un email incompleto", () => {
    const result = parseReservationEmail({
      subject: "Reserva incompleta",
      rawText: INCOMPLETE_SAMPLE_EMAIL,
    });

    expect(result.draft.petName).toBe("Nala");
    expect(result.draft.phone).toBeUndefined();
    expect(result.draft.reviewFlags).toContain("falta_telefono");
    expect(result.draft.reviewFlags).toContain("falta_fecha_salida");
  });
});
