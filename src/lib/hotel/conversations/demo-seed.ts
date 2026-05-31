import type {
  ConversationEvent,
  ConversationRecord,
  ConversationSnapshot,
  Message,
} from "./types";

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bprivate_key\b/i,
  /\bclient_secret\b/i,
  /\brefresh_token\b/i,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bya29\.[0-9A-Za-z._-]+\b/,
  /\bsk-[0-9A-Za-z_-]{20,}\b/,
  /\bghp_[0-9A-Za-z]{20,}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
  /bot-somos-muy-perros-[0-9a-f]+\.json/i,
] as const;

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [\s\S]+?PRIVATE KEY-----/gi, "[redacted-private-key]"],
  [/\bBearer\s+[0-9A-Za-z._~+/-]+=*/gi, "Bearer [redacted-token]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]"],
  [/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]"],
];

export function redactConversationText(input: string): string {
  return REDACTION_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    input,
  );
}

export function assertNoSecretLikeValues(value: unknown): void {
  const serialized = JSON.stringify(value);

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(serialized)) {
      throw new Error(
        `Conversation seed contains a secret-like value matching ${pattern}.`,
      );
    }
  }
}

function message(
  conversationId: string,
  index: number,
  createdAt: string,
  direction: Message["direction"],
  senderType: Message["senderType"],
  body: string,
): Message {
  return {
    id: `${conversationId}-m${String(index).padStart(2, "0")}`,
    conversationId,
    direction,
    senderType,
    transport: "whatsapp",
    body: redactConversationText(body),
    createdAt,
  };
}

function event(
  conversationId: string,
  index: number,
  createdAt: string,
  eventType: string,
  payload?: unknown,
): ConversationEvent {
  return {
    id: `${conversationId}-e${String(index).padStart(2, "0")}`,
    conversationId,
    eventType,
    type: eventType,
    label: eventType.replaceAll("_", " "),
    payload,
    createdAt,
    at: createdAt,
  };
}

