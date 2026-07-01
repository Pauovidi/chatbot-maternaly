import { randomUUID } from "node:crypto";
import { getConversationStore } from "@/lib/hotel/conversations/file-store";
import type { InboundResult, InboundWhatsAppPayload } from "@/lib/hotel/conversations/service";
import { redactConversationSensitiveText } from "@/lib/hotel/conversations/service";
import type { Conversation, ConversationEvent, ConversationRecord, Message } from "@/lib/hotel/conversations/types";
import type { ConversationStore } from "@/lib/hotel/conversations/store";
import {
  MaternalyCoreAdapter,
  MaternalyToolExecutor,
} from "@/lib/maternaly/conversation/core";
import { MaternalyConversationOutbox } from "@/lib/maternaly/conversation/outbox";
import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";
import { ensureMaternalySafeReply } from "./response-engine";

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

function createCoreAdapter(client?: NormalizedSheetsClient) {
  return client
    ? new MaternalyCoreAdapter(undefined, undefined, undefined, new MaternalyToolExecutor(client))
    : new MaternalyCoreAdapter();
}

export async function handleInboundMaternalyWhatsApp(
  payload: InboundWhatsAppPayload,
  store: ConversationStore = getConversationStore(),
  options: {
    normalizedSheetsClient?: NormalizedSheetsClient;
    normalizedEnv?: NodeJS.ProcessEnv;
  } = {},
): Promise<InboundResult> {
  const conversation = await getOrCreateMaternalyConversation(store, payload);
  const safeBody = redactConversationSensitiveText(payload.body);
  const provider = payload.channel === "ycloud" ? "ycloud" : payload.channel === "twilio" ? "twilio" : "twilio_sandbox";
  const outbox = new MaternalyConversationOutbox();

  if (payload.messageSid) {
    const existing = conversation.messages.find(
      (message) => message.externalMessageSid === payload.messageSid,
    );

    if (existing) {
      return {
        conversation,
        inbound: existing,
        twiml: outbox.buildEmpty({ provider }).twiml,
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
  const adapter = createCoreAdapter(options.normalizedSheetsClient);
  const core = await adapter.handle({
    conversation: latest,
    inbound: {
      provider,
      from: payload.from,
      to: payload.to,
      text: safeBody,
      messageSid: payload.messageSid,
      displayName: payload.displayName,
    },
    env: options.normalizedEnv,
  });

  const patched = await store.replaceConversation({
    ...latest,
    ...core.conversationPatch,
    updatedAt: nowIso(),
  });
  for (const event of core.events) {
    await store.addEvent(createEvent(latest.id, event.eventType, event.payload));
  }

  if (!core.reply) {
    await store.addEvent(
      createEvent(latest.id, "bot_auto_reply_skipped", {
        botDomain: "maternaly",
        source: "maternaly_core_policy_copy",
        reason: "no_visible_reply",
      }),
    );
    return {
      conversation: (await store.getById(latest.id)) ?? patched,
      inbound,
      twiml: outbox.buildEmpty({ provider }).twiml,
    };
  }

  if (!core.renderedMessage) {
    return {
      conversation: (await store.getById(latest.id)) ?? patched,
      inbound,
      twiml: outbox.buildEmpty({ provider }).twiml,
    };
  }

  const rendered = {
    ...core.renderedMessage,
    text: ensureMaternalySafeReply(core.renderedMessage.text),
  };
  const outboxResult = outbox.buildText({
    conversationId: latest.id,
    provider,
    rendered,
  });
  const botReply = await store.addMessage(
    createMessage(outboxResult.messageDraft),
  );
  await store.addEvent(
    createEvent(latest.id, "bot_reply_sent", {
      botDomain: "maternaly",
      source: "maternaly_core_policy_copy",
      intent: core.intent.intent,
    }),
  );
  await store.addEvent(
    createEvent(latest.id, "maternaly_outbox_sent", {
      provider,
      mode: outboxResult.mode,
      renderedSource: outboxResult.renderedSource,
      messageId: botReply.id,
    }),
  );

  return {
    conversation: (await store.getById(latest.id)) ?? patched,
    inbound,
    botReply,
    twiml: outboxResult.twiml,
  };
}
