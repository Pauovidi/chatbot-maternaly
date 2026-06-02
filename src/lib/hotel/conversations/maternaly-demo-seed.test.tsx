import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationsPanel } from "@/app/admin/conversations/panel";
import {
  buildMaternalyDemoPanelSeedConversations,
  MATERNALY_DEMO_PANEL_SEED_BATCH_ID,
  seedMaternalyDemoConversations,
} from "./maternaly-demo-seed";
import {
  createEmptyConversationSnapshot,
  filterConversationRecords,
  type ConversationStore,
} from "./store";
import type {
  Conversation,
  ConversationDashboard,
  ConversationEvent,
  ConversationListFilters,
  ConversationRecord,
  ConversationSnapshot,
  Message,
} from "./types";

const LEGACY_HOTEL_PATTERN = /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|somos\s+perros)\b/i;

class MemoryConversationStore implements ConversationStore {
  snapshot: ConversationSnapshot = createEmptyConversationSnapshot();

  constructor(records: ConversationRecord[] = []) {
    this.snapshot = {
      conversations: records,
      updatedAt: "2026-06-02T08:00:00.000Z",
    };
  }

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
    return this.snapshot.conversations.find((record) => record.id === id);
  }

  async getByPhone(phoneNormalized: string): Promise<ConversationRecord | undefined> {
    return this.snapshot.conversations.find(
      (record) => record.phoneNormalized === phoneNormalized,
    );
  }

  async upsertConversation(conversation: Conversation): Promise<ConversationRecord> {
    const existing = await this.getById(conversation.id);
    const record = {
      ...existing,
      ...conversation,
      messages: existing?.messages ?? [],
      events: existing?.events ?? [],
    };
    await this.replaceConversation(record);
    return record;
  }

  async addMessage(message: Message): Promise<Message> {
    const record = await this.getById(message.conversationId);
    if (!record) {
      throw new Error("Conversation not found");
    }
    record.messages.push(message);
    await this.replaceConversation(record);
    return message;
  }

  async addEvent(event: ConversationEvent): Promise<ConversationEvent> {
    const record = await this.getById(event.conversationId);
    if (!record) {
      throw new Error("Conversation not found");
    }
    record.events.push(event);
    await this.replaceConversation(record);
    return event;
  }

  async replaceConversation(record: ConversationRecord): Promise<ConversationRecord> {
    const index = this.snapshot.conversations.findIndex(
      (conversation) => conversation.id === record.id,
    );
    if (index >= 0) {
      this.snapshot.conversations[index] = record;
    } else {
      this.snapshot.conversations.push(record);
    }
    return record;
  }

  async seed(records: ConversationRecord[]): Promise<ConversationSnapshot> {
    this.snapshot = {
      conversations: records,
      updatedAt: "2026-06-02T08:00:00.000Z",
    };
    return this.load();
  }
}

function realConversation(): ConversationRecord {
  return {
    id: "conv_real_existing",
    phoneE164: "+34611111111",
    phoneNormalized: "34611111111",
    displayName: "Cliente Real",
    customerName: "Cliente Real",
    channel: "twilio_sandbox",
    status: "open",
    priority: "normal",
    tags: ["real"],
    sourceType: "whatsapp",
    mode: "bot",
    humanRequested: false,
    unreadCount: 0,
    createdAt: "2026-06-02T07:00:00.000Z",
    updatedAt: "2026-06-02T07:00:00.000Z",
    messages: [],
    events: [],
  };
}

