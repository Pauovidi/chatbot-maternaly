import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import {
  InMemoryNormalizedSheetsClient,
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
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook());
    const env = normalizedTestEnv();

    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Quiero apuntarme a BLW",
        messageSid: "SM_MULTI_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Opción 1",
        messageSid: "SM_MULTI_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
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
      createNormalizedWorkbook({ serviceKey: "charla_embarazo_1_20" }),
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
        body: "Soy Laura Ruiz, telefono +34 600 111 223, somos 2 personas, pareja Acompañante Prueba, FPP 2026-11-30",
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
});
