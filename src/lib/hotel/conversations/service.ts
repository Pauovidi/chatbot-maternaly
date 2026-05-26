import { randomUUID } from "node:crypto";
import { buildConversationSeed } from "./demo-seed";
import {
  ClientDirectoryService,
  getClientDirectory,
  type ClientDirectory,
  type ClientIdentityResult,
} from "@/lib/hotel/clients";
import { resolvePublicChatReply } from "@/lib/hotel/faq/public-chat";
import { getConversationStore } from "./file-store";
import type { ConversationStore } from "./store";
import type {
  Conversation,
  ConversationDashboard,
  ConversationEvent,
  ConversationListFilters,
  ConversationMode,
  ConversationRecord,
  Message,
} from "./types";

export interface InboundWhatsAppPayload {
  from: string;
  to?: string;
  body: string;
  messageSid?: string;
  displayName?: string;
  rawPayload?: unknown;
}

export interface OutboundSender {
  sendText(input: { to: string; body: string }): Promise<{
    ok: boolean;
    mode: "mock" | "real";
    sid?: string;
    error?: string;
  }>;
}

export interface InboundWhatsAppHook {
  receive(payload: InboundWhatsAppPayload): Promise<InboundResult>;
}

export interface InboundResult {
  conversation: ConversationRecord;
  inbound: Message;
  botReply?: Message;
  twiml?: string;
}

export interface ManualReplyResult {
  conversation: ConversationRecord;
  message?: Message;
  ok: boolean;
  mode: "mock" | "real";
  providerSid?: string;
  error?: string;
}

export interface DemoSeedDecisionEnv {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  HOTEL_CONVERSATIONS_DEMO_SEED?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function normalizePhone(input: string): { phoneE164: string; phoneNormalized: string } {
  const withoutWhatsapp = input.replace(/^whatsapp:/i, "").trim();
  const digits = withoutWhatsapp.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : `+${digits.replace(/[^\d]/g, "")}`;
  const normalized = e164.replace(/[^\d]/g, "");

