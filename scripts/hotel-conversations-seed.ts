import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  ConversationEvent,
  ConversationRecord,
  Message,
} from "@/lib/hotel/conversations/types";

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

export interface ConversationSeedSnapshot {
  conversations: ConversationRecord[];
  updatedAt: string;
}

function getStoreDirectory(): string {
  if (process.env.HOTEL_CONVERSATIONS_STORE_DIR?.trim()) {
    return process.env.HOTEL_CONVERSATIONS_STORE_DIR.trim();
  }

  if (process.env.HOTEL_CONVERSATIONS_STORE_PATH?.trim()) {
    return path.dirname(process.env.HOTEL_CONVERSATIONS_STORE_PATH.trim());
  }

  return os.tmpdir();
}

function getStoreFile(storeDir = getStoreDirectory()): string {
  return path.join(storeDir, "hotel-conversations.json");
}

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
): ConversationSeedSnapshot {
  const conversations: ConversationRecord[] = [
    {
      id: "conv-demo-001",
      phoneE164: "+34600111001",
      phoneNormalized: "34600111001",
      displayName: "Marta R.",
      customerName: "Marta R.",
      petName: "Luna",
      channel: "web",
      status: "open",
      priority: "normal",
      tags: ["booking", "availability"],
      sourceType: "reservation",
      sourceRecordId: "res-demo-luna-20260412",
      reservationId: "res-demo-luna-20260412",
      mode: "bot",
      humanRequested: false,
      lastInboundAt: "2026-04-07T17:24:00.000Z",
      lastOutboundAt: "2026-04-07T17:19:00.000Z",
      lastMessagePreview: "Perfecto, avisadme si falta algun dato antes de confirmar.",
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
          "Hola, quiero reservar para Luna del 12 al 16 de abril.",
        ),
        message(
          "conv-demo-001",
          2,
          "2026-04-07T17:19:00.000Z",
          "outbound",
          "bot",
          "Puedo ayudarte a revisar la disponibilidad, pero la reserva se cierra desde el formulario oficial.",
        ),
        message(
          "conv-demo-001",
          3,
          "2026-04-07T17:24:00.000Z",
          "inbound",
          "user",
          "Perfecto, avisadme si falta algun dato antes de confirmar.",
        ),
      ],
      events: [
        event("conv-demo-001", 1, "2026-04-07T17:18:00.000Z", "conversation_created"),
        event("conv-demo-001", 2, "2026-04-07T17:24:00.000Z", "message_received"),
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
      tags: ["manual-review", "medication"],
      sourceType: "whatsapp",
      sourceRecordId: "whatsapp-34600111002",
      mode: "human",
      humanRequested: true,
      assignedAgent: "demo-admin",
      lastInboundAt: "2026-04-08T09:35:00.000Z",
      lastOutboundAt: "2026-04-08T09:30:00.000Z",
      lastMessagePreview: "Tambien os he escrito desde [redacted-email].",
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
          "Nala toma medicacion dos veces al dia. Mi telefono es +34 600 123 456.",
        ),
        message(
          "conv-demo-002",
          2,
          "2026-04-08T09:30:00.000Z",
          "outbound",
          "bot",
          "Este caso queda marcado para revision humana antes de confirmar.",
        ),
        message(
          "conv-demo-002",
          3,
          "2026-04-08T09:35:00.000Z",
          "inbound",
          "user",
          "Tambien os he escrito desde carlos@example.com.",
        ),
      ],
      events: [
        event("conv-demo-002", 1, "2026-04-08T09:27:00.000Z", "conversation_created"),
        event("conv-demo-002", 2, "2026-04-08T09:30:00.000Z", "human_requested"),
      ],
    },
    {
      id: "conv-demo-003",
      phoneE164: "+34600111003",
      phoneNormalized: "34600111003",
      displayName: "Ana V.",
      customerName: "Ana V.",
      petName: "Roco",
      channel: "email",
      status: "closed",
      priority: "normal",
      tags: ["faq", "pricing"],
      sourceType: "demo",
      sourceRecordId: "demo-roco-pricing",
      mode: "bot",
      humanRequested: false,
      lastInboundAt: "2026-04-05T11:40:00.000Z",
      lastOutboundAt: "2026-04-05T11:45:00.000Z",
      lastMessagePreview: "Te paso la informacion publicada y te derivo a humano si necesitas un caso especial.",
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
          "Queria saber el precio de guarderia y si hay bono.",
        ),
        message(
          "conv-demo-003",
          2,
          "2026-04-05T11:45:00.000Z",
          "outbound",
          "bot",
          "Te paso la informacion publicada y te derivo a humano si necesitas un caso especial.",
        ),
      ],
      events: [
        event("conv-demo-003", 1, "2026-04-05T11:40:00.000Z", "conversation_created"),
        event("conv-demo-003", 2, "2026-04-05T11:45:00.000Z", "bot_reply_sent"),
      ],
    },
  ];

  const seed = {
    conversations,
    updatedAt,
  } satisfies ConversationSeedSnapshot;

  assertNoSecretLikeValues(seed);
  return seed;
}

export async function writeConversationSeed(
  target = getStoreFile(),
): Promise<string> {
  const seed = buildConversationSeed();
  const targetFile = target.endsWith(".json") ? target : getStoreFile(target);
  const tempFile = `${targetFile}.tmp`;

  await mkdir(path.dirname(targetFile), { recursive: true });
  await writeFile(tempFile, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  await rm(targetFile, { force: true });
  await rename(tempFile, targetFile);

  return targetFile;
}

async function main(): Promise<void> {
  const targetFile = await writeConversationSeed();
  const seed = buildConversationSeed();

  console.log(
    `Seeded ${seed.conversations.length} demo conversations at ${targetFile}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
