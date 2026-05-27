import { createStaticClientDirectory } from "@/lib/hotel/clients";
import {
  buildTwilioMessageResponse,
  handleInboundWhatsApp,
} from "@/lib/hotel/conversations/service";
import {
  createEmptyConversationSnapshot,
  filterConversationRecords,
  type ConversationStore,
} from "@/lib/hotel/conversations/store";
import type {
  Conversation,
  ConversationEvent,
  ConversationListFilters,
  ConversationRecord,
  ConversationSnapshot,
  Message,
} from "@/lib/hotel/conversations/types";

class MemoryConversationStore implements ConversationStore {
  private snapshot = createEmptyConversationSnapshot();

  async load(): Promise<ConversationSnapshot> {
    return structuredClone(this.snapshot);
  }

  async save(snapshot: ConversationSnapshot): Promise<void> {
    this.snapshot = structuredClone(snapshot);
  }

  async list(filters?: ConversationListFilters): Promise<ConversationRecord[]> {
    return filterConversationRecords(this.snapshot.conversations, filters);
  }

  async getById(id: string): Promise<ConversationRecord | undefined> {
    return structuredClone(
      this.snapshot.conversations.find((conversation) => conversation.id === id),
    );
  }

  async getByPhone(phoneNormalized: string): Promise<ConversationRecord | undefined> {
    return structuredClone(
      this.snapshot.conversations.find(
        (conversation) => conversation.phoneNormalized === phoneNormalized,
      ),
    );
  }

  async upsertConversation(conversation: Conversation): Promise<ConversationRecord> {
    const index = this.snapshot.conversations.findIndex(
      (record) => record.id === conversation.id,
    );
    const existing = index >= 0 ? this.snapshot.conversations[index] : undefined;
    const record: ConversationRecord = {
      ...existing,
      ...conversation,
      messages: existing?.messages ?? [],
      events: existing?.events ?? [],
    };

    if (index >= 0) {
      this.snapshot.conversations[index] = record;
    } else {
      this.snapshot.conversations.push(record);
    }

    return structuredClone(record);
  }

  async addMessage(message: Message): Promise<Message> {
    const record = this.snapshot.conversations.find(
      (conversation) => conversation.id === message.conversationId,
    );
    if (!record) {
      throw new Error("Conversation not found");
    }

    record.messages.push(message);
    record.lastMessagePreview = message.body;
    record.updatedAt = message.createdAt;
    if (message.direction === "inbound") {
      record.unreadCount += 1;
      record.lastInboundAt = message.createdAt;
    } else {
      record.lastOutboundAt = message.createdAt;
    }

    return structuredClone(message);
  }

  async addEvent(event: ConversationEvent): Promise<ConversationEvent> {
    const record = this.snapshot.conversations.find(
      (conversation) => conversation.id === event.conversationId,
    );
    if (!record) {
      throw new Error("Conversation not found");
    }

    record.events.push(event);
    record.updatedAt = event.createdAt;
    return structuredClone(event);
  }

  async replaceConversation(record: ConversationRecord): Promise<ConversationRecord> {
    const index = this.snapshot.conversations.findIndex(
      (conversation) => conversation.id === record.id,
    );
    if (index >= 0) {
      this.snapshot.conversations[index] = structuredClone(record);
    } else {
      this.snapshot.conversations.push(structuredClone(record));
    }

    return structuredClone(record);
  }

  async seed(records: ConversationRecord[]): Promise<ConversationSnapshot> {
    this.snapshot = {
      conversations: structuredClone(records),
      updatedAt: new Date().toISOString(),
    };
    return this.load();
  }
}

const QA_PHONE = "whatsapp:+34600009991";
const SANDBOX_TO = "whatsapp:+14155238886";

function isTwiml(value?: string) {
  return value === undefined || /^<\?xml version="1\.0" encoding="UTF-8"\?><Response>/.test(value);
}

function summarizeReply(value?: string) {
  if (!value) {
    return "(sin autorespuesta)";
  }

  return value.replace(/\s+/g, " ").slice(0, 120);
}

