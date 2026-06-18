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

    expect(result.botReply?.body).toMatch(/horarios disponibles/i);
    expect(result.botReply?.body).not.toMatch(forbiddenHotelCopy);
    expect(result.conversation.serviceDetected).toBe("Taller BLW");
    expect(result.conversation.events.map((event) => event.eventType)).toContain(
      "maternaly_normalized_sheet_availability_checked",
    );
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
    expect(result.botReply?.body).toMatch(/BLW|horarios/i);
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
        body: "Me apunto a la del martes",
        messageSid: "SM_MULTI_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "+34600111222",
        body: "Soy Marta Lopez, telefono +34 600 111 222, email marta@example.test",
        messageSid: "SM_MULTI_3",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );

    expect(result.botReply?.body).toMatch(/solicitud preparada|pendiente de validación/i);
    expect(result.botReply?.body).not.toMatch(/plaza confirmada/i);
    expect(client.appended).toHaveLength(0);
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("write_planned");
    expect(result.conversation.events.map((event) => event.eventType)).toContain(
      "maternaly_normalized_registration_write_plan",
    );
  });

  it("blocks auto-write in human mode and derives", async () => {
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
    expect(second.conversation.events.map((event) => event.eventType)).toContain(
      "maternaly_normalized_registration_blocked",
    );
  });
});
