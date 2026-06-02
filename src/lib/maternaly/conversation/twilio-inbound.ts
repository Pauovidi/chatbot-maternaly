import { randomUUID } from "node:crypto";
import { getConversationStore } from "@/lib/hotel/conversations/file-store";
import type { InboundResult, InboundWhatsAppPayload } from "@/lib/hotel/conversations/service";
import { buildTwilioMessageResponse, redactConversationSensitiveText } from "@/lib/hotel/conversations/service";
import type { Conversation, ConversationEvent, ConversationRecord, Message } from "@/lib/hotel/conversations/types";
import type { ConversationStore } from "@/lib/hotel/conversations/store";
import { buildMaternalyWhatsAppReply } from "./response-engine";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function normalizePhone(input: string): { phoneE164: string; phoneNormalized: string } {
  const withoutWhatsapp = input.replace(/^whatsapp:/i, "").trim();
  const digits = withoutWhatsapp.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : `+${digits.replace(/[^\d]/g, "")}`;
  return {
    phoneE164: e164,
    phoneNormalized: e164.replace(/[^\d]/g, ""),
  };
}

function createMessage(input: Omit<Message, "id" | "createdAt" | "transport">): Message {
  return {
    ...input,
    id: createId("msg"),
    transport: "whatsapp",
    createdAt: nowIso(),
  };
}

function createEvent(conversationId: string, eventType: string, payload?: unknown): ConversationEvent {
  return {
    id: createId("evt"),
    conversationId,
    eventType,
    type: eventType,
    label: eventType.replaceAll("_", " "),
    payload,
    createdAt: nowIso(),
    at: nowIso(),
  };
}

async function getOrCreateMaternalyConversation(
  store: ConversationStore,
  payload: InboundWhatsAppPayload,
): Promise<ConversationRecord> {
  const normalized = normalizePhone(payload.from);
  const existing = await store.getByPhone(normalized.phoneNormalized);
  const channel = payload.channel || "twilio_sandbox";

  if (existing) {
    if (existing.archivedAt) {
      const reopened = await store.replaceConversation({
        ...existing,
        archivedAt: undefined,
        archivedBy: undefined,
        archivedReason: undefined,
        updatedAt: nowIso(),
      });
      await store.addEvent(createEvent(existing.id, "conversation_reopened_from_inbound"));
      return (await store.getById(existing.id)) ?? reopened;
    }

    if ((payload.displayName && existing.displayName !== payload.displayName) || existing.channel !== channel) {
      return store.replaceConversation({
        ...existing,
        displayName: payload.displayName || existing.displayName,
        channel,
        sourceType: "whatsapp",
        updatedAt: nowIso(),
      });
    }

    return existing;
  }

  const createdAt = nowIso();
  const conversation: Conversation = {
    id: createId("conv"),
    phoneE164: normalized.phoneE164,
    phoneNormalized: normalized.phoneNormalized,
    displayName: payload.displayName,
    sourceType: "whatsapp",
    channel,
    status: "open",
    priority: "normal",
    tags: ["maternaly"],
    mode: "bot",
    humanRequested: false,
    unreadCount: 0,
    maternalyReservationStatus: "none",
    maternalyPaymentStatus: "none",
    maternalyInvoiceStatus: "none",
    maternalyReviewStatus: "ok",
    createdAt,
    updatedAt: createdAt,
  };

  const record = await store.upsertConversation(conversation);
  await store.addEvent(
    createEvent(record.id, "conversation_created", {
      sourceType: "whatsapp",
      channel,
      botDomain: "maternaly",
    }),
  );
  return (await store.getById(record.id)) ?? record;
}

function applyMaternalyIntent(record: ConversationRecord, intent: Awaited<ReturnType<typeof buildMaternalyWhatsAppReply>>["intent"]): ConversationRecord {
  const needsHuman = intent.should_handoff || intent.intent === "handoff_request";
  return {
    ...record,
    serviceDetected: intent.service_candidate ?? record.serviceDetected,
    maternalyPaymentStatus:
      intent.intent === "payment_question" ? "pending" : record.maternalyPaymentStatus ?? "none",
    maternalyInvoiceStatus:
      intent.intent === "invoice_question" ? "pending" : record.maternalyInvoiceStatus ?? "none",
    maternalyReservationStatus:
      intent.intent === "reservation_interest" ? "pending" : record.maternalyReservationStatus ?? "none",
    maternalyReviewStatus: needsHuman ? "manual_review_required" : record.maternalyReviewStatus ?? "ok",
    mode: needsHuman ? "human" : record.mode,
    humanRequested: needsHuman ? true : record.humanRequested,
    requiresManualReview: record.requiresManualReview || needsHuman,
    tags: Array.from(new Set([...(record.tags ?? []), "maternaly"])),
    updatedAt: nowIso(),
  };
}

export async function handleInboundMaternalyWhatsApp(
  payload: InboundWhatsAppPayload,
  store: ConversationStore = getConversationStore(),
): Promise<InboundResult> {
  const conversation = await getOrCreateMaternalyConversation(store, payload);
  const safeBody = redactConversationSensitiveText(payload.body);

  if (payload.messageSid) {
    const existing = conversation.messages.find(
      (message) => message.externalMessageSid === payload.messageSid,
    );

    if (existing) {
      return {
        conversation,
        inbound: existing,
        twiml: buildTwilioMessageResponse(),
      };
    }
  }

  const inbound = await store.addMessage(
    createMessage({
      conversationId: conversation.id,
      direction: "inbound",
      senderType: "user",
      externalMessageSid: payload.messageSid,
      body: safeBody,
      rawPayload: payload.rawPayload,
    }),
  );

  const latest = (await store.getById(conversation.id)) ?? conversation;
  if (latest.mode === "human") {
    await store.addEvent(createEvent(latest.id, "auto_reply_skipped_human_mode"));
    return {
      conversation: (await store.getById(latest.id)) ?? latest,
      inbound,
    };
  }

  const maternaly = await buildMaternalyWhatsAppReply(safeBody);
  const needsHuman = maternaly.intent.should_handoff || maternaly.intent.intent === "handoff_request";
  const updated = await store.replaceConversation(applyMaternalyIntent(latest, maternaly.intent));
  await store.addEvent(
    createEvent(latest.id, "maternaly_intent_detected", {
      botDomain: "maternaly",
      intent: maternaly.intent.intent,
      serviceCandidate: maternaly.intent.service_candidate,
      needsAvailabilityLookup: maternaly.intent.needs_availability_lookup,
      shouldHandoff: maternaly.intent.should_handoff,
      safetyFlags: maternaly.intent.safety_flags,
    }),
  );
  if (needsHuman) {
    await store.addEvent(
      createEvent(latest.id, "human_requested", {
        matchedFrom: "maternaly_response_engine",
        intent: maternaly.intent.intent,
      }),
    );
  }

  const botReply = await store.addMessage(
    createMessage({
      conversationId: latest.id,
      direction: "outbound",
      senderType: "bot",
      body: maternaly.reply,
    }),
  );
  await store.addEvent(
    createEvent(latest.id, "bot_reply_sent", {
      botDomain: "maternaly",
      source: "maternaly_response_engine",
      intent: maternaly.intent.intent,
    }),
  );

  return {
    conversation: (await store.getById(latest.id)) ?? updated,
    inbound,
    botReply,
    twiml: buildTwilioMessageResponse(maternaly.reply),
  };
}
