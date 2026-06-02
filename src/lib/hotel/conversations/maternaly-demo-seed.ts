import { getConversationStore } from "./file-store";
import type { ConversationStore } from "./store";
import type { ConversationEvent, ConversationRecord, Message } from "./types";

export const MATERNALY_DEMO_PANEL_SEED_BATCH_ID = "maternaly-demo-panel-seed-v1";
const SEED_TAG = "demo_seed";
const DEFAULT_PAYMENT_LINK = "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh";

export interface MaternalyDemoSeedOptions {
  seedBatchId?: string;
  force?: boolean;
  now?: string;
}

export interface MaternalyDemoSeedResult {
  seedBatchId: string;
  force: boolean;
  created: number;
  skipped: number;
  replaced: number;
  totalSeedConversations: number;
  existingConversationCountBefore: number;
  existingConversationCountAfter: number;
  conversationIds: string[];
  conversations: ConversationRecord[];
}

interface DemoConversationInput {
  slug: string;
  name: string;
  phoneE164: string;
  serviceDetected: string;
  mode: "bot" | "human";
  humanRequested: boolean;
  priority?: ConversationRecord["priority"];
  reservationStatus: NonNullable<ConversationRecord["maternalyReservationStatus"]>;
  paymentStatus: NonNullable<ConversationRecord["maternalyPaymentStatus"]>;
  invoiceStatus: NonNullable<ConversationRecord["maternalyInvoiceStatus"]>;
  reviewStatus: NonNullable<ConversationRecord["maternalyReviewStatus"]>;
  requiresManualReview: boolean;
  tags: string[];
  messages: Array<{ senderType: Message["senderType"]; body: string }>;
  metadata: Record<string, unknown>;
}

function normalizePhone(value: string) {
  const phoneE164 = value.replace(/\s+/g, "");
  return {
    phoneE164,
    phoneNormalized: phoneE164.replace(/[^\d]/g, ""),
  };
}

function isoAt(baseDate: Date, minutes: number): string {
  return new Date(baseDate.getTime() + minutes * 60_000).toISOString();
}

function messageDirection(senderType: Message["senderType"]): Message["direction"] {
  return senderType === "user" ? "inbound" : "outbound";
}

function buildMessages(input: {
  conversationId: string;
  messages: DemoConversationInput["messages"];
  baseDate: Date;
}): Message[] {
  return input.messages.map((message, index) => ({
    id: `${input.conversationId}_msg_${String(index + 1).padStart(2, "0")}`,
    conversationId: input.conversationId,
    direction: messageDirection(message.senderType),
    senderType: message.senderType,
    transport: "whatsapp",
    externalMessageSid: `SM_DEMO_${input.conversationId}_${String(index + 1).padStart(2, "0")}`,
    body: message.body,
    rawPayload: {
      source: "demo_seed",
      provider: "twilio",
    },
    createdAt: isoAt(input.baseDate, index * 4),
  }));
}

function buildEvents(input: {
  conversationId: string;
  seedBatchId: string;
  baseDate: Date;
  serviceDetected: string;
  metadata: Record<string, unknown>;
  requiresManualReview: boolean;
  humanRequested: boolean;
}): ConversationEvent[] {
  const basePayload = {
    source: "demo_seed",
    provider: "twilio",
    seedBatchId: input.seedBatchId,
    serviceDetected: input.serviceDetected,
    ...input.metadata,
  };
  const events: ConversationEvent[] = [
    {
      id: `${input.conversationId}_evt_seed`,
      conversationId: input.conversationId,
      eventType: "demo_seed_applied",
      type: "demo_seed_applied",
      label: "Demo seed applied",
      payload: basePayload,
      createdAt: isoAt(input.baseDate, 1),
      at: isoAt(input.baseDate, 1),
    },
    {
      id: `${input.conversationId}_evt_intent`,
      conversationId: input.conversationId,
      eventType: "maternaly_intent_detected",
      type: "maternaly_intent_detected",
      label: "Servicio Maternaly detectado",
      payload: basePayload,
      createdAt: isoAt(input.baseDate, 2),
      at: isoAt(input.baseDate, 2),
    },
  ];

  if (input.requiresManualReview || input.humanRequested) {
    events.push({
      id: `${input.conversationId}_evt_manual_review`,
      conversationId: input.conversationId,
      eventType: input.humanRequested ? "human_requested" : "manual_review_required",
      type: input.humanRequested ? "human_requested" : "manual_review_required",
      label: input.humanRequested ? "Handoff solicitado" : "Revisión manual requerida",
      payload: basePayload,
      createdAt: isoAt(input.baseDate, 3),
      at: isoAt(input.baseDate, 3),
    });
  }

  return events;
}

