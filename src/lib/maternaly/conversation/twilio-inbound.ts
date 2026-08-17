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
import { MaternalyConversationOutbox, type MaternalyOutboundMedia } from "@/lib/maternaly/conversation/outbox";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import { resolveMaternalyServiceMedia } from "@/lib/maternaly/conversation/service-media";
import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";
import {
  createMaternalyReminderLifecycle,
  type MaternalyReminderLifecycle,
} from "@/lib/maternaly/reminders/lifecycle";
import { PostgresMaternalyReminderRepository } from "@/lib/maternaly/reminders/postgres-repository";
import { MATERNALY_SAFE_FALLBACK, ensureMaternalySafeReply } from "./response-engine";
import { withMaternalyConversationTurnLock } from "./turn-lock";

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

export type MaternalyServiceMediaDispatchTransport =
  | "twilio_rest_api"
  | "twiml"
  | "ycloud_api";

export interface MaternalyServiceMediaDispatchOutcome {
  conversationId: string;
  messageId: string;
  media: readonly {
    serviceId?: string;
    triggerKind?: MaternalyOutboundMedia["triggerKind"];
  }[];
  outcome: "queued" | "failed";
  transport: MaternalyServiceMediaDispatchTransport;
  prefaceTransport?: MaternalyServiceMediaDispatchTransport | "not_required";
  posterTransport?: MaternalyServiceMediaDispatchTransport;
  providerSidPresent?: boolean;
  error?: string;
}

export async function recordMaternalyServiceMediaDispatchOutcome(
  input: MaternalyServiceMediaDispatchOutcome,
  store: ConversationStore = getConversationStore(),
): Promise<void> {
  const eventType = input.outcome === "queued"
    ? "maternaly_service_media_dispatched"
    : "maternaly_service_media_dispatch_failed";

  for (const item of input.media) {
    if (
      item.serviceId !== "charla_embarazo_1_20"
      && item.serviceId !== "taller_blw"
    ) {
      continue;
    }
    const current = await store.getById(input.conversationId);
    const alreadyRecorded = current?.events.some((event) => {
      if (event.eventType !== eventType || typeof event.payload !== "object" || !event.payload) {
        return false;
      }
      const payload = event.payload as { messageId?: unknown; serviceId?: unknown };
      return payload.messageId === input.messageId && payload.serviceId === item.serviceId;
    });
    if (alreadyRecorded) {
      continue;
    }

    await store.addEvent(
      createEvent(input.conversationId, eventType, {
        serviceId: item.serviceId,
        triggerKind: item.triggerKind,
        source: "maternaly_service_media",
        messageId: input.messageId,
        deliveryState: input.outcome,
        transport: input.transport,
        prefaceTransport: input.prefaceTransport,
        posterTransport: input.posterTransport,
        providerSidPresent: input.providerSidPresent,
        error: input.error?.slice(0, 300),
      }),
    );
  }
}