describe("Maternaly demo conversations seed", () => {
  it("builds the five realistic demo conversations for the panel", () => {
    const conversations = buildMaternalyDemoPanelSeedConversations();

    expect(conversations).toHaveLength(5);
    expect(conversations.map((conversation) => conversation.serviceDetected)).toEqual([
      "Test ADN / Detesex",
      "Pilates Embarazo",
      "AIPAP Agua",
      "Preparación al Parto",
      "AIPAP Agua",
    ]);
    expect(conversations.every((conversation) => conversation.channel === "twilio_sandbox")).toBe(true);
    expect(conversations.every((conversation) => conversation.sourceType === "demo")).toBe(true);
    expect(conversations.every((conversation) => conversation.sourceRecordId === MATERNALY_DEMO_PANEL_SEED_BATCH_ID)).toBe(true);
  });

  it("creates five conversations and preserves existing real conversations", async () => {
    const store = new MemoryConversationStore([realConversation()]);
    const result = await seedMaternalyDemoConversations({}, store);
    const snapshot = await store.load();

    expect(result.created).toBe(5);
    expect(result.skipped).toBe(0);
    expect(result.totalSeedConversations).toBe(5);
    expect(snapshot.conversations).toHaveLength(6);
    expect(snapshot.conversations.some((conversation) => conversation.id === "conv_real_existing")).toBe(true);
  });

  it("is idempotent by seedBatchId and can force-replace only seed conversations", async () => {
    const store = new MemoryConversationStore([realConversation()]);
    const first = await seedMaternalyDemoConversations({}, store);
    const second = await seedMaternalyDemoConversations({}, store);
    const forced = await seedMaternalyDemoConversations({ force: true }, store);
    const snapshot = await store.load();

    expect(first.created).toBe(5);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(5);
    expect(forced.replaced).toBe(5);
    expect(forced.created).toBe(5);
    expect(snapshot.conversations).toHaveLength(6);
    expect(snapshot.conversations.filter((conversation) => conversation.sourceRecordId === MATERNALY_DEMO_PANEL_SEED_BATCH_ID)).toHaveLength(5);
    expect(snapshot.conversations.some((conversation) => conversation.id === "conv_real_existing")).toBe(true);
  });

  it("marks Test ADN payment, AIPAP pool review, birth-prep handoff and invoice review states", () => {
    const [testAdn, , aipap, birthPrep, invoice] = buildMaternalyDemoPanelSeedConversations();

    expect(testAdn.messages.map((message) => message.body).join("\n")).toContain(
      "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh",
    );
    expect(testAdn.maternalyReservationStatus).toBe("pending");
    expect(testAdn.maternalyPaymentStatus).toBe("pending");
    expect(aipap.requiresManualReview).toBe(true);
    expect(aipap.maternalyReviewStatus).toBe("manual_review_required");
    expect(aipap.tags).toContain("piscina");
    expect(birthPrep.mode).toBe("human");
    expect(birthPrep.humanRequested).toBe(true);
    expect(invoice.maternalyInvoiceStatus).toBe("pending");
    expect(invoice.requiresManualReview).toBe(true);
  });

  it("renders the seeded conversations in the panel without showing the entry registry link", async () => {
    const store = new MemoryConversationStore();
    await seedMaternalyDemoConversations({}, store);
    const conversations = await store.list();
    const dashboard: ConversationDashboard = {
      conversations,
      stats: {
        total: conversations.length,
        unread: conversations.filter((conversation) => conversation.unreadCount > 0).length,
        pending: conversations.filter(
          (conversation) => conversation.humanRequested || conversation.unreadCount > 0,
        ).length,
        human: conversations.filter((conversation) => conversation.mode === "human").length,
        read: conversations.filter(
          (conversation) => conversation.unreadCount === 0 && !conversation.humanRequested,
        ).length,
        archived: 0,
      },
    };
    const html = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboard} whatsAppProviderMode="twilio" />,
    );

    expect(html).toContain("Laura Demo");
    expect(html).toContain("Test ADN / Detesex");
    expect(html).toContain("Cristina Demo");
    expect(html).not.toContain("Registro de entrada");
  });

  it("does not include legacy copy or real Twilio sending code", () => {
    const conversations = buildMaternalyDemoPanelSeedConversations();
    const haystack = JSON.stringify(conversations);
    const source = readFileSync(
      join(process.cwd(), "src/lib/hotel/conversations/maternaly-demo-seed.ts"),
      "utf8",
    );

    expect(haystack).not.toMatch(LEGACY_HOTEL_PATTERN);
    expect(source).not.toContain("sendText");
    expect(source).not.toContain("TWILIO_AUTH_TOKEN");
    expect(source).not.toContain("Twilio");
  });
});