function buildConversation(
  input: DemoConversationInput,
  seedBatchId: string,
  index: number,
  seedCreatedAt: string,
): ConversationRecord {
  const conversationId = `conv_${seedBatchId.replace(/[^a-z0-9]+/gi, "_")}_${input.slug}`;
  const baseDate = new Date(new Date(seedCreatedAt).getTime() + index * 35 * 60_000);
  const phone = normalizePhone(input.phoneE164);
  const messages = buildMessages({
    conversationId,
    messages: input.messages,
    baseDate,
  });
  const lastMessage = messages.at(-1);
  const lastInbound = messages.findLast((message) => message.direction === "inbound");
  const lastOutbound = messages.findLast((message) => message.direction === "outbound");
  const events = buildEvents({
    conversationId,
    seedBatchId,
    baseDate,
    serviceDetected: input.serviceDetected,
    metadata: input.metadata,
    requiresManualReview: input.requiresManualReview,
    humanRequested: input.humanRequested,
  });

  return {
    id: conversationId,
    phoneE164: phone.phoneE164,
    phoneNormalized: phone.phoneNormalized,
    displayName: input.name,
    customerName: input.name,
    channel: "twilio_sandbox",
    status: "open",
    priority: input.priority ?? (input.requiresManualReview ? "high" : "normal"),
    tags: Array.from(new Set([SEED_TAG, `seed:${seedBatchId}`, ...input.tags])),
    sourceType: "demo",
    sourceRecordId: seedBatchId,
    serviceDetected: input.serviceDetected,
    sheetSource: "CONVERSATIONS",
    maternalyReservationStatus: input.reservationStatus,
    maternalyPaymentStatus: input.paymentStatus,
    maternalyInvoiceStatus: input.invoiceStatus,
    maternalyReviewStatus: input.reviewStatus,
    clientStatus: "unknown",
    clientConfidence: "none",
    clientName: input.name,
    clientEmail:
      input.metadata.email && typeof input.metadata.email === "string"
        ? input.metadata.email
        : undefined,
    clientWarnings: input.requiresManualReview ? ["demo_manual_review"] : [],
    requiresManualReview: input.requiresManualReview,
    mode: input.mode,
    humanRequested: input.humanRequested,
    assignedAgent: input.mode === "human" ? "equipo_maternaly" : undefined,
    lastInboundAt: lastInbound?.createdAt,
    lastOutboundAt: lastOutbound?.createdAt,
    lastMessagePreview: lastMessage?.body.slice(0, 180),
    unreadCount: input.humanRequested ? 1 : 0,
    createdAt: messages[0]?.createdAt ?? seedCreatedAt,
    updatedAt: lastMessage?.createdAt ?? seedCreatedAt,
    messages,
    events,
  };
}