export async function recordMaternalyOutboundDeliveryUncertain(
  input: {
    conversationId: string;
    messageId: string;
    transport: "twilio_rest_api";
    error?: string;
  },
  store: ConversationStore = getConversationStore(),
): Promise<void> {
  const current = await store.getById(input.conversationId);
  if (!current) {
    throw new Error("conversation_not_found_for_delivery_reconciliation");
  }
  const alreadyRecorded = current.events.some((event) => {
    if (
      event.eventType !== "maternaly_outbound_delivery_uncertain" ||
      typeof event.payload !== "object" ||
      !event.payload
    ) {
      return false;
    }
    return (event.payload as { messageId?: unknown }).messageId === input.messageId;
  });
  if (alreadyRecorded) {
    return;
  }

  await store.replaceConversation({
    ...current,
    mode: "human",
    humanRequested: true,
    requiresManualReview: true,
    maternalyReviewStatus: "manual_review_required",
    updatedAt: nowIso(),
  });
  await store.addEvent(
    createEvent(input.conversationId, "maternaly_outbound_delivery_uncertain", {
      messageId: input.messageId,
      transport: input.transport,
      deliveryState: "uncertain",
      requiresManualReview: true,
      error: input.error?.slice(0, 300),
    }),
  );
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

function createRuntimeReminderLifecycle(
  env: NodeJS.ProcessEnv,
): MaternalyReminderLifecycle | undefined {
  if (!env.DATABASE_URL?.trim()) {
    return undefined;
  }
  return createMaternalyReminderLifecycle(
    PostgresMaternalyReminderRepository.fromEnv(env),
  );
}

function createCoreAdapter(
  client?: NormalizedSheetsClient,
  reminderLifecycle?: MaternalyReminderLifecycle,
) {
  return client
    ? new MaternalyCoreAdapter(
        undefined,
        undefined,
        undefined,
        new MaternalyToolExecutor(client),
        undefined,
        reminderLifecycle,
      )
    : new MaternalyCoreAdapter(undefined, undefined, undefined, undefined, undefined, reminderLifecycle);
}

export interface HandleInboundMaternalyWhatsAppOptions {
  normalizedSheetsClient?: NormalizedSheetsClient;
  normalizedEnv?: NodeJS.ProcessEnv;
  reminderLifecycle?: MaternalyReminderLifecycle;
}

export async function handleInboundMaternalyWhatsApp(
  payload: InboundWhatsAppPayload,
  store: ConversationStore = getConversationStore(),
  options: HandleInboundMaternalyWhatsAppOptions = {},
): Promise<InboundResult> {
  const env = options.normalizedEnv ?? process.env;
  return withMaternalyConversationTurnLock(
    {
      conversationKey: normalizePhone(payload.from).phoneNormalized,
      env,
    },
    () => handleInboundMaternalyWhatsAppUnlocked(payload, store, options),
  );
}

async function handleInboundMaternalyWhatsAppUnlocked(
  payload: InboundWhatsAppPayload,
  store: ConversationStore,
  options: HandleInboundMaternalyWhatsAppOptions,
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

  const inboundDraft = createMessage({
      conversationId: conversation.id,
      direction: "inbound",
      senderType: "user",
      externalMessageSid: payload.messageSid,
      body: safeBody,
      rawPayload: payload.rawPayload,
    });
  const inbound = await store.addMessage(inboundDraft);
  if (inbound.id !== inboundDraft.id) {
    return {
      conversation: (await store.getById(conversation.id)) ?? conversation,
      inbound,
      twiml: outbox.buildEmpty({ provider }).twiml,
    };
  }
  const latest = (await store.getById(conversation.id)) ?? conversation;
  const runtimeEnv = options.normalizedEnv ?? process.env;
  const adapter = createCoreAdapter(
    options.normalizedSheetsClient,
    options.reminderLifecycle ?? createRuntimeReminderLifecycle(runtimeEnv),
  );
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
    env: runtimeEnv,
  });

  console.info(
    "[maternaly:turn]",
    JSON.stringify({
      conversationId: latest.id,
      mode: latest.mode,
      intent: core.intent.intent,
      action: core.authorityTrace.policy.action,
      hasReply: Boolean(core.reply),
      hasRenderedMessage: Boolean(core.renderedMessage),
      stage: core.state?.stage,
      totalDurationMs: core.authorityTrace.timing.totalDurationMs,
    }),
  );

  const patched = await store.replaceConversation({
    ...latest,
    ...core.conversationPatch,
    updatedAt: nowIso(),
  });
  for (const event of core.events) {
    await store.addEvent(createEvent(latest.id, event.eventType, event.payload));
  }

  if (!core.reply || !core.renderedMessage) {
    if (latest.mode === "bot") {
      const rendered = {
        kind: "text" as const,
        text: ensureMaternalySafeReply(MATERNALY_SAFE_FALLBACK),
        source: "copy_renderer" as const,
        renderer: "MaternalyCopyRenderer" as const,
      };
      const fallbackOutbox = outbox.buildText({
        conversationId: latest.id,
        provider,
        rendered,
      });
      const botReply = await store.addMessage(createMessage(fallbackOutbox.messageDraft));
      await store.addEvent(
        createEvent(latest.id, "bot_auto_reply_fallback", {
          botDomain: "maternaly",
          source: "maternaly_core_policy_copy",
          reason: "no_visible_reply_in_bot_mode",
        }),
      );
      return {
        conversation: (await store.getById(latest.id)) ?? patched,
        inbound,
        botReply,
        twiml: fallbackOutbox.twiml,
      };
    }

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
  const media: MaternalyOutboundMedia[] = resolveMaternalyServiceMedia({
    conversation: latest,
    inboundText: safeBody,
    intent: core.intent,
    state: core.state,
    appBaseUrl: readMaternalyRuntimeConfig(options.normalizedEnv).appBaseUrl,
  });
  const outboxResult = outbox.buildText({
    conversationId: latest.id,
    provider,
    rendered,
    media,
  });
  const dispatchedMedia = outboxResult.media;
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
      mediaServiceIds: dispatchedMedia.map((item) => item.serviceId),
    }),
  );
  for (const item of dispatchedMedia) {
    await store.addEvent(
      createEvent(latest.id, "maternaly_service_media_dispatch_attempted", {
        serviceId: item.serviceId,
        triggerKind: item.triggerKind,
        source: "maternaly_service_media",
        messageId: botReply.id,
        deliveryState: "attempted",
        provider,
      }),
    );
  }

  return {
    conversation: (await store.getById(latest.id)) ?? patched,
    inbound,
    botReply,
    outboundMedia: dispatchedMedia.map((item) => ({ ...item, type: "image" })),
    twiml: outboxResult.twiml,
  };
}
