import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import { getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import type { StructuredIntent } from "@/lib/maternaly/llm/interpreter";

export type MaternalyActiveServiceId = "charla_embarazo_1_20" | "taller_blw";

export interface MaternalyServiceMedia {
  serviceId: MaternalyActiveServiceId;
  alt: string;
  url: string;
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
): boolean {
  return conversation.events.some(
    (event) =>
      event.eventType === "maternaly_service_media_dispatched" &&
      typeof event.payload === "object" &&
      event.payload !== null &&
      (event.payload as { serviceId?: unknown }).serviceId === serviceId,
  );
}

function serviceForTurn(input: {
  intent: StructuredIntent;
  state?: MaternalyNormalizedFlowState;
}): MaternalyActiveServiceId | undefined {
  const detectedService = getKnowledgeService(input.intent.service_candidate);
  if (isActiveServiceId(detectedService?.id)) {
    return detectedService.id;
  }

  return isActiveServiceId(input.state?.serviceKey) ? input.state.serviceKey : undefined;
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

  const serviceIds = isServicesCatalogQuestion(input.inboundText)
    ? ACTIVE_SERVICE_MEDIA.map((media) => media.serviceId)
    : [serviceForTurn(input)].filter((serviceId): serviceId is MaternalyActiveServiceId => Boolean(serviceId));

  return ACTIVE_SERVICE_MEDIA.filter(
    (media) => serviceIds.includes(media.serviceId) && !mediaAlreadySent(input.conversation, media.serviceId),
  ).map((media) => ({
    serviceId: media.serviceId,
    alt: media.alt,
    url: new URL(media.publicPath, baseUrl).toString(),
  }));
}
