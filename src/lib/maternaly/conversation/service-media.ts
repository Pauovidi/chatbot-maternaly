import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import {
  findKnowledgeService,
  getKnowledgeService,
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
  prefaceText: string;
  triggerKind: "catalog" | "explicit_service" | "contextual_service";
}

interface MaternalyServiceMediaDefinition {
  serviceId: MaternalyActiveServiceId;
  alt: string;
  publicPath: string;
  prefaceText: string;
}

const ACTIVE_SERVICE_MEDIA: readonly MaternalyServiceMediaDefinition[] = [
  {
    serviceId: "charla_embarazo_1_20",
    alt: "Cartel de la charla informativa gratuita de embarazo",
    publicPath: "/maternaly/services/charla-informativa-embarazo.jpeg",
    prefaceText: "Te paso la información de la charla para que sepas en qué consiste.",
  },
  {
    serviceId: "taller_blw",
    alt: "Cartel del taller Baby-Led Weaning",
    publicPath: "/maternaly/services/taller-blw.jpeg",
    prefaceText: "Te paso la información del taller BLW para que sepas en qué consiste.",
  },
];

function isActiveServiceId(value: string | undefined): value is MaternalyActiveServiceId {
  return value === "charla_embarazo_1_20" || value === "taller_blw";
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

  const confirmedServiceTrigger = matchingEvents.some((event) => {
    const previousTrigger = (event.payload as { triggerKind?: unknown }).triggerKind;
    return previousTrigger === "explicit_service" || previousTrigger === "contextual_service";
  });
  if (confirmedServiceTrigger) {
    return true;
  }

  const hasLegacyUnknownTrigger = matchingEvents.some(
    (event) => typeof (event.payload as { triggerKind?: unknown }).triggerKind !== "string",
  );

  // An older catalog response could record both posters even though Twilio delivered
  // only the first attachment. A later explicit service request must therefore retry
  // events marked as catalog. Unknown legacy events stay conservative for contextual
  // inference, while an explicit service mention receives one recoverable retry.
  return triggerKind === "contextual_service" && hasLegacyUnknownTrigger;
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

  // A catalog answer can mention several services, but WhatsApp accepts only one
  // media attachment per message. Wait until the user actually selects or names a
  // service so its poster is both relevant and reliably deliverable.
  const serviceTriggers: Array<Pick<MaternalyServiceMedia, "serviceId" | "triggerKind">> = [
    serviceForTurn({ ...input, inboundText: input.inboundText }),
  ].filter(
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
      prefaceText: media.prefaceText,
      triggerKind: trigger.triggerKind,
    }];
  });
}
