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

    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111223",
        body: "Quiero apuntarme a la charla de embarazo",
        messageSid: "SM_CHARLA_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111223",
        body: "Opción 1",
        messageSid: "SM_CHARLA_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111223",
        body: "Soy Laura Ruiz, telefono +34 600 111 223, email laura@example.test, somos 2 personas, pareja Acompañante Prueba, FPP 2026-11-30",
        messageSid: "SM_CHARLA_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(result.botReply?.body).not.toMatch(/plaza confirmada/i);
    expect(client.appended).toHaveLength(0);
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("write_planned");
  });

  it("lists Charla options, then asks for FPP and partner data when needed", async () => {
    const store = makeStore();
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }),
    );
    const env = normalizedTestEnv();

    const first = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111227",
        body: "Quiero apuntarme a la charla embarazo",
        messageSid: "SM_CHARLA_OPTIONS_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(first.botReply?.body).toMatch(/Opciones para Charla/i);
    expect(first.conversation.maternalyNormalizedFlow?.selectedSessionId).toBeUndefined();

    const second = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111227",
        body: "opción 1",
        messageSid: "SM_CHARLA_OPTIONS_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(second.botReply?.body).toMatch(/fecha probable de parto/i);

    const third = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111227",
        body: "Soy Laura Ruiz, telefono +34 600 111 227, email laura@example.test, somos 2 personas, FPP 2026-11-30",
        messageSid: "SM_CHARLA_OPTIONS_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    expect(third.botReply?.body).toMatch(/pareja|acompañante/i);
    expect(third.conversation.maternalyNormalizedFlow?.stage).toBe("collecting_contact");
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
