import { describe, expect, it } from "vitest";
import { readNormalizedServiceSheet } from "@/lib/maternaly/sheets/normalized-client";
import {
  calculateSessionOccupancy,
  listAvailableSessionsFromSnapshot,
  registrationOccupiesCapacity,
} from "@/lib/maternaly/sheets/normalized-availability";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  createNormalizedWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";
import { rowsToObjects } from "@/lib/maternaly/sheets/normalized-template";

describe("normalized Maternaly availability", () => {
  it("detects normalized headers below visual title and help rows", () => {
    const parsed = rowsToObjects(
      [
        ["Sesiones"],
        ["Ayuda visual para la plantilla"],
        ["sesion_id", "grupo_id", "fecha", "hora_inicio", "hora_fin", "capacidad_total", "estado"],
        ["sesion_blw_erandio_20260902", "grupo_blw_erandio", "2026-09-02", "17:00", "20:00", "14", "Activa"],
      ],
      { tab: "Sesiones" },
    );

    expect(parsed.headerRowNumber).toBe(3);
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.headers).toContain("fecha");
    expect(parsed.rows[0]).toMatchObject({
      sesion_id: "sesion_blw_erandio_20260902",
      fecha: "2026-09-02",
      hora_inicio: "17:00",
      hora_fin: "20:00",
      capacidad_total: "14",
    });
  });

  it("keeps row-1 normalized headers working", () => {
    const parsed = rowsToObjects(
      [
        ["session_id", "group_id", "fecha", "hora_inicio"],
        ["sesion_1", "grupo_1", "2026-09-02", "17:00"],
      ],
      { tab: "Sesiones" },
    );

    expect(parsed.headerRowNumber).toBe(1);
    expect(parsed.rows[0]?.session_id).toBe("sesion_1");
  });

  it("does not use a visual title as headers when real headers are missing", () => {
    const parsed = rowsToObjects(
      [
        ["Sesiones"],
        ["Ayuda visual para la plantilla"],
        ["sin columnas reconocibles"],
        ["dato sin sentido"],
      ],
      { tab: "Sesiones" },
    );

    expect(parsed.headerRowIndex).toBe(-1);
    expect(parsed.parseError).toMatch(/header_not_found/);
    expect(parsed.headers).toEqual([]);
    expect(parsed.rows).toEqual([]);
  });

  it("reads a normalized BLW sheet and lists sessions", async () => {
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook());
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const sessions = listAvailableSessionsFromSnapshot(snapshot);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      serviceKey: "taller_blw",
      sessionId: "sesion_blw_bilbao_20260925",
      date: "2026-09-25",
      startTime: "17:00",
      endTime: "20:00",
      groupName: "Taller BLW Bilbao",
      capacityTotal: 3,
      availableSeats: 3,
      availabilityStatus: "available",
    });
  });

  it("reads shifted BLW template rows and returns real date, time, center and 14 seats", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createNormalizedWorkbook({ visualHeaderRows: true, multiSession: true, sessionCapacity: "14" }),
    );
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const sessions = listAvailableSessionsFromSnapshot(snapshot);

    expect(snapshot.tabs.Sesiones.headerRowNumber).toBe(3);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      date: "2026-09-25",
      startTime: "17:00",
      endTime: "20:00",
      groupName: "Taller BLW Bilbao",
      location: "Bilbao",
      modality: "presencial",
      capacityTotal: 14,
      availableSeats: 14,
    });
    expect(sessions[1]).toMatchObject({
      date: "2026-09-02",
      groupName: "Taller BLW Erandio",
      location: "Erandio",
      modality: "presencial",
      availableSeats: 14,
    });
  });

  it("reads real shifted template headers and uses center and direct available seats", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const sessions = listAvailableSessionsFromSnapshot(snapshot);

    expect(snapshot.tabs.Clientes_Local.headerRowNumber).toBe(3);
    expect(snapshot.tabs.Inscripciones.headerRowNumber).toBe(3);
    expect(snapshot.tabs.Interacciones_Chatbot.headerRowNumber).toBe(3);
    expect(snapshot.tabs.Sesiones.headerRowNumber).toBe(3);
    expect(sessions[0]).toMatchObject({
      date: "2026-09-25",
      startTime: "17:00",
      endTime: "20:00",
      groupName: "Bilbao",
      location: "Bilbao",
      modality: "presencial",
      capacityTotal: 14,
      availableSeats: 14,
    });
    expect(sessions[1]).toMatchObject({
      date: "2026-09-02",
      groupName: "Erandio",
      location: "Erandio",
      modality: "presencial",
      availableSeats: 14,
    });
  });

  it("uses every future Charla session published in the normalized agenda", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      multiSession: true,
      visualHeaderRows: false,
    });
    workbook.Grupos_Ediciones.push([
      "grupo_charla_online",
      "charla_embarazo_1_20",
      "Charla informativa online",
      "Online",
      "Online",
      "40",
      "Activa",
      "sí",
      "sí",
    ]);
    workbook.Sesiones.push(
      [
        "sesion_charla_online_20260810",
        "grupo_charla_online",
        "charla_embarazo_1_20",
        "2026-08-10",
        "19:00",
        "20:30",
        "Online",
        "Online",
        "Activa",
        "40",
        "0",
        "40",
        "sí",
        "sí",
        "",
      ],
      [
        "sesion_charla_erandio_wrong_time",
        "grupo_charla_erandio",
        "charla_embarazo_1_20",
        "2026-08-20",
        "17:00",
        "18:30",
        "Erandio",
        "Presencial",
        "Activa",
        "20",
        "0",
        "20",
        "sí",
        "sí",
        "",
      ],
      [
        "sesion_charla_online_undocumented",
        "grupo_charla_online",
        "charla_embarazo_1_20",
        "2026-11-02",
        "19:00",
        "20:30",
        "Online",
        "Online",
        "Activa",
        "40",
        "0",
        "40",
        "sí",
        "sí",
        "",
      ],
      [
        "sesion_charla_historical_example",
        "grupo_charla_erandio",
        "charla_embarazo_1_20",
        "2026-07-16",
        "18:30",
        "20:00",
        "Erandio",
        "Presencial",
        "Activa",
        "20",
        "0",
        "20",
        "sí",
        "sí",
        "",
      ],
    );

    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );
    const sessions = listAvailableSessionsFromSnapshot(snapshot, {
      now: new Date(2026, 6, 17, 12),
    });

    expect(sessions.map((session) => session.sessionId)).toEqual([
      "sesion_charla_online_20260810",
      "sesion_charla_erandio_wrong_time",
      "sesion_charla_erandio_20260924",
      "sesion_charla_bilbao_20261006",
      "sesion_charla_online_undocumented",
    ]);
    expect(sessions.map(({ location, modality, startTime }) => ({
      location,
      modality,
      startTime,
    }))).toEqual([
      { location: "Online", modality: "online", startTime: "19:00" },
      { location: "Erandio", modality: "presencial", startTime: "17:00" },
      { location: "Erandio", modality: "presencial", startTime: "18:30" },
      { location: "Bilbao", modality: "presencial", startTime: "17:00" },
      { location: "Online", modality: "online", startTime: "19:00" },
    ]);
  });

  it("removes past rows without reordering other normalized services", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createNormalizedWorkbook({ multiSession: true }),
    );
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const sessions = listAvailableSessionsFromSnapshot(snapshot, {
      now: new Date(2026, 8, 10, 12),
    });

    expect(sessions.map((session) => session.date)).toEqual(["2026-09-25"]);
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

  it("subtracts occupied registrations from shifted 14-seat BLW templates", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createNormalizedWorkbook({
        visualHeaderRows: true,
        sessionCapacity: "14",
        registrations: [["taller_blw", "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", "Confirmada"]],
      }),
    );
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const sessions = listAvailableSessionsFromSnapshot(snapshot);

    expect(sessions[0]?.capacityTotal).toBe(14);
    expect(sessions[0]?.occupied).toBe(1);
    expect(sessions[0]?.availableSeats).toBe(13);
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