export function buildMaternalyDemoPanelSeedConversations(
  options: Pick<MaternalyDemoSeedOptions, "seedBatchId" | "now"> = {},
): ConversationRecord[] {
  const seedBatchId = options.seedBatchId ?? MATERNALY_DEMO_PANEL_SEED_BATCH_ID;
  const seedCreatedAt = options.now ?? "2026-06-02T08:00:00.000Z";
  const conversations: DemoConversationInput[] = [
    {
      slug: "test_adn_detesex",
      name: "Laura Demo",
      phoneE164: "+34 600 000 101",
      serviceDetected: "Test ADN / Detesex",
      mode: "bot",
      humanRequested: false,
      reservationStatus: "pending",
      paymentStatus: "pending",
      invoiceStatus: "none",
      reviewStatus: "ok",
      requiresManualReview: false,
      tags: ["test_adn", "detesex", "reserva_pendiente_pago"],
      metadata: {
        sede: "Bilbao",
        date: "08/06/2026",
        time: "18:20",
        email: "laura.demo@example.com",
        serviceStatus: "reserva_fijada_pendiente_pago",
        reservationStatus: "reserva_fijada_pendiente_pago",
        paymentStatus: "pendiente",
        invoiceStatus: "no_solicitada",
        paymentLinkConfigured: true,
      },
      messages: [
        { senderType: "user", body: "Hola, quiero reservar Test ADN." },
        {
          senderType: "bot",
          body: "Puedo ayudarte con Test ADN / Detesex. Según la última cita registrada, puedo proponerte una nueva cita para el 08/06/2026 a las 18:20. ¿La prefieres en Bilbao o en Erandio?",
        },
        { senderType: "user", body: "Bilbao." },
        {
          senderType: "bot",
          body: "Perfecto. Para dejar la reserva fijada pendiente de pago necesito nombre y apellidos, email y teléfono de contacto.",
        },
        { senderType: "user", body: "Laura Demo, laura.demo@example.com, 600000101." },
        {
          senderType: "bot",
          body: "Confirmo los datos: Test ADN / Detesex, Bilbao, 08/06/2026 a las 18:20, Laura Demo, laura.demo@example.com. ¿Quieres que deje la reserva fijada pendiente de pago?",
        },
        { senderType: "user", body: "Sí." },
        {
          senderType: "bot",
          body: `Perfecto, dejo tu reserva fijada como pendiente de pago para el 08/06/2026 a las 18:20 en Bilbao. Para completar la reserva, puedes realizar el pago aquí: ${DEFAULT_PAYMENT_LINK}`,
        },
      ],
    },
    {
      slug: "pilates_embarazo",
      name: "Marta Demo",
      phoneE164: "+34 600 000 102",
      serviceDetected: "Pilates Embarazo",
      mode: "bot",
      humanRequested: false,
      reservationStatus: "pending",
      paymentStatus: "none",
      invoiceStatus: "none",
      reviewStatus: "ok",
      requiresManualReview: false,
      tags: ["pilates_embarazo", "erandio", "interes_recogido"],
      metadata: {
        sedePreferida: "Erandio",
        semanaEmbarazo: 22,
        frecuencia: "una clase por semana",
        serviceStatus: "interes_recogido",
        paymentStatus: "no_iniciado",
        invoiceStatus: "no_aplica",
      },
      messages: [
        { senderType: "user", body: "Hola, me interesa Pilates para embarazadas." },
        {
          senderType: "bot",
          body: "Puedo ayudarte con Pilates Embarazo. Se trabaja movilidad, postura, respiración y suelo pélvico durante el embarazo. ¿Prefieres Bilbao o Erandio?",
        },
        { senderType: "user", body: "Erandio." },
        {
          senderType: "bot",
          body: "Perfecto. En Erandio revisamos horarios de mañana y tarde. Para comprobar disponibilidad necesito tu nombre, semana de embarazo y si buscas 1 o 2 clases por semana.",
        },
        { senderType: "user", body: "Marta Demo, semana 22, una clase por semana." },
        {
          senderType: "bot",
          body: "Gracias, Marta. Dejo tu interés registrado para revisar disponibilidad en Pilates Embarazo en Erandio. El equipo podrá confirmarte el hueco exacto antes de enviarte el pago.",
        },
      ],
    },
    {
      slug: "aipap_agua_piscina",
      name: "Nerea Demo",
      phoneE164: "+34 600 000 103",
      serviceDetected: "AIPAP Agua",
      mode: "human",
      humanRequested: true,
      reservationStatus: "pending",
      paymentStatus: "pending",
      invoiceStatus: "pending",
      reviewStatus: "manual_review_required",
      requiresManualReview: true,
      tags: ["aipap_agua", "piscina", "justificante", "revision_manual"],
      metadata: {
        sede: "Up&You Bilbao",
        serviceStatus: "revision_manual_requerida",
        reservationStatus: "revision_manual_requerida",
        paymentStatus: "pendiente",
        invoiceStatus: "critico_piscina",
        criticalReason: "justificante_piscina",
      },
      messages: [
        { senderType: "user", body: "Quiero información de AIPAP Agua en Bilbao." },
        {
          senderType: "bot",
          body: "AIPAP Agua es preparación física para el parto en piscina. En Bilbao suele realizarse en Up&You, pero antes de confirmar plaza revisamos disponibilidad real.",
        },
        { senderType: "user", body: "Necesito saber si podré entrar al gimnasio con justificante." },
        {
          senderType: "bot",
          body: "Lo marco como caso importante: para piscina el justificante/confirmación es necesario para acceder. No voy a confirmar plaza ni justificante hasta que el pago y la plaza estén validados.",
        },
        { senderType: "user", body: "Perfecto, quiero que lo revise una persona." },
        {
          senderType: "bot",
          body: "Dejo la conversación en revisión manual para que el equipo confirme disponibilidad, condiciones de acceso y justificante.",
        },
      ],
    },
    {
      slug: "preparacion_parto",
      name: "Ana Demo",
      phoneE164: "+34 600 000 104",
      serviceDetected: "Preparación al Parto",
      mode: "human",
      humanRequested: true,
      reservationStatus: "pending",
      paymentStatus: "none",
      invoiceStatus: "none",
      reviewStatus: "manual_review_required",
      requiresManualReview: true,
      tags: ["preparacion_parto", "entrevista_previa", "handoff"],
      metadata: {
        sedePreferida: "Bilbao",
        semanaEmbarazo: 28,
        requiresInterview: true,
        serviceStatus: "pendiente_entrevista",
        reservationStatus: "pendiente_entrevista",
        paymentStatus: "no_iniciado",
      },
      messages: [
        { senderType: "user", body: "Quiero apuntarme al curso de preparación al parto." },
        {
          senderType: "bot",
          body: "Te puedo orientar. Preparación al Parto tiene un flujo especial porque antes de cerrar el curso puede requerir entrevista previa. ¿De cuántas semanas estás y prefieres Bilbao o Erandio?",
        },
        { senderType: "user", body: "Estoy de 28 semanas y prefiero Bilbao." },
        {
          senderType: "bot",
          body: "Gracias. Lo dejo preparado para revisión del equipo: Preparación al Parto, Bilbao, semana 28. El equipo te indicará la entrevista previa y las fechas disponibles.",
        },
        { senderType: "user", body: "Me gustaría hablar con alguien." },
        {
          senderType: "bot",
          body: "Claro, paso la conversación a atención humana para que puedan ayudarte directamente.",
        },
      ],
    },
    {
      slug: "factura_justificante",
      name: "Cristina Demo",
      phoneE164: "+34 600 000 105",
      serviceDetected: "AIPAP Agua",
      mode: "human",
      humanRequested: true,
      reservationStatus: "pending",
      paymentStatus: "pending",
      invoiceStatus: "pending",
      reviewStatus: "manual_review_required",
      requiresManualReview: true,
      tags: ["factura", "justificante", "pago_no_validado", "revision_manual"],
      metadata: {
        serviceStatus: "factura_justificante_pendiente_revision",
        reservationStatus: "pendiente_revision",
        paymentStatus: "cliente_dice_pagado_no_validado",
        invoiceStatus: "pendiente_revision",
        criticalReason: "justificante_piscina",
      },
      messages: [
        { senderType: "user", body: "Hola, ya he pagado y necesito la factura." },
        {
          senderType: "bot",
          body: "Gracias por avisar. No puedo marcar el pago como confirmado hasta que exista validación real en el sistema, pero dejo anotada la solicitud de factura.",
        },
        { senderType: "user", body: "Es para poder entrar a la piscina." },
        {
          senderType: "bot",
          body: "Entendido. Lo marco como prioritario porque en piscina el justificante es importante para acceder. El equipo revisará el pago y la factura/confirmación.",
        },
        { senderType: "user", body: "Gracias." },
        {
          senderType: "bot",
          body: "Dejo la conversación pendiente de revisión humana para confirmar pago, factura y justificante.",
        },
      ],
    },
  ];

  return conversations.map((conversation, index) =>
    buildConversation(conversation, seedBatchId, index, seedCreatedAt),
  );
}