export function buildConversationSeed(
  updatedAt = new Date().toISOString(),
): ConversationSnapshot {
  const conversations: ConversationRecord[] = [
    {
      id: "conv-demo-001",
      phoneE164: "+34600111001",
      phoneNormalized: "34600111001",
      displayName: "Marta R.",
      customerName: "Marta R.",
      channel: "whatsapp",
      status: "open",
      priority: "normal",
      tags: ["aipap_agua", "disponibilidad"],
      sourceType: "reservation",
      sourceRecordId: "mat-demo-aipap-agua-20260612",
      reservationId: "mat-demo-aipap-agua-20260612",
      serviceDetected: "AIPAP Agua",
      sheetSource: "Maternaly agenda 1",
      sheetRange: "gid-0!A12:K12",
      maternalyReservationStatus: "pending",
      maternalyPaymentStatus: "pending",
      maternalyInvoiceStatus: "pending",
      maternalyReviewStatus: "manual_review_required",
      mode: "bot",
      humanRequested: false,
      lastInboundAt: "2026-06-07T17:24:00.000Z",
      lastOutboundAt: "2026-06-07T17:19:00.000Z",
      lastMessagePreview: "Me viene bien Hydra Leioa, somos 1 persona y necesito justificante.",
      unreadCount: 1,
      createdAt: "2026-06-07T17:18:00.000Z",
      updatedAt: "2026-06-07T17:24:00.000Z",
      messages: [
        message(
          "conv-demo-001",
          1,
          "2026-06-07T17:18:00.000Z",
          "inbound",
          "user",
          "Hola, quiero reservar AIPAP Agua en piscina para la semana que viene.",
        ),
        message(
          "conv-demo-001",
          2,
          "2026-06-07T17:19:00.000Z",
          "outbound",
          "bot",
          "Puedo revisar opciones si Sheets devuelve disponibilidad fiable. Para piscina no confirmo plaza ni justificante hasta pago y confirmacion real.",
        ),
        message(
          "conv-demo-001",
          3,
          "2026-06-07T17:24:00.000Z",
          "inbound",
          "user",
          "Me viene bien Hydra Leioa, somos 1 persona y necesito justificante.",
        ),
      ],
      events: [
        event("conv-demo-001", 1, "2026-06-07T17:18:00.000Z", "conversation_created"),
        event("conv-demo-001", 2, "2026-06-07T17:24:00.000Z", "maternaly_intent_detected"),
        event("conv-demo-001", 3, "2026-06-07T17:24:00.000Z", "reservation_context_detected"),
      ],
    },
    {
      id: "conv-demo-002",
      phoneE164: "+34600111002",
      phoneNormalized: "34600111002",
      displayName: "Ane P.",
      customerName: "Ane P.",
      channel: "whatsapp",
      status: "needs_review",
      priority: "high",
      tags: ["preparacion_parto", "humano"],
      sourceType: "whatsapp",
      sourceRecordId: "whatsapp-34600111002",
      serviceDetected: "Preparacion al Parto",
      maternalyReservationStatus: "none",
      maternalyPaymentStatus: "none",
      maternalyInvoiceStatus: "none",
      maternalyReviewStatus: "manual_review_required",
      mode: "human",
      humanRequested: true,
      assignedAgent: "matronas",
      lastInboundAt: "2026-06-08T09:35:00.000Z",
      lastOutboundAt: "2026-06-08T09:30:00.000Z",
      lastMessagePreview: "Quiero saber si hay entrevista previa antes del curso.",
      unreadCount: 2,
      createdAt: "2026-06-08T09:27:00.000Z",
      updatedAt: "2026-06-08T09:35:00.000Z",
      messages: [
        message(
          "conv-demo-002",
          1,
          "2026-06-08T09:27:00.000Z",
          "inbound",
          "user",
          "Estoy interesada en Preparacion al Parto.",
        ),
        message(
          "conv-demo-002",
          2,
          "2026-06-08T09:30:00.000Z",
          "outbound",
          "bot",
          "Este flujo requiere entrevista o revision del equipo. Te paso con una persona para no inventar condiciones.",
        ),
        message(
          "conv-demo-002",
          3,
          "2026-06-08T09:35:00.000Z",
          "inbound",
          "user",
          "Quiero saber si hay entrevista previa antes del curso.",
        ),
      ],
      events: [
        event("conv-demo-002", 1, "2026-06-08T09:27:00.000Z", "conversation_created"),
        event("conv-demo-002", 2, "2026-06-08T09:30:00.000Z", "human_requested"),
        event("conv-demo-002", 3, "2026-06-08T09:35:00.000Z", "auto_reply_skipped_human_mode"),
      ],
    },
    {
      id: "conv-demo-003",
      phoneE164: "+34600111003",
      phoneNormalized: "34600111003",
      displayName: "Irati V.",
      customerName: "Irati V.",
      channel: "whatsapp",
      status: "open",
      priority: "normal",
      tags: ["pilates", "sheets"],
      sourceType: "demo",
      sourceRecordId: "demo-pilates-bilbao",
      serviceDetected: "Pilates Embarazo",
      sheetSource: "Maternaly agenda 2",
      sheetRange: "gid-0!A5:K5",
      maternalyReservationStatus: "pending",
      maternalyPaymentStatus: "none",
      maternalyInvoiceStatus: "none",
      maternalyReviewStatus: "ok",
      mode: "bot",
      humanRequested: false,
      lastInboundAt: "2026-06-05T11:40:00.000Z",
      lastOutboundAt: "2026-06-05T11:45:00.000Z",
      lastMessagePreview: "Prefiero Bilbao por la mañana.",
      unreadCount: 0,
      createdAt: "2026-06-05T11:40:00.000Z",
      updatedAt: "2026-06-05T11:45:00.000Z",
      messages: [
        message(
          "conv-demo-003",
          1,
          "2026-06-05T11:40:00.000Z",
          "inbound",
          "user",
          "Estoy de 20 semanas y me interesa Pilates.",
        ),
        message(
          "conv-demo-003",
          2,
          "2026-06-05T11:45:00.000Z",
          "outbound",
          "bot",
          "Recojo sede, horario y numero de personas. Solo mostrare huecos si aparecen como fiables en Sheets.",
        ),
      ],
      events: [
        event("conv-demo-003", 1, "2026-06-05T11:40:00.000Z", "conversation_created"),
        event("conv-demo-003", 2, "2026-06-05T11:45:00.000Z", "bot_reply_sent"),
        event("conv-demo-003", 3, "2026-06-05T11:45:00.000Z", "marked_read"),
      ],
    },
  ];

  const seed = {
    conversations,
    updatedAt,
  } satisfies ConversationSnapshot;

  assertNoSecretLikeValues(seed);
  return seed;
}
