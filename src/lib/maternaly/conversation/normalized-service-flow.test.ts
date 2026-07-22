import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  createNormalizedWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

const forbiddenHotelCopy = /\b(?:hotel|perros|canino|vacunas|comida|visitas|somos perros)\b/i;

describe("normalized Maternaly WhatsApp flow", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "maternaly-normalized-flow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeStore() {
    return new FileConversationStore(path.join(tempDir, "conversations.json"));
  }

  function lastPayload(
    events: Array<{ eventType: string; payload?: unknown }>,
    eventType: string,
  ): Record<string, unknown> | undefined {
    return events
      .filter((event) => event.eventType === eventType)
      .at(-1)?.payload as Record<string, unknown> | undefined;
  }

  function corruptTab(workbook: Record<string, unknown[][]>, tab: string) {
    workbook[tab] = [[tab], ["fila sin columnas normalizadas"]];
    return workbook;
  }

  function withThirdBlwSession(workbook: Record<string, unknown[][]>) {
    workbook.Grupos_Ediciones.push([
      "grupo_blw_getxo",
      "taller_blw",
      "Taller BLW Getxo",
      "Getxo",
      "Presencial",
      "14",
      "Activa",
      "sí",
      "sí",
    ]);
    workbook.Sesiones.push([
      "sesion_blw_getxo_20261010",
      "grupo_blw_getxo",
      "taller_blw",
      "2026-10-10",
      "17:00",
      "20:00",
      "Getxo",
      "Presencial",
      "Activa",
      "14",
      "0",
      "14",
      "sí",
      "sí",
      "",
    ]);
    return workbook;
  }

  it("handles Twilio inbound for BLW without hotel copy", async () => {
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook());
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34600111222",
        body: "Quiero apuntarme al taller BLW",
        messageSid: "SM_BLW_1",
        channel: "twilio_sandbox",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(result.botReply?.body).toMatch(/BLW|Opciones/i);
    expect(result.botReply?.body).not.toMatch(forbiddenHotelCopy);
    expect(result.conversation.serviceDetected).toBe("Taller BLW");
    expect(result.conversation.events.map((event) => event.eventType)).toContain("maternaly_tool_executed");
  });

  it("handles YCloud inbound through the shared normalized flow", async () => {
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook());
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Me interesa BLW",
        messageSid: "YCLOUD_BLW_1",
        channel: "ycloud",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(result.conversation.channel).toBe("ycloud");
    expect(result.botReply?.body).toMatch(/BLW|Opciones/i);
    expect(result.botReply?.body).not.toMatch(forbiddenHotelCopy);
  });

  it("supports service to options to choice to contact data and creates a dry-run write plan", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const env = normalizedTestEnv();

    const first = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Quiero apuntarme a BLW",
        messageSid: "SM_MULTI_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const firstBody = first.botReply?.body ?? "";
    expect(first.botReply?.body).toMatch(/Opciones para Taller BLW/i);
    expect(firstBody).toContain("2026-09-25 17:00 Bilbao (14 plazas disponibles)");
    expect(firstBody).toContain("2026-09-02 17:00 Erandio (14 plazas disponibles)");
    expect(firstBody).not.toMatch(/disponibilidad a validar/i);
    expect(firstBody).not.toMatch(/nombre y apellidos|fecha de nacimiento/i);
    expect(first.conversation.maternalyNormalizedFlow?.stage).toBe("choosing_session");
    expect(first.conversation.maternalyNormalizedFlow?.selectedSessionId).toBeUndefined();

    const second = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Opción 1",
        messageSid: "SM_MULTI_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(second.botReply?.body).toMatch(/nombre y apellidos/i);
    expect(second.botReply?.body).toMatch(/email/i);
    expect(second.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe("sesion_blw_bilbao_20260925");

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Soy Marta Lopez, telefono +34 600 111 222, email marta@example.test, 1 persona, fecha nacimiento bebé 2025-01-15",
        messageSid: "SM_MULTI_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(result.botReply?.body).not.toMatch(/plaza confirmada/i);
    expect(client.appended).toHaveLength(0);
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("write_planned");
    expect(result.conversation.events.map((event) => event.eventType)).toContain("maternaly_tool_executed");
  });

  it("uses the inbound WhatsApp phone and contextual BLW contact data after option 3", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      withThirdBlwSession(createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" })),
    );
    const env = normalizedTestEnv();
    const from = "whatsapp:+34999000111";

    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "reiniciar",
        messageSid: "SM_CONTEXTUAL_BLW_RESET_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "quiero reservar taller blw",
        messageSid: "SM_CONTEXTUAL_BLW_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const selected = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "3",
        messageSid: "SM_CONTEXTUAL_BLW_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(selected.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe("sesion_blw_getxo_20261010");
    expect(selected.botReply?.body).toMatch(/nombre y apellidos|email|fecha de nacimiento/i);
    expect(selected.botReply?.body).not.toMatch(/tel[eé]fono/i);

    const result = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "PAU PRUEBAS, prueba.bot@example.test, voy en pareja, fecha 31/12/2026",
        messageSid: "SM_CONTEXTUAL_BLW_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const reply = result.botReply?.body ?? "";
    const state = result.conversation.maternalyNormalizedFlow;
    expect(reply).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(reply).not.toMatch(/necesito|nombre y apellidos|fecha de nacimiento|tel[eé]fono/i);
    expect(reply).not.toMatch(/pareja|acompañante/i);
    expect(reply).not.toMatch(/plaza confirmada/i);
    expect(state).toMatchObject({
      stage: "write_planned",
      phone: "+34999000111",
      fullName: "PAU PRUEBAS",
      email: "prueba.bot@example.test",
      peopleCount: 2,
      babyBirthDate: "2026-12-31",
    });
    expect(client.appended).toHaveLength(0);
    expect(lastPayload(result.conversation.events, "maternaly_registration_slots_enriched")).toMatchObject({
      source: "contextual_reducer",
      phoneFromInbound: true,
      fullNameDetected: true,
      emailDetected: true,
      peopleCountDetected: true,
      dateMappedTo: "babyBirthDate",
      missingFieldsAfter: [],
    });
  });

  it("keeps the WhatsApp phone as operative contact when the BLW message includes a different phone", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const env = normalizedTestEnv();

    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000111",
        body: "quiero reservar taller blw",
        messageSid: "SM_CONTEXTUAL_BLW_EXPLICIT_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000111",
        body: "1",
        messageSid: "SM_CONTEXTUAL_BLW_EXPLICIT_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000111",
        body: "PAU PRUEBAS, 999000222, prueba.bot@example.test, voy en pareja, fecha 31/12/2026",
        messageSid: "SM_CONTEXTUAL_BLW_EXPLICIT_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(result.botReply?.body).not.toMatch(/nombre y apellidos|fecha de nacimiento|tel[eé]fono|email|pareja/i);
    expect(result.conversation.maternalyNormalizedFlow?.phone).toBe("+34999000111");
    expect(result.conversation.maternalyNormalizedFlow?.observations).toContain("telefono_mensaje_difiere_de_whatsapp");
    expect(lastPayload(result.conversation.events, "maternaly_registration_slots_enriched")).toMatchObject({
      phoneFromInbound: true,
      phoneFromMessage: true,
      missingFieldsAfter: [],
    });
  });

  it("does not ask for missing BLW name, phone or baby birth date for comma-separated contextual data", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const env = normalizedTestEnv();

    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000111",
        body: "quiero reservar taller blw",
        messageSid: "SM_CONTEXTUAL_BLW_SCREENSHOT_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000111",
        body: "1",
        messageSid: "SM_CONTEXTUAL_BLW_SCREENSHOT_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000111",
        body: "PAU PRUEBAS, 999000111, pau.pruebas@example.test, voy en pareja, fecha 31/12/2026",
        messageSid: "SM_CONTEXTUAL_BLW_SCREENSHOT_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const reply = result.botReply?.body ?? "";
    expect(reply).not.toMatch(/necesito: nombre y apellidos/i);
    expect(reply).not.toMatch(/fecha de nacimiento del beb[eé]/i);
    expect(reply).not.toMatch(/tel[eé]fono/i);
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("write_planned");
  });

  it("maps a standalone date to BLW baby birth date while collecting contact data", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const env = normalizedTestEnv();

    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000112",
        body: "quiero reservar taller blw",
        messageSid: "SM_CONTEXTUAL_BLW_DATE_ONLY_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000112",
        body: "1",
        messageSid: "SM_CONTEXTUAL_BLW_DATE_ONLY_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    const missingDate = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000112",
        body: "PAU PRUEBAS, prueba.bot@example.test, voy en pareja",
        messageSid: "SM_CONTEXTUAL_BLW_DATE_ONLY_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(missingDate.botReply?.body).toMatch(/fecha de nacimiento del beb[eé]/i);
    expect(missingDate.botReply?.body).not.toMatch(/nombre y apellidos|tel[eé]fono|email|pareja/i);

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000112",
        body: "31/12/2026",
        messageSid: "SM_CONTEXTUAL_BLW_DATE_ONLY_4",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(result.botReply?.body).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(result.conversation.maternalyNormalizedFlow?.babyBirthDate).toBe("2026-12-31");
    expect(lastPayload(result.conversation.events, "maternaly_registration_slots_enriched")).toMatchObject({
      dateMappedTo: "babyBirthDate",
      missingFieldsAfter: [],
    });
  });

  it("maps a contextual Charla date to FPP instead of baby birth date", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }),
    );
    const env = normalizedTestEnv();

    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000113",
        body: "quiero apuntarme a la charla embarazo",
        messageSid: "SM_CONTEXTUAL_CHARLA_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000113",
        body: "Erandio, 24 de septiembre",
        messageSid: "SM_CONTEXTUAL_CHARLA_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000113",
        body: "Dos personas",
        messageSid: "SM_CONTEXTUAL_CHARLA_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const details = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000113",
        body: "Soy Laura Ruiz, fecha 31/12/2026",
        messageSid: "SM_CONTEXTUAL_CHARLA_4",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(details.botReply?.body).toMatch(/nombre de la pareja|nombre del acompa[nñ]ante/i);
    expect(details.conversation.maternalyNormalizedFlow?.fppOrDueDate).toBe("2026-12-31");
    expect(details.conversation.maternalyNormalizedFlow?.babyBirthDate).toBeUndefined();
    expect(lastPayload(details.conversation.events, "maternaly_registration_slots_enriched")).toMatchObject({
      dateMappedTo: "fppOrDueDate",
      missingFieldsAfter: ["partnerName"],
    });

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34999000113",
        body: "Marta López",
        messageSid: "SM_CONTEXTUAL_CHARLA_5",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada/i);
    expect(result.conversation.maternalyNormalizedFlow?.email).toBeUndefined();
    expect(result.conversation.maternalyNormalizedFlow?.partnerName).toBe("Marta López");
  });

  it.each([
    "quiero reservar taller blw",
    "estoy interesada en reservar en el taller blw",
    "quiero apuntarme al taller blw",
  ])("lists real-template BLW availability for '%s'", async (body) => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: `+34600999${body.length}`,
        body,
        messageSid: `SM_BLW_PHRASE_${body.length}`,
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    const reply = result.botReply?.body ?? "";
    expect(reply).toMatch(/Opciones para Taller BLW/i);
    expect(reply).toContain("2026-09-25 17:00 Bilbao (14 plazas disponibles)");
    expect(reply).toContain("2026-09-02 17:00 Erandio (14 plazas disponibles)");
    expect(reply).not.toMatch(/no puedo validar disponibilidad/i);
    expect(reply).not.toMatch(/disponibilidad a validar/i);

    const checked = lastPayload(result.conversation.events, "maternaly_availability_checked");
    expect(checked).toMatchObject({
      route: "whatsapp_core",
      serviceKey: "taller_blw",
      ok: true,
      reason: "sessions_available",
      sessionsCount: 2,
      headersDetected: true,
      selectedSource: "normalized_sheets",
      sheetIdRedacted: "[sheet-id]",
    });
    expect(result.conversation.events.map((event) => event.eventType)).not.toContain(
      "maternaly_availability_fallback",
    );
  });

  it("explains BLW before showing dates when the user only names the service", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600999111",
        body: "taller blw",
        messageSid: "SM_BLW_GENERAL_INFO",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    const reply = result.botReply?.body ?? "";
    expect(reply).toMatch(/alimentaci[oó]n complementaria autorregulada|Baby-Led Weaning/i);
    expect(reply).toMatch(/seguridad|requisitos/i);
    expect(reply).not.toMatch(/Opciones para Taller BLW|plazas disponibles/i);
    expect(result.conversation.events.map((event) => event.eventType)).not.toContain(
      "maternaly_availability_checked",
    );
  });

  it("keeps BLW availability after reset and then accepts option 1", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const env = normalizedTestEnv();

    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111901",
        body: "reiniciar",
        messageSid: "SM_BLW_RESET_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const first = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111901",
        body: "quiero reservar taller blw",
        messageSid: "SM_BLW_RESET_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(first.botReply?.body).toMatch(/Opciones para Taller BLW/i);
    expect(first.botReply?.body).not.toMatch(/no puedo validar disponibilidad/i);

    const second = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111901",
        body: "1",
        messageSid: "SM_BLW_RESET_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(second.botReply?.body).toMatch(/nombre y apellidos/i);
    expect(second.botReply?.body).toMatch(/email/i);
    expect(second.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe("sesion_blw_bilbao_20260925");
  });

  it("reads BLW availability when a Sheet ID is configured even if normalized writes are disabled", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111903",
        body: "quiero reservar taller blw",
        messageSid: "SM_BLW_READ_ONLY_AVAILABILITY_1",
      },
      makeStore(),
      {
        normalizedSheetsClient: client,
        normalizedEnv: normalizedTestEnv({ MATERNALY_NORMALIZED_SHEETS_ENABLED: "false" }),
      },
    );

    expect(result.botReply?.body).toMatch(/Opciones para Taller BLW/i);
    expect(result.botReply?.body).toContain("2026-09-02 17:00 Erandio (14 plazas disponibles)");
    expect(result.botReply?.body).not.toMatch(/no puedo validar disponibilidad/i);
    expect(lastPayload(result.conversation.events, "maternaly_availability_checked")).toMatchObject({
      ok: true,
      reason: "sessions_available",
      sessionsCount: 2,
    });
  });

  it.each(["quiero apuntarme al taller blw"])(
    "lists BLW availability for '%s' even when a non-critical tab has parse errors",
    async (body) => {
      const store = makeStore();
      const client = new InMemoryNormalizedSheetsClient(
        corruptTab(createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }), "Servicio_Config"),
      );
      const env = normalizedTestEnv();

      await handleInboundMaternalyWhatsApp(
        {
          from: `+346001129${body.length}`,
          body: "reiniciar",
          messageSid: `SM_BLW_NON_CRITICAL_RESET_${body.length}`,
        },
        store,
        { normalizedSheetsClient: client, normalizedEnv: env },
      );

      const result = await handleInboundMaternalyWhatsApp(
        {
          from: `+346001129${body.length}`,
          body,
          messageSid: `SM_BLW_NON_CRITICAL_${body.length}`,
        },
        store,
        { normalizedSheetsClient: client, normalizedEnv: env },
      );

      const reply = result.botReply?.body ?? "";
      expect(reply).toMatch(/Opciones para Taller BLW/i);
      expect(reply).toContain("2026-09-02 17:00 Erandio (14 plazas disponibles)");
      expect(reply).toContain("2026-09-25 17:00 Bilbao (14 plazas disponibles)");
      expect(reply).not.toMatch(/no puedo validar disponibilidad/i);
      expect(reply).not.toMatch(/disponibilidad a validar/i);
      expect(lastPayload(result.conversation.events, "maternaly_availability_checked")).toMatchObject({
        ok: true,
        reason: "sessions_available",
        criticalTabsOk: true,
        nonCriticalParseErrorsCount: 1,
        sessionsCount: 2,
      });
      expect(result.conversation.events.map((event) => event.eventType)).not.toContain(
        "maternaly_availability_fallback",
      );
    },
  );

  it("lists BLW availability when Inscripciones fails but Sesiones has direct available seats", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      corruptTab(createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }), "Inscripciones"),
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111904",
        body: "quiero reservar taller blw",
        messageSid: "SM_BLW_OCCUPANCY_UNAVAILABLE_1",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(result.botReply?.body).toMatch(/Opciones para Taller BLW/i);
    expect(result.botReply?.body).toContain("2026-09-02 17:00 Erandio (14 plazas disponibles)");
    expect(result.botReply?.body).not.toMatch(/no puedo validar disponibilidad|disponibilidad a validar/i);
    expect(lastPayload(result.conversation.events, "maternaly_availability_checked")).toMatchObject({
      ok: true,
      reason: "sessions_available",
      criticalTabsOk: true,
      errorType: "occupancy_unavailable_using_direct_seats",
      sessionsCount: 2,
    });
  });

  it("falls back with a clear reason when Sesiones cannot be parsed", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      corruptTab(createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }), "Sesiones"),
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111905",
        body: "quiero reservar taller blw",
        messageSid: "SM_BLW_SESIONES_PARSE_ERROR_1",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(result.botReply?.body).toMatch(/no puedo comprobar la disponibilidad con seguridad/i);
    const checked = lastPayload(result.conversation.events, "maternaly_availability_checked");
    expect(checked).toMatchObject({
      ok: false,
      reason: "header_not_found",
      criticalTabsOk: false,
      sessionsCount: 0,
    });
    expect(lastPayload(result.conversation.events, "maternaly_availability_fallback")).toMatchObject({
      reason: "header_not_found",
      sessionsCount: 0,
    });
  });

  it("does not let a Clientes_Local parse error block listing but blocks the write plan", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      corruptTab(createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }), "Clientes_Local"),
    );
    const env = normalizedTestEnv();

    const first = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111906",
        body: "quiero reservar taller blw",
        messageSid: "SM_BLW_CLIENTES_PARSE_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(first.botReply?.body).toMatch(/Opciones para Taller BLW/i);
    expect(first.botReply?.body).not.toMatch(/no puedo validar disponibilidad/i);

    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111906",
        body: "opción 1",
        messageSid: "SM_BLW_CLIENTES_PARSE_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111906",
        body: "Soy Marta Lopez, telefono +34 600 111 222, email marta@example.test, 1 persona, fecha nacimiento bebé 2025-01-15",
        messageSid: "SM_BLW_CLIENTES_PARSE_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/no puedo dejar la solicitud cerrada|revisión/i);
    expect(result.conversation.mode).toBe("human");
    expect(client.appended).toHaveLength(0);
    expect(JSON.stringify(lastPayload(result.conversation.events, "maternaly_tool_executed")?.blockedReasons)).toContain(
      "missing_required_columns:Clientes_Local",
    );
  });

  it("emits a fallback event only when BLW has no available sessions", async () => {
    const workbook = createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" });
    workbook.Sesiones = (workbook.Sesiones as unknown[][]).slice(0, 3);
    const client = new InMemoryNormalizedSheetsClient(workbook);

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111902",
        body: "quiero reservar taller blw",
        messageSid: "SM_BLW_NO_SESSIONS_1",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(result.botReply?.body).toMatch(/no veo sesiones disponibles/i);
    expect(result.botReply?.body).not.toMatch(/no puedo validar disponibilidad/i);
    const checked = lastPayload(result.conversation.events, "maternaly_availability_checked");
    expect(checked).toMatchObject({
      route: "whatsapp_core",
      serviceKey: "taller_blw",
      ok: false,
      reason: "no_sessions_available",
      sessionsCount: 0,
      headersDetected: true,
    });
    const fallback = lastPayload(result.conversation.events, "maternaly_availability_fallback");
    expect(fallback).toMatchObject({
      route: "whatsapp_core",
      serviceKey: "taller_blw",
      reason: "no_sessions_available",
      sessionsCount: 0,
    });
  });

  it("does not close a BLW request when contact data arrives before a session choice", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook({ multiSession: true }));
    const env = normalizedTestEnv();

    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111224",
        body: "Quiero reservar taller blw",
        messageSid: "SM_NO_SESSION_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111224",
        body: "Soy PRUEBA BOT BLW, teléfono +34999000111, email prueba.bot.blw@example.test. Vamos 2 personas. La fecha de nacimiento del bebé es 2025-01-15.",
        messageSid: "SM_NO_SESSION_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/Opciones para Taller BLW/i);
    expect(result.botReply?.body).toMatch(/Dime cuál prefieres/i);
    expect(result.botReply?.body).not.toMatch(/solicitud preparada|No puedo cerrar/i);
    expect(client.appended).toHaveLength(0);
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("choosing_session");
  });

  it("auto-selects the only available BLW session and asks for contact fields", async () => {
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook());
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111225",
        body: "Quiero reservar taller blw",
        messageSid: "SM_SINGLE_SESSION_1",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(result.botReply?.body).toMatch(/preparo la solicitud/i);
    expect(result.botReply?.body).toMatch(/nombre y apellidos/i);
    expect(result.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe("sesion_blw_bilbao_20260925");
  });

  it("offers waitlist or human review when all BLW sessions are full", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createNormalizedWorkbook({
        sessionCapacity: "1",
        registrations: [["taller_blw", "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", "Confirmada"]],
      }),
    );
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111226",
        body: "Quiero reservar taller blw",
        messageSid: "SM_FULL_SESSION_1",
      },
      makeStore(),
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(result.botReply?.body).toMatch(/sin plazas libres/i);
    expect(result.botReply?.body).toMatch(/lista de espera|equipo/i);
    expect(client.appended).toHaveLength(0);
  });

  it("blocks auto-write in human mode without autoresponse", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook());
    const first = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Quiero apuntarme a BLW",
        messageSid: "SM_HUMAN_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );
    await store.replaceConversation({
      ...first.conversation,
      mode: "human",
      humanRequested: true,
    });
    const second = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Soy Marta Lopez, telefono +34 600 111 222",
        messageSid: "SM_HUMAN_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
    );

    expect(client.appended).toHaveLength(0);
    expect(second.conversation.mode).toBe("human");
    expect(second.botReply).toBeUndefined();
    expect(second.twiml).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  it("handles Charla with two attendees, partner and FPP", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }),
    );
    const env = normalizedTestEnv();

    const first = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111223",
        body: "Quiero apuntarme a la charla de embarazo en Bilbao el 6 de octubre",
        messageSid: "SM_CHARLA_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(first.botReply?.body).toMatch(/acudir[eé]is una o dos personas/i);

    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111223",
        body: "Dos personas",
        messageSid: "SM_CHARLA_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111223",
        body: "Soy Laura Ruiz, mi pareja es Marta López, FPP 2026-11-30",
        messageSid: "SM_CHARLA_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(result.botReply?.body).not.toMatch(/plaza confirmada/i);
    expect(client.appended).toHaveLength(0);
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("write_planned");
    expect(result.conversation.maternalyNormalizedFlow?.email).toBeUndefined();
    expect(result.conversation.maternalyNormalizedFlow?.partnerName).toBe("Marta López");
  });

  it("keeps Charla blocked for two attendees until the companion name is provided", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }),
    );
    const env = normalizedTestEnv();
    const from = "whatsapp:+34999000131";

    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "reiniciar",
        messageSid: "SM_CHARLA_OPTIONAL_RESET",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const first = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Quiero apuntarme a la charla embarazo",
        messageSid: "SM_CHARLA_OPTIONS_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(first.botReply?.body).toMatch(/sesiones publicadas para la Charla/i);
    expect(first.conversation.maternalyNormalizedFlow?.selectedSessionId).toBeUndefined();
    const firstReply = first.botReply?.body ?? "";
    expect(firstReply.indexOf("Erandio")).toBeLessThan(firstReply.indexOf("Bilbao"));

    const second = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Erandio, 24 de septiembre",
        messageSid: "SM_CHARLA_OPTIONS_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(second.botReply?.body).toMatch(/acudir[eé]is una o dos personas/i);

    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Dos personas",
        messageSid: "SM_CHARLA_OPTIONS_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const blocked = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Soy Paula Ortega, FPP 31/12/2026",
        messageSid: "SM_CHARLA_OPTIONS_4",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(blocked.botReply?.body).toMatch(/nombre de la pareja|nombre del acompa[nñ]ante/i);
    expect(blocked.botReply?.body).not.toMatch(/solicitud preparada|preinscripci[oó]n.*pendiente/i);
    expect(blocked.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "collecting_contact",
      selectedSessionId: "sesion_charla_erandio_20260924",
      phone: "+34999000131",
      fullName: "Paula Ortega",
      peopleCount: 2,
      fppOrDueDate: "31/12/2026",
    });
    expect(blocked.conversation.maternalyNormalizedFlow?.email).toBeUndefined();
    expect(blocked.conversation.maternalyNormalizedFlow?.partnerName).toBeUndefined();
    expect(client.appended).toHaveLength(0);

    const completed = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Mi pareja se llama Marcos Gómez",
        messageSid: "SM_CHARLA_OPTIONS_5",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(completed.botReply?.body).toMatch(/solicitud preparada/i);
    expect(completed.botReply?.body).not.toMatch(/plaza confirmada|preinscripci[oó]n.*pendiente/i);
    expect(completed.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "write_planned",
      selectedSessionId: "sesion_charla_erandio_20260924",
      phone: "+34999000131",
      fullName: "Paula Ortega",
      peopleCount: 2,
      fppOrDueDate: "31/12/2026",
      partnerName: "Marcos Gómez",
    });
  });

  it.each(["Tono", "Antonio"])("accepts a short contextual Charla partner name when that field is pending: %s", async (partnerName) => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }),
    );
    const env = normalizedTestEnv();
    const from = `whatsapp:+3499900014${partnerName.length}`;

    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "quiero reservar charla informativa embarazo",
        messageSid: `SM_CHARLA_SHORT_${partnerName}_1`,
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Erandio, 24 de septiembre",
        messageSid: `SM_CHARLA_SHORT_${partnerName}_2`,
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Soy Paula Ortega, voy en pareja, FPP 31/12/2026",
        messageSid: `SM_CHARLA_SHORT_${partnerName}_3`,
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: partnerName,
        messageSid: `SM_CHARLA_SHORT_${partnerName}_4`,
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(result.botReply?.body).not.toMatch(/nombre de la pareja|acompañante.*necesito/i);
    expect(result.conversation.maternalyNormalizedFlow?.partnerName).toBe(partnerName);
    expect(lastPayload(result.conversation.events, "maternaly_registration_slots_enriched")).toMatchObject({
      partnerNameDetected: true,
      missingFieldsAfter: [],
    });
  });

  it("keeps Charla pending when the companion name is unknown", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }),
    );
    const env = normalizedTestEnv();
    const from = "whatsapp:+34999000155";

    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "quiero reservar charla informativa embarazo",
        messageSid: "SM_CHARLA_PENDING_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Erandio, 24 de septiembre",
        messageSid: "SM_CHARLA_PENDING_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Soy Paula Ortega, voy en pareja, FPP 31/12/2026",
        messageSid: "SM_CHARLA_PENDING_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const result = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "no lo sé",
        messageSid: "SM_CHARLA_PENDING_4",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/nombre de la pareja|nombre del acompa[nñ]ante/i);
    expect(result.botReply?.body).not.toMatch(/solicitud preparada|preinscripci[oó]n.*pendiente/i);
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("collecting_contact");
    expect(result.conversation.maternalyNormalizedFlow?.partnerName).toBeUndefined();
    expect(result.conversation.maternalyNormalizedFlow?.observations).toContain("acompañante pendiente");
    expect(lastPayload(result.conversation.events, "maternaly_registration_slots_enriched")).toMatchObject({
      partnerNameSkipped: true,
      missingFieldsAfter: ["partnerName"],
    });
    expect(client.appended).toHaveLength(0);
  });

  it("accepts a bare 1 for Charla people count and does not ask for partner name", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }),
    );
    const env = normalizedTestEnv();
    const from = "whatsapp:+34999000156";

    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "quiero reservar charla informativa embarazo",
        messageSid: "SM_CHARLA_SINGLE_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Erandio, 24 de septiembre",
        messageSid: "SM_CHARLA_SINGLE_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    const peopleCount = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "1",
        messageSid: "SM_CHARLA_SINGLE_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(peopleCount.botReply?.body).toMatch(/nombre y apellidos|fecha probable de parto/i);
    expect(peopleCount.botReply?.body).not.toMatch(/email/i);

    const result = await handleInboundMaternalyWhatsApp(
      {
        from,
        body: "Soy Paula Ortega, FPP 31/12/2026",
        messageSid: "SM_CHARLA_SINGLE_4",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada/i);
    expect(result.botReply?.body).not.toMatch(/preinscripci[oó]n.*pendiente/i);
    expect(result.botReply?.body).not.toMatch(/nombre de la pareja|acompañante.*necesito/i);
    expect(result.conversation.maternalyNormalizedFlow?.peopleCount).toBe(1);
    expect(result.conversation.maternalyNormalizedFlow?.email).toBeUndefined();
  });

  it("derives cancellations, date changes and invoices to human without writing", async () => {
    for (const [index, body, sid] of [
      [0, "quiero cancelar mi inscripción", "SM_HANDOFF_CANCEL"],
      [1, "quiero cambiar la fecha", "SM_HANDOFF_DATE"],
      [2, "necesito factura", "SM_HANDOFF_INVOICE"],
    ] as const) {
      const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook({ multiSession: true }));
      const result = await handleInboundMaternalyWhatsApp(
        {
          from: `+3460011128${index}`,
          body,
          messageSid: sid,
        },
        makeStore(),
        { normalizedSheetsClient: client, normalizedEnv: normalizedTestEnv() },
      );

      expect(result.conversation.mode).toBe("human");
      expect(result.conversation.humanRequested).toBe(true);
      expect(result.conversation.events.map((event) => event.eventType)).toContain("maternaly_handoff_required");
      expect(result.botReply?.body).toMatch(/equipo de Maternaly|persona/i);
      expect(client.appended).toHaveLength(0);
    }
  });
});
