import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-17T10:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());
  it("reads optional online access details from a normalized session", async () => {
    const workbook = createNormalizedWorkbook({ serviceKey: "charla_embarazo_1_20" });
    const rows = workbook.Sesiones as unknown[][];
    (rows[0] as unknown[]).push("enlace_zoom", "clave_acceso", "id_reunion");
    (rows[1] as unknown[]).push("https://zoom.example.test/j/123", "456789", "123");
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );

    expect(listAvailableSessionsFromSnapshot(snapshot)[0]).toMatchObject({
      onlineJoinUrl: "https://zoom.example.test/j/123",
      onlineAccessCode: "456789",
      onlineMeetingId: "123",
    });
  });

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

  it("accepts the workbook service id and treats explicitly reservable blank capacity as unlimited", async () => {
    const workbookServiceId = "SER_CHARLA_INFO_EMBARAZO_1_20";
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      multiSession: true,
      visualHeaderRows: false,
    });
    workbook.Servicio_Config[1][1] = workbookServiceId;
    for (const row of workbook.Grupos_Ediciones.slice(1)) {
      row[1] = workbookServiceId;
      row[5] = "";
    }
    for (const row of workbook.Sesiones.slice(1)) {
      row[2] = workbookServiceId;
      row[9] = "";
      row[10] = "0";
      row[11] = "";
      row[12] = "";
      row[13] = "";
    }

    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );
    const sessions = listAvailableSessionsFromSnapshot(snapshot, {
      now: new Date(2026, 6, 23, 12),
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.sessionId)).toEqual([
      "sesion_charla_erandio_20260924",
      "sesion_charla_bilbao_20261006",
    ]);
    expect(sessions.every((session) => session.availabilityStatus === "unlimited")).toBe(true);
    expect(sessions.every((session) => session.full === false)).toBe(true);
    expect(sessions.every((session) => session.availableSeats === undefined)).toBe(true);
  });

  it("keeps an explicit zero capacity closed", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      visualHeaderRows: false,
    });
    workbook.Sesiones[1][9] = "0";
    workbook.Sesiones[1][10] = "0";
    workbook.Sesiones[1][11] = "0";

    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );
    const session = listAvailableSessionsFromSnapshot(snapshot, {
      now: new Date(2026, 6, 23, 12),
    })[0];

    expect(session).toMatchObject({
      capacityTotal: 0,
      availableSeats: 0,
      full: true,
      availabilityStatus: "full",
    });
  });

  it("excludes a session from today once its Madrid start time has passed", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      visualHeaderRows: false,
    });
    workbook.Sesiones[1][3] = "2026-08-17";
    workbook.Sesiones[1][4] = "10:00";
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );

    expect(
      listAvailableSessionsFromSnapshot(snapshot, {
        now: new Date("2026-08-17T09:00:00.000Z"),
      }),
    ).toHaveLength(0);
  });

  it("excludes sessions whose date, time, modality or location is incomplete", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      visualHeaderRows: false,
    });
    workbook.Sesiones[1][3] = "";
    workbook.Sesiones[1][4] = "";
    workbook.Sesiones[1][6] = "";
    workbook.Sesiones[1][7] = "";
    workbook.Grupos_Ediciones[1][3] = "";
    workbook.Grupos_Ediciones[1][4] = "";
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );

    expect(listAvailableSessionsFromSnapshot(snapshot)).toHaveLength(0);
  });

  it("does not publish sessions from a cancelled, hidden or non-reservable group", async () => {
    for (const mutate of [
      (row: unknown[]) => { row[6] = "Cancelado"; },
      (row: unknown[]) => { row[6] = "Inactivo"; },
      (row: unknown[]) => { row[6] = "Cerrado"; },
      (row: unknown[]) => { row[6] = "Finalizado"; },
      (row: unknown[]) => { row[6] = "Bloqueado"; },
      (row: unknown[]) => { row[6] = "Completo"; },
      (row: unknown[]) => { row[7] = "no"; },
      (row: unknown[]) => { row[8] = "no"; },
    ]) {
      const workbook = createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        visualHeaderRows: false,
      });
      mutate(workbook.Grupos_Ediciones[1]);
      const client = new InMemoryNormalizedSheetsClient(workbook);
      const snapshot = await readNormalizedServiceSheet(
        "charla_embarazo_1_20",
        client,
        normalizedTestEnv(),
      );
      expect(listAvailableSessionsFromSnapshot(snapshot)).toHaveLength(0);
    }
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

  it("counts every attendee and overrides stale direct availability counters", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      sessionCapacity: "3",
      visualHeaderRows: false,
      registrations: [[
        "INS_TEST",
        "CLI_TEST",
        "Ana",
        "Prueba",
        "+34600000001",
        "grupo_charla_bilbao",
        "charla_embarazo_1_20",
        "2026-08-17",
        "whatsapp",
        "0 €",
        "no_aplica",
        "Confirmada",
        "2026-12-31",
        "Acompañante",
        "",
        "personas:2",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );

    expect(listAvailableSessionsFromSnapshot(snapshot)[0]).toMatchObject({
      occupied: 2,
      availableSeats: 1,
    });
  });

  it("counts a legacy confirmed partner as two attendees without people_count metadata", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      sessionCapacity: "2",
      visualHeaderRows: false,
      registrations: [[
        "INS_LEGACY",
        "CLI_LEGACY",
        "Ana",
        "Prueba",
        "+34600000002",
        "grupo_charla_bilbao",
        "charla_embarazo_1_20",
        "2026-08-17",
        "manual",
        "0 €",
        "no_aplica",
        "Confirmada",
        "2026-12-31",
        "Manolo",
        "",
        "",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );

    expect(listAvailableSessionsFromSnapshot(snapshot)[0]).toMatchObject({
      occupied: 2,
      availableSeats: 0,
      full: true,
    });
  });

  it("keeps historical registrations attached when a session id is recreated in the same group", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      sessionCapacity: "1",
      visualHeaderRows: false,
      registrations: [[
        "INS_OLD_SESSION",
        "CLI_OLD_SESSION",
        "Ana",
        "Prueba",
        "+34600000003",
        "grupo_charla_bilbao",
        "charla_embarazo_1_20",
        "2026-08-17",
        "manual",
        "0 €",
        "no_aplica",
        "Activa",
        "2027-03-31",
        "",
        "",
        "session:sesion_charla_bilbao_OLD | personas:1",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );

    expect(listAvailableSessionsFromSnapshot(snapshot)[0]).toMatchObject({
      occupied: 1,
      availableSeats: 0,
      full: true,
    });
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
