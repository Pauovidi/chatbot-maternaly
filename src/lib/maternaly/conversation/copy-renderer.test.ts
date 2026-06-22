import { describe, expect, it } from "vitest";
import {
  MaternalyCopyRenderer,
  type MaternalyCopyToolResult,
} from "@/lib/maternaly/conversation/copy-renderer";

describe("MaternalyCopyRenderer availability guardrails", () => {
  it("renders sessions instead of availability fallback when sessions are present", () => {
    const renderer = new MaternalyCopyRenderer();
    const toolResult: MaternalyCopyToolResult = {
      status: "read_error",
      serviceKey: "taller_blw",
      sessions: [
        {
          serviceKey: "taller_blw",
          serviceLabel: "Taller BLW",
          groupId: "grupo_blw_erandio",
          groupName: "Erandio",
          sessionId: "sesion_blw_erandio_20260902",
          sessionName: "Taller BLW",
          date: "2026-09-02",
          startTime: "17:00",
          endTime: "20:00",
          capacityTotal: 14,
          occupied: 0,
          availableSeats: 14,
          full: false,
          availabilityStatus: "available",
        },
      ],
      missingFields: [],
    };

    const reply = renderer.render({
      decision: {
        action: "normalized_registration",
        serviceKey: "taller_blw",
      },
      toolResult,
    });

    expect(reply).toContain("Opciones para Taller BLW");
    expect(reply).toContain("2026-09-02 17:00 Erandio (14 plazas disponibles)");
    expect(reply).not.toMatch(/no puedo validar disponibilidad/i);
  });
});