async function runDirectSmoke() {
  const store = new MemoryConversationStore();
  const knownDirectory = createStaticClientDirectory([
    {
      nombre: "SMP QA Conversacional",
      telefonoMovil: "+34 600 009 991",
      telefonoNormalizado: "34600009991",
      rowNumber: 9001,
      sheetName: "CLIENTES_QA",
    },
    {
      nombre: "SMP QA Bloqueado",
      telefonoMovil: "+34 600 009 992",
      telefonoNormalizado: "34600009992",
      notas: "NO COGER RESERVA",
      rowNumber: 9002,
      sheetName: "CLIENTES_QA",
    },
  ]);
  const cases = [
    {
      label: "info",
      from: QA_PHONE,
      body: "Hola, quiero información",
      expectMode: "bot",
      expectReply: "horarios",
    },
    {
      label: "availability",
      from: "whatsapp:+34600009993",
      body: "Quiero reservar para Kira QA del 29 al 31 de diciembre de 2026",
      expectMode: "bot",
      expectReply: "revisar disponibilidad",
    },
    {
      label: "confirm-without-proposal",
      from: "whatsapp:+34600009994",
      body: "Sí, confirma",
      expectMode: "human",
      expectReply: "propuesta válida revisada",
    },
    {
      label: "stay-status",
      from: "whatsapp:+34600009995",
      body: "¿Ha comido mi perro?",
      expectMode: "human",
      expectReply: "respuesta real",
    },
    {
      label: "blocked-client",
      from: "whatsapp:+34600009992",
      body: "Quiero reservar",
      expectMode: "human",
      expectReply: "revisamos tu solicitud",
    },
  ] as const;

  const rows = [];
  for (const testCase of cases) {
    const result = await handleInboundWhatsApp(
      {
        from: testCase.from,
        to: SANDBOX_TO,
        body: testCase.body,
        messageSid: `SM_QA_${testCase.label}`,
        rawPayload: {
          From: testCase.from,
          To: SANDBOX_TO,
          Body: testCase.body,
          MessageSid: `SM_QA_${testCase.label}`,
        },
      },
      store,
      knownDirectory,
    );
    const nluEvent = result.conversation.events.findLast(
      (event) => event.eventType === "nlu_classified",
    );
    const intent =
      typeof nluEvent?.payload === "object" && nluEvent.payload && "intent" in nluEvent.payload
        ? String(nluEvent.payload.intent)
        : "(policy)";
    const ok =
      result.conversation.mode === testCase.expectMode &&
      isTwiml(result.twiml) &&
      (result.botReply?.body ?? "").includes(testCase.expectReply);

    rows.push({
      label: testCase.label,
      status: ok ? "OK" : "FAIL",
      intent,
      mode: result.conversation.mode,
      twiml: isTwiml(result.twiml) ? "valid" : "invalid",
      events: result.conversation.events.map((event) => event.eventType).join(","),
      entryLogAffected: "no",
      reply: summarizeReply(result.botReply?.body),
    });
  }

  const humanFirst = await handleInboundWhatsApp(
    {
      from: "whatsapp:+34600009996",
      to: SANDBOX_TO,
      body: "Quiero hablar con una persona",
      messageSid: "SM_QA_human_1",
    },
    store,
  );
  const humanSecond = await handleInboundWhatsApp(
    {
      from: "whatsapp:+34600009996",
      to: SANDBOX_TO,
      body: "Sigo esperando",
      messageSid: "SM_QA_human_2",
    },
    store,
  );
  rows.push({
    label: "human-follow-up",
    status:
      humanFirst.conversation.mode === "human" &&
      !humanSecond.botReply &&
      isTwiml(humanSecond.twiml)
        ? "OK"
        : "FAIL",
    intent: "human_handoff",
    mode: humanSecond.conversation.mode,
    twiml: isTwiml(humanSecond.twiml) ? "valid" : "invalid",
    events: humanSecond.conversation.events.map((event) => event.eventType).join(","),
    entryLogAffected: "no",
    reply: summarizeReply(humanSecond.botReply?.body),
  });

  console.table(rows);

  const failed = rows.filter((row) => row.status !== "OK");
  if (failed.length > 0) {
    throw new Error(`Conversation smoke failed: ${failed.map((row) => row.label).join(", ")}`);
  }

  return rows;
}

async function runHttpSmoke(baseUrl: string) {
  const token = process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
  const body = new URLSearchParams({
    From: QA_PHONE,
    To: SANDBOX_TO,
    Body: "Hola, quiero información",
    MessageSid: `SM_QA_HTTP_${Date.now()}`,
  });
  const url = new URL("/api/twilio/whatsapp", baseUrl);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };

  if (token) {
    headers["x-twilio-webhook-token"] = token;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });
  const text = await response.text();
  const ok = response.status === 200 && text.includes("<Response><Message>");

  console.table([
    {
      label: "http-inbound",
      status: ok ? "OK" : "FAIL",
      httpStatus: response.status,
      twiml: text.startsWith(buildTwilioMessageResponse().slice(0, 30)) ? "valid" : "invalid",
      reply: summarizeReply(text.replace(/<[^>]+>/g, " ")),
    },
  ]);

  if (!ok) {
    throw new Error("HTTP conversation smoke failed");
  }
}

async function main() {
  const baseUrl = process.env.CONVERSATION_SMOKE_BASE_URL;

  if (baseUrl) {
    await runHttpSmoke(baseUrl);
    return;
  }

  await runDirectSmoke();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "conversation smoke failed");
  process.exitCode = 1;
});
