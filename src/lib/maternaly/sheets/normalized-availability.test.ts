import { describe, expect, it } from "vitest";
import { readNormalizedServiceSheet } from "@/lib/maternaly/sheets/normalized-client";
import {
  calculateSessionOccupancy,
  listAvailableSessionsFromSnapshot,
  registrationOccupiesCapacity,
} from "@/lib/maternaly/sheets/normalized-availability";
import {
  InMemoryNormalizedSheetsClient,
  createNormalizedWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

describe("normalized Maternaly availability", () => {
  it("reads a normalized BLW sheet and lists sessions", async () => {
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook());
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const sessions = listAvailableSessionsFromSnapshot(snapshot);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      serviceKey: "taller_blw",
      sessionId: "sesion_blw_bilbao_20260925",
      availableSeats: 3,
      availabilityStatus: "available",
    });
  });

  it("subtracts active and pending registrations from capacity", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createNormalizedWorkbook({
        registrations: [
          ["taller_blw", "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", "Activa"],
          ["taller_blw", "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", "Pendiente confirmar"],
        ],
      }),
    );
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const sessions = listAvailableSessionsFromSnapshot(snapshot);

    expect(sessions[0]?.occupied).toBe(2);
    expect(sessions[0]?.availableSeats).toBe(1);
  });

  it("does not count cancelled or rejected registrations as occupied", async () => {
    expect(registrationOccupiesCapacity("Cancelada")).toBe(false);
    expect(registrationOccupiesCapacity("Anulada")).toBe(false);
    expect(registrationOccupiesCapacity("Rechazada")).toBe(false);

    const client = new InMemoryNormalizedSheetsClient(
      createNormalizedWorkbook({
        registrations: [
          ["taller_blw", "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", "Cancelada"],
          ["taller_blw", "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", "Confirmada"],
        ],
      }),
    );
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());

    expect(
      calculateSessionOccupancy({
        registrations: snapshot.tabs.Inscripciones.rows,
        sessionId: "sesion_blw_bilbao_20260925",
        groupId: "grupo_blw_bilbao",
      }),
    ).toBe(1);
  });
});
