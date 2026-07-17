import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import {
  findKnowledgeService,
  getKnowledgeService,
  getKnowledgeServicesByModality,
} from "@/lib/maternaly/knowledge/catalog";
import {
  isMaternalyResetRequest,
  type StructuredIntent,
} from "@/lib/maternaly/llm/interpreter";

export type MaternalyActiveServiceId = "charla_embarazo_1_20" | "taller_blw";

export interface MaternalyServiceMedia {
  serviceId: MaternalyActiveServiceId;
  alt: string;
  url: string;
  triggerKind: "catalog" | "explicit_service" | "contextual_service";
}

interface MaternalyServiceMediaDefinition {
  serviceId: MaternalyActiveServiceId;
  alt: string;
  publicPath: string;
}

const ACTIVE_SERVICE_MEDIA: readonly MaternalyServiceMediaDefinition[] = [
  {
    serviceId: "charla_embarazo_1_20",
    alt: "Cartel de la charla informativa gratuita de embarazo",
    publicPath: "/maternaly/services/charla-informativa-embarazo.jpeg",
  },
  {
    serviceId: "taller_blw",
    alt: "Cartel del taller Baby-Led Weaning",
    publicPath: "/maternaly/services/taller-blw.jpeg",
  },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isActiveServiceId(value: string | undefined): value is MaternalyActiveServiceId {
  return value === "charla_embarazo_1_20" || value === "taller_blw";
}

function isServicesCatalogQuestion(text: string): boolean {
  const normalized = normalize(text);
  if (normalized.trim() === "servicio" || normalized.trim() === "servicios") {
    return true;
  }

  return /\bservicios?\b/.test(normalized) &&
    /\b(?:que|cuales|cual|ten[eé]is|ofrec[eé]is|hay|ver|lista|informacion|info)\b/.test(normalized);
}

function mediaAlreadySent(
  conversation: ConversationRecord,
  serviceId: MaternalyActiveServiceId,
  triggerKind: MaternalyServiceMedia["triggerKind"],
): boolean {
  const latestResetAt = conversation.messages
    .filter(
      (message) =>
        message.senderType === "user" && isMaternalyResetRequest(message.body),
    )
    .map((message) => message.createdAt)
    .sort()
    .at(-1);
  const matchingEvents = conversation.events.filter(
    (event) =>
      event.eventType === "maternaly_service_media_dispatched" &&
      (!latestResetAt || event.createdAt > latestResetAt) &&
      typeof event.payload === "object" &&
      event.payload !== null &&
      (event.payload as { serviceId?: unknown }).serviceId === serviceId,
  );

  if (matchingEvents.length === 0) {
    return false;
  }

  const hasReliableTriggerMetadata = matchingEvents.some(
    (event) =>
      typeof event.payload === "object" &&
      event.payload !== null &&
      typeof (event.payload as { triggerKind?: unknown }).triggerKind === "string",
  );

  // Previous deployments could attach a stale service poster to a greeting because
  // the persisted registration state was treated as the current topic. An explicit
  // service mention gets one clean retry when the historical event cannot prove how
  // the poster was triggered. New events carry triggerKind and remain deduplicated.
  return hasReliableTriggerMetadata || triggerKind === "contextual_service";
}

function serviceForTurn(input: {
  inboundText: string;
  intent: StructuredIntent;
  state?: MaternalyNormalizedFlowState;
}): Pick<MaternalyServiceMedia, "serviceId" | "triggerKind"> | undefined {
  if (input.intent.intent === "service_discovery" || input.intent.service_scope === "catalog") {
    return undefined;
  }

  const explicitService = findKnowledgeService(input.inboundText);
  if (isActiveServiceId(explicitService?.id)) {
    return { serviceId: explicitService.id, triggerKind: "explicit_service" };
  }

  if (![
    "service_question",
    "availability_request",
    "registration_start",
  ].includes(input.intent.intent)) {
    return undefined;
  }

  const detectedService = getKnowledgeService(input.intent.service_candidate);
  if (isActiveServiceId(detectedService?.id)) {
    return { serviceId: detectedService.id, triggerKind: "contextual_service" };
  }

  return isActiveServiceId(input.state?.serviceKey)
    ? { serviceId: input.state.serviceKey, triggerKind: "contextual_service" }
    : undefined;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function resolveMaternalyServiceMedia(input: {
  conversation: ConversationRecord;
  inboundText: string;
  intent: StructuredIntent;
  state?: MaternalyNormalizedFlowState;
  appBaseUrl?: string;
}): MaternalyServiceMedia[] {
  const baseUrl = normalizeBaseUrl(input.appBaseUrl);
  if (!baseUrl) {
    return [];
  }

  const isCatalogTurn =
    input.intent.intent === "service_discovery" ||
    input.intent.service_scope === "catalog" ||
    isServicesCatalogQuestion(input.inboundText);
  const catalogServiceIds = input.intent.slots.modality
    ? getKnowledgeServicesByModality(input.intent.slots.modality)
        .map((service) => service.id)
        .filter(isActiveServiceId)
    : ACTIVE_SERVICE_MEDIA.map((media) => media.serviceId);
  const serviceTriggers: Array<Pick<MaternalyServiceMedia, "serviceId" | "triggerKind">> =
    isCatalogTurn
      ? catalogServiceIds.map((serviceId) => ({ serviceId, triggerKind: "catalog" as const }))
      : [serviceForTurn({ ...input, inboundText: input.inboundText })].filter(
          (value): value is Pick<MaternalyServiceMedia, "serviceId" | "triggerKind"> =>
            Boolean(value),
        );

  return ACTIVE_SERVICE_MEDIA.filter(
    (media) => serviceTriggers.some((item) => item.serviceId === media.serviceId),
  ).flatMap((media) => {
    const trigger = serviceTriggers.find((item) => item.serviceId === media.serviceId);
    if (!trigger || mediaAlreadySent(input.conversation, media.serviceId, trigger.triggerKind)) {
      return [];
    }

    return [{
      serviceId: media.serviceId,
      alt: media.alt,
      url: new URL(media.publicPath, baseUrl).toString(),
      triggerKind: trigger.triggerKind,
    }];
  });
}