function eventHasSeedBatch(event: ConversationEvent, seedBatchId: string): boolean {
  const payload = event.payload;
  return (
    Boolean(payload) &&
    typeof payload === "object" &&
    (payload as { seedBatchId?: unknown }).seedBatchId === seedBatchId
  );
}

export function conversationBelongsToMaternalyDemoSeed(
  conversation: ConversationRecord,
  seedBatchId = MATERNALY_DEMO_PANEL_SEED_BATCH_ID,
): boolean {
  return (
    conversation.sourceRecordId === seedBatchId ||
    conversation.tags?.includes(`seed:${seedBatchId}`) ||
    conversation.events.some((event) => eventHasSeedBatch(event, seedBatchId))
  );
}

export async function seedMaternalyDemoConversations(
  options: MaternalyDemoSeedOptions = {},
  store: ConversationStore = getConversationStore(),
): Promise<MaternalyDemoSeedResult> {
  const seedBatchId = options.seedBatchId ?? MATERNALY_DEMO_PANEL_SEED_BATCH_ID;
  const force = options.force === true;
  const seedConversations = buildMaternalyDemoPanelSeedConversations({
    seedBatchId,
    now: options.now,
  });
  const snapshot = await store.load();
  const existingSeedConversations = snapshot.conversations.filter((conversation) =>
    conversationBelongsToMaternalyDemoSeed(conversation, seedBatchId),
  );
  const existingSeedIds = new Set(existingSeedConversations.map((conversation) => conversation.id));
  const keptConversations = force
    ? snapshot.conversations.filter(
        (conversation) => !conversationBelongsToMaternalyDemoSeed(conversation, seedBatchId),
      )
    : snapshot.conversations;
  const conversationsToCreate = force
    ? seedConversations
    : seedConversations.filter((conversation) => !existingSeedIds.has(conversation.id));

  if (conversationsToCreate.length > 0 || force) {
    await store.save({
      ...snapshot,
      conversations: [...keptConversations, ...conversationsToCreate],
      updatedAt: new Date().toISOString(),
    });
  }

  const finalSnapshot = await store.load();
  const finalSeedConversations = finalSnapshot.conversations.filter((conversation) =>
    conversationBelongsToMaternalyDemoSeed(conversation, seedBatchId),
  );

  return {
    seedBatchId,
    force,
    created: conversationsToCreate.length,
    skipped: seedConversations.length - conversationsToCreate.length,
    replaced: force ? existingSeedConversations.length : 0,
    totalSeedConversations: finalSeedConversations.length,
    existingConversationCountBefore: snapshot.conversations.length,
    existingConversationCountAfter: finalSnapshot.conversations.length,
    conversationIds: finalSeedConversations.map((conversation) => conversation.id),
    conversations: finalSeedConversations,
  };
}
