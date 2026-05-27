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
      petName: "Luna",
      channel: "whatsapp",
      status: "open",
      priority: "normal",
      tags: ["reserva", "disponibilidad"],
      sourceType: "reservation",
      sourceRecordId: "res-demo-luna-20260412",
      reservationId: "res-demo-luna-20260412",
      mode: "bot",
      humanRequested: false,
      lastInboundAt: "2026-04-07T17:24:00.000Z",
      lastOutboundAt: "2026-04-07T17:19:00.000Z",
      lastMessagePreview: "Perfecto, os paso el formulario y quedo pendiente de la confirmacion.",
      unreadCount: 1,
      createdAt: "2026-04-07T17:18:00.000Z",
      updatedAt: "2026-04-07T17:24:00.000Z",
      messages: [
        message(
          "conv-demo-001",
          1,
          "2026-04-07T17:18:00.000Z",
          "inbound",
          "user",
          "Hola, ¿teneis disponibilidad para Luna del 12 al 16 de abril? Es una labradora tranquila.",
        ),
        message(
          "conv-demo-001",
          2,
          "2026-04-07T17:19:00.000Z",
          "outbound",
          "bot",
          "Para comprobar disponibilidad real, envia la solicitud por el formulario web con fechas de entrada y salida. El equipo revisa plazas y te confirma.",
        ),
        message(
          "conv-demo-001",
          3,
          "2026-04-07T17:24:00.000Z",
          "inbound",
          "user",
          "Perfecto, os paso el formulario y quedo pendiente de la confirmacion.",
        ),
      ],
      events: [
        event("conv-demo-001", 1, "2026-04-07T17:18:00.000Z", "conversation_created"),
        event("conv-demo-001", 2, "2026-04-07T17:24:00.000Z", "reservation_context_detected"),
      ],
    },
    {
      id: "conv-demo-002",
      phoneE164: "+34600111002",
      phoneNormalized: "34600111002",
      displayName: "Carlos P.",
      customerName: "Carlos P.",
      petName: "Nala",
      channel: "whatsapp",
      status: "needs_review",
      priority: "high",
      tags: ["humano", "medicacion"],
      sourceType: "whatsapp",
      sourceRecordId: "whatsapp-34600111002",
      mode: "human",
      humanRequested: true,
      assignedAgent: "demo-admin",
      lastInboundAt: "2026-04-08T09:35:00.000Z",
      lastOutboundAt: "2026-04-08T09:30:00.000Z",
      lastMessagePreview: "Necesito hablar con una persona porque Nala toma medicacion.",
      unreadCount: 2,
      createdAt: "2026-04-08T09:27:00.000Z",
      updatedAt: "2026-04-08T09:35:00.000Z",
      messages: [
        message(
          "conv-demo-002",
          1,
          "2026-04-08T09:27:00.000Z",
          "inbound",
          "user",
          "Nala toma medicacion dos veces al dia. Quiero hablar con alguien del equipo.",
        ),
        message(
          "conv-demo-002",
          2,
          "2026-04-08T09:30:00.000Z",
          "outbound",
          "bot",
          "Perfecto, te paso con una persona del equipo. En cuanto puedan te responderán por aquí.",
        ),
        message(
          "conv-demo-002",
          3,
          "2026-04-08T09:35:00.000Z",
          "inbound",
          "user",
          "Necesito hablar con una persona porque Nala toma medicacion.",
        ),
      ],
      events: [
        event("conv-demo-002", 1, "2026-04-08T09:27:00.000Z", "conversation_created"),
        event("conv-demo-002", 2, "2026-04-08T09:30:00.000Z", "human_requested"),
        event(
          "conv-demo-002",
          3,
          "2026-04-08T09:35:00.000Z",
          "auto_reply_skipped_human_mode",
        ),
      ],
    },
    {
      id: "conv-demo-003",
      phoneE164: "+34600111003",
      phoneNormalized: "34600111003",
      displayName: "Ana V.",
      customerName: "Ana V.",
      petName: "Roco",
      channel: "whatsapp",
      status: "closed",
      priority: "normal",
      tags: ["faq", "comida"],
      sourceType: "demo",
      sourceRecordId: "demo-roco-comida",
      mode: "bot",
      humanRequested: false,
      lastInboundAt: "2026-04-05T11:40:00.000Z",
      lastOutboundAt: "2026-04-05T11:45:00.000Z",
      lastMessagePreview: "Puedes traer su comida habitual con el nombre de la mascota.",
      unreadCount: 0,
      createdAt: "2026-04-05T11:40:00.000Z",
      updatedAt: "2026-04-05T11:45:00.000Z",
      messages: [
        message(
          "conv-demo-003",
          1,
          "2026-04-05T11:40:00.000Z",
          "inbound",
          "user",
          "Roco come pienso especial. ¿Tengo que llevar su comida?",
        ),
        message(
          "conv-demo-003",
          2,
          "2026-04-05T11:45:00.000Z",
          "outbound",
          "bot",
          "Si tu perro tiene comida habitual o dieta especial, lo mejor es traerla identificada con su nombre y pautas.",
        ),
      ],
      events: [
        event("conv-demo-003", 1, "2026-04-05T11:40:00.000Z", "conversation_created"),
        event("conv-demo-003", 2, "2026-04-05T11:45:00.000Z", "bot_reply_sent"),
        event("conv-demo-003", 3, "2026-04-05T11:45:00.000Z", "marked_read"),
      ],
    },
    {
      id: "conv-demo-004",
      phoneE164: "+34600111004",
      phoneNormalized: "34600111004",
      displayName: "Javier M.",
      customerName: "Javier M.",
      petName: "Bruno",
      channel: "whatsapp",
      status: "open",
      priority: "normal",
      tags: ["faq", "vacunas"],
      sourceType: "demo",
      sourceRecordId: "demo-bruno-vacunas",
      mode: "bot",
      humanRequested: false,
      lastInboundAt: "2026-04-09T08:12:00.000Z",
      lastOutboundAt: "2026-04-09T08:13:00.000Z",
      lastMessagePreview: "Necesitamos que las vacunas esten al dia antes de la estancia.",
      unreadCount: 0,
      createdAt: "2026-04-09T08:12:00.000Z",
      updatedAt: "2026-04-09T08:13:00.000Z",
      messages: [
        message(
          "conv-demo-004",
          1,
          "2026-04-09T08:12:00.000Z",
          "inbound",
          "user",
          "¿Que vacunas pedis para Bruno antes de entrar al hotel canino?",
        ),
        message(
          "conv-demo-004",
          2,
          "2026-04-09T08:13:00.000Z",
          "outbound",
          "bot",
          "Necesitamos que las vacunas esten al dia. Si tienes dudas con la cartilla, el equipo puede revisarla antes de la entrada.",
        ),
      ],
      events: [
        event("conv-demo-004", 1, "2026-04-09T08:12:00.000Z", "conversation_created"),
        event("conv-demo-004", 2, "2026-04-09T08:13:00.000Z", "bot_reply_sent"),
      ],
    },
    {
      id: "conv-demo-005",
      phoneE164: "+34600111005",
      phoneNormalized: "34600111005",
      displayName: "Laura S.",
      customerName: "Laura S.",
      petName: "Kira",
      channel: "whatsapp",
      status: "needs_review",
      priority: "high",
      tags: ["cancelacion", "reserva"],
      sourceType: "reservation",
      sourceRecordId: "res-demo-kira-20260421",
      reservationId: "res-demo-kira-20260421",
      mode: "human",
      humanRequested: false,
      assignedAgent: "recepcion",
      lastInboundAt: "2026-04-10T18:02:00.000Z",
      lastOutboundAt: "2026-04-10T18:09:00.000Z",
      lastMessagePreview: "Hola Laura, lo reviso contigo. Podemos cambiar fechas o dejar la cancelacion anotada si lo prefieres.",
      unreadCount: 0,
      createdAt: "2026-04-10T17:50:00.000Z",
      updatedAt: "2026-04-10T18:09:00.000Z",
      messages: [
        message(
          "conv-demo-005",
          1,
          "2026-04-10T17:50:00.000Z",
          "inbound",
          "user",
          "Hola, tengo una reserva para Kira este finde.",
        ),
        message(
          "conv-demo-005",
          2,
          "2026-04-10T17:55:00.000Z",
          "outbound",
          "bot",
          "Si quieres modificar o cancelar una reserva, te paso con el equipo para revisarlo bien.",
        ),
        message(
          "conv-demo-005",
          3,
          "2026-04-10T18:02:00.000Z",
          "inbound",
          "user",
          "Necesito cancelar la reserva de Kira para el finde.",
        ),
        message(
          "conv-demo-005",
          4,
          "2026-04-10T18:09:00.000Z",
          "outbound",
          "human",
          "Hola Laura, lo reviso contigo. Podemos cambiar fechas o dejar la cancelacion anotada si lo prefieres.",
        ),
      ],
      events: [
        event("conv-demo-005", 1, "2026-04-10T17:50:00.000Z", "conversation_created"),
        event("conv-demo-005", 2, "2026-04-10T17:55:00.000Z", "human_requested"),
        event("conv-demo-005", 3, "2026-04-10T18:09:00.000Z", "manual_reply_sent"),
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