  return {
    phoneE164: e164,
    phoneNormalized: normalized,
  };
}

export function isHumanRequest(body: string): boolean {
  const normalized = body
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  return [
    "persona",
    "agente",
    "humano",
    "operador",
    "recepcion",
    "hablar con alguien",
    "que me llamen",
    "telefono",
    "llamada",
    "atencion",
    "responsable",
    "urgente",
    "emergencia",
    "asesor",
  ].some((phrase) => normalized.includes(phrase));
}

export function shouldAutoSeedConversations(
  env: DemoSeedDecisionEnv = process.env,
): boolean {
  if (env.HOTEL_CONVERSATIONS_DEMO_SEED === "true") {
    return true;
  }

  if (env.VERCEL_ENV === "preview") {
    return true;
  }

  return env.NODE_ENV !== "production";
}

export async function ensureDemoConversationSeed(
  store: ConversationStore = getConversationStore(),
  env: DemoSeedDecisionEnv = process.env,
): Promise<boolean> {
  const snapshot = await store.load();

  if (snapshot.conversations.length > 0 || !shouldAutoSeedConversations(env)) {
    return false;
  }

  await store.seed(buildConversationSeed().conversations);
  return true;
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

function sanitizeClientIdentityPayload(identity: ClientIdentityResult): Record<string, unknown> {
  return {
    status: identity.status,
    confidence: identity.confidence,
    source: identity.source,
    matchCount: identity.matches?.length ?? (identity.client ? 1 : 0),
    warnings: identity.warnings ?? [],
    rowNumber: identity.client?.rowNumber,
    sheetName: identity.client?.sheetName,
  };
}

function applyClientIdentity(
  record: ConversationRecord,
  identity: ClientIdentityResult,
): ConversationRecord {
  const strongIdentity = identity.confidence === "strong";
  const client = identity.client;
  const warnings = Array.from(new Set(identity.warnings ?? []));

  return {
    ...record,
    customerName: strongIdentity && client?.nombre ? client.nombre : record.customerName,
    clientStatus: identity.status,
    clientConfidence: identity.confidence,
    clientName: strongIdentity && client?.nombre ? client.nombre : undefined,
    clientEmail: strongIdentity ? client?.email : undefined,
    clientWarnings: warnings,
    clientSource: identity.source,
    clientSheetName: client?.sheetName,
    clientSheetRow: client?.rowNumber,
    requiresManualReview:
      record.requiresManualReview ||
      identity.status === "blocked" ||
      identity.status === "ambiguous",
    tags: Array.from(
      new Set([
        ...(record.tags ?? []),
        identity.status === "known" ? "cliente_habitual" : undefined,
        identity.status === "blocked" ? "revision_manual" : undefined,
        identity.status === "ambiguous" ? "cliente_ambiguo" : undefined,
      ].filter((tag): tag is string => Boolean(tag))),
    ),
    updatedAt: nowIso(),
  };
}

async function resolveAndPersistClientIdentity(
  store: ConversationStore,
  record: ConversationRecord,
  payload: InboundWhatsAppPayload,
  clientDirectory: ClientDirectory,
): Promise<{ conversation: ConversationRecord; identity: ClientIdentityResult }> {
  const identity = await new ClientDirectoryService(clientDirectory).resolveClientIdentity({
    phone: payload.from,
    name: payload.displayName,
  });
  const next = applyClientIdentity(record, identity);
  const conversation = await store.replaceConversation(next);

  if (identity.status === "known") {
    await store.addEvent(createEvent(record.id, "client_directory_match", sanitizeClientIdentityPayload(identity)));
  } else if (identity.status === "blocked") {
    await store.addEvent(createEvent(record.id, "client_directory_blocked", sanitizeClientIdentityPayload(identity)));
  } else if (identity.status === "ambiguous") {
    await store.addEvent(createEvent(record.id, "client_directory_ambiguous", sanitizeClientIdentityPayload(identity)));
  }

  return {
    conversation: (await store.getById(record.id)) ?? conversation,
    identity,
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

async function getOrCreateConversation(
  store: ConversationStore,
  phone: string,
  displayName?: string,
): Promise<ConversationRecord> {
  const normalized = normalizePhone(phone);
  const existing = await store.getByPhone(normalized.phoneNormalized);

  if (existing) {
    if (displayName && existing.displayName !== displayName) {
      return store.replaceConversation({
        ...existing,
        displayName,
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
    displayName,
    sourceType: "whatsapp",
    channel: "whatsapp",
    status: "open",
    priority: "normal",
    tags: [],
    mode: "bot",
    humanRequested: false,
    unreadCount: 0,
    createdAt,
    updatedAt: createdAt,
  };

  const record = await store.upsertConversation(conversation);
  await store.addEvent(createEvent(record.id, "conversation_created", { sourceType: "whatsapp" }));
  return (await store.getById(record.id)) ?? record;
}

export function createMockInboundWhatsAppHook(
  store: ConversationStore = getConversationStore(),
): InboundWhatsAppHook {
  return {
    receive(payload) {
      return handleInboundWhatsApp(payload, store);
    },
  };
}

export function createRealInboundWhatsAppHook(
  store: ConversationStore = getConversationStore(),
): InboundWhatsAppHook {
  return {
    receive(payload) {
      return handleInboundWhatsApp(payload, store);
    },
  };
}

export async function listConversationDashboard(
  filters?: ConversationListFilters,
  store: ConversationStore = getConversationStore(),
): Promise<ConversationDashboard> {
  await ensureDemoConversationSeed(store);
  const conversations = await store.list(filters);
  const all = await store.list();

  return {
    conversations,
    stats: {
      total: all.length,
      unread: all.filter((conversation) => conversation.unreadCount > 0).length,
      pending: all.filter(
        (conversation) => conversation.humanRequested || conversation.unreadCount > 0,
      ).length,
      human: all.filter((conversation) => conversation.mode === "human").length,
      read: all.filter(
        (conversation) => conversation.unreadCount === 0 && !conversation.humanRequested,
      ).length,
    },
  };
}

export async function getConversation(
  id: string,
  store: ConversationStore = getConversationStore(),
) {
  return store.getById(id);
}

export async function handleInboundWhatsApp(
  payload: InboundWhatsAppPayload,
  store: ConversationStore = getConversationStore(),
  clientDirectory: ClientDirectory = getClientDirectory(),
): Promise<InboundResult> {
  const conversation = await getOrCreateConversation(store, payload.from, payload.displayName);
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
      body: payload.body,
      rawPayload: payload.rawPayload,
    }),
  );

  const fresh = (await store.getById(conversation.id)) ?? conversation;
  const clientIdentity = await resolveAndPersistClientIdentity(
    store,
    fresh,
    payload,
    clientDirectory,
  );
  const freshWithClient = clientIdentity.conversation;

  if (clientIdentity.identity.status === "blocked") {
    const replyBody =
      "Gracias, revisamos tu solicitud con el equipo y te contestamos por aqui.";
    const humanRecord: ConversationRecord = {
      ...freshWithClient,
      mode: "human",
      humanRequested: true,
      priority: "urgent",
      requiresManualReview: true,
      updatedAt: nowIso(),
    };
    await store.replaceConversation(humanRecord);
    const botReply = await store.addMessage(
      createMessage({
        conversationId: freshWithClient.id,
        direction: "outbound",
        senderType: "bot",
        body: replyBody,
      }),
    );

    return {
      conversation: (await store.getById(freshWithClient.id)) ?? humanRecord,
      inbound,
      botReply,
      twiml: buildTwilioMessageResponse(replyBody),
    };
  }

  if (freshWithClient.mode === "human") {
    await store.addEvent(createEvent(freshWithClient.id, "auto_reply_skipped_human_mode"));
    return {
      conversation: (await store.getById(freshWithClient.id)) ?? freshWithClient,
      inbound,
    };
  }

  if (isHumanRequest(payload.body)) {
    const replyBody =
      "Perfecto, te paso con una persona del equipo. En cuanto puedan te responderan por aqui.";
    const humanRecord: ConversationRecord = {
      ...freshWithClient,
      mode: "human",
      humanRequested: true,
      updatedAt: nowIso(),
    };
    await store.replaceConversation(humanRecord);
    await store.addEvent(createEvent(freshWithClient.id, "human_requested", { matchedFrom: "inbound" }));
    const botReply = await store.addMessage(
      createMessage({
        conversationId: freshWithClient.id,
        direction: "outbound",
        senderType: "bot",
        body: replyBody,
      }),
    );

    return {
      conversation: (await store.getById(fresh.id)) ?? humanRecord,
      inbound,
      botReply,
      twiml: buildTwilioMessageResponse(replyBody),
    };
  }

  const reply = resolvePublicChatReply(payload.body).text;
  const botReply = await store.addMessage(
    createMessage({
      conversationId: freshWithClient.id,
      direction: "outbound",
      senderType: "bot",
      body: reply,
    }),
  );
  await store.addEvent(createEvent(freshWithClient.id, "bot_reply_sent", { source: "faq_public_chat" }));

  return {
    conversation: (await store.getById(freshWithClient.id)) ?? freshWithClient,
    inbound,
    botReply,
    twiml: buildTwilioMessageResponse(reply),
  };
}

export async function sendManualReply(
  id: string,
  body: string,
  sender: OutboundSender,
  agent = "admin",
  store: ConversationStore = getConversationStore(),
): Promise<ManualReplyResult> {
  const record = await store.getById(id);

  if (!record) {
    throw new Error("Conversation not found");
  }

  const sent = await sender.sendText({ to: record.phoneE164, body });

  if (!sent.ok) {
    await store.addEvent(
      createEvent(id, "manual_reply_failed", {
        mode: sent.mode,
        error: sent.error ?? "unknown_error",
      }),
    );
    return {
      conversation: (await store.getById(id)) ?? record,
      ok: false,
      mode: sent.mode,
      error: sent.error ?? "No se pudo enviar WhatsApp.",
    };
  }

  const message = await store.addMessage(
    createMessage({
      conversationId: id,
      direction: "outbound",
      senderType: "human",
      externalMessageSid: sent.sid,
      body,
    }),
  );

  const updated = await store.replaceConversation({
    ...((await store.getById(id)) ?? record),
    mode: "human",
    assignedAgent: agent,
    unreadCount: 0,
    humanRequested: false,
    lastOutboundAt: message.createdAt,
    updatedAt: message.createdAt,
  });
  await store.addEvent(
    createEvent(id, "manual_reply_sent", {
      agent,
      mode: sent.mode,
      providerSid: sent.sid,
    }),
  );

  return {
    conversation: (await store.getById(id)) ?? updated,
    message,
    ok: true,
    mode: sent.mode,
    providerSid: sent.sid,
  };
}

export async function setConversationMode(
  id: string,
  mode: ConversationMode,
  agent = "admin",
  store: ConversationStore = getConversationStore(),
) {
  const record = await store.getById(id);

  if (!record) {
    throw new Error("Conversation not found");
  }

  const updated = await store.replaceConversation({
    ...record,
    mode,
    humanRequested: mode === "human" ? record.humanRequested : false,
    assignedAgent: mode === "human" ? agent : undefined,
    updatedAt: nowIso(),
  });
  await store.addEvent(createEvent(id, "mode_changed", { mode, agent }));
  return (await store.getById(id)) ?? updated;
}

export async function markConversationRead(
  id: string,
  store: ConversationStore = getConversationStore(),
) {
  const record = await store.getById(id);

  if (!record) {
    throw new Error("Conversation not found");
  }

  const updated = await store.replaceConversation({
    ...record,
    unreadCount: 0,
    humanRequested: false,
    updatedAt: nowIso(),
  });
  await store.addEvent(createEvent(id, "marked_read"));
  return (await store.getById(id)) ?? updated;
}

export function buildTwilioMessageResponse(message?: string): string {
  if (!message) {
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
