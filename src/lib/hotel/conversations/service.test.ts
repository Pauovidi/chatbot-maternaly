import { describe, expect, it } from "vitest";
import {
  handleInboundWhatsApp,
  markConversationRead,
  sendManualReply,
  setConversationMode,
} from "./service";
import {
  createEmptyConversationSnapshot,
  filterConversationRecords,
  type ConversationStore,
} from "./store";
import type {
  Conversation,
  ConversationEvent,
  ConversationListFilters,
  ConversationRecord,
  ConversationSnapshot,
  Message,
} from "./types";

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
      throw new Error("not found");
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
      throw new Error("not found");
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

describe("conversation service", () => {
  it("creates and reuses a conversation by phone", async () => {
    const store = new MemoryConversationStore();

    const first = await handleInboundWhatsApp(
      { from: "whatsapp:+34 612 345 678", body: "Horario?" },
      store,
    );
    const second = await handleInboundWhatsApp(
      { from: "+34612345678", body: "Precio?" },
      store,
    );

    expect(first.conversation.id).toBe(second.conversation.id);
    expect(second.conversation.messages).toHaveLength(4);
  });

  it("keeps human mode silent for bot replies", async () => {
    const store = new MemoryConversationStore();
    const created = await handleInboundWhatsApp(
      { from: "+34612345678", body: "Quiero hablar con una persona" },
      store,
    );

    const inbound = await handleInboundWhatsApp(
      { from: "+34612345678", body: "Sigo esperando" },
      store,
    );

    expect(created.conversation.mode).toBe("human");
    expect(inbound.botReply).toBeUndefined();
    expect(inbound.conversation.events.some((event) => event.eventType === "auto_reply_skipped_human_mode")).toBe(true);
  });

  it("manual reply stores outbound human message and uses mock sender", async () => {
    const store = new MemoryConversationStore();
    const inbound = await handleInboundWhatsApp(
      { from: "+34612345678", body: "persona" },
      store,
    );
    const sentMessages: string[] = [];

    const result = await sendManualReply(
      inbound.conversation.id,
      "Te respondemos por aqui.",
      {
        async sendText(input) {
          sentMessages.push(input.body);
          return { ok: true, mode: "mock", sid: "mock_sid" };
        },
      },
      "admin",
      store,
    );

    expect(result.ok).toBe(true);
    expect(sentMessages).toEqual(["Te respondemos por aqui."]);
    expect(result.conversation.unreadCount).toBe(0);
    expect(result.conversation.messages.at(-1)?.senderType).toBe("human");
  });

  it("manual reply failure stores event without outbound human message", async () => {
    const store = new MemoryConversationStore();
    const inbound = await handleInboundWhatsApp(
      { from: "+34612345678", body: "persona" },
      store,
    );

    const result = await sendManualReply(
      inbound.conversation.id,
      "Hola",
      {
        async sendText() {
          return { ok: false, mode: "real", error: "boom" };
        },
      },
      "admin",
      store,
    );

    expect(result.ok).toBe(false);
    expect(result.conversation.events.some((event) => event.eventType === "manual_reply_failed")).toBe(true);
    expect(result.conversation.messages.filter((message) => message.senderType === "human")).toHaveLength(0);
  });

  it("changes mode and marks read", async () => {
    const store = new MemoryConversationStore();
    const inbound = await handleInboundWhatsApp(
      { from: "+34612345678", body: "Horario?" },
      store,
    );

    const human = await setConversationMode(inbound.conversation.id, "human", "admin", store);
    const read = await markConversationRead(inbound.conversation.id, store);

    expect(human.mode).toBe("human");
    expect(read.unreadCount).toBe(0);
    expect(read.humanRequested).toBe(false);
  });
});
