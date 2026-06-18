import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import {
  GoogleNormalizedSheetsClient,
  readNormalizedServiceSheet,
  type NormalizedSheetsClient,
} from "@/lib/maternaly/sheets/normalized-client";
import {
  formatAvailableSessionsReply,
  listAvailableSessionsFromSnapshot,
  type NormalizedAvailableSession,
} from "@/lib/maternaly/sheets/normalized-availability";
import {
  applyRegistrationWritePlan,
  buildRegistrationWritePlan,
  type NormalizedRegistrationDraft,
} from "@/lib/maternaly/sheets/normalized-write";
import {
  MATERNALY_NORMALIZED_SERVICES,
  humanNormalize,
  type MaternalyNormalizedServiceKey,
} from "@/lib/maternaly/sheets/normalized-template";

export interface NormalizedFlowEvent {
  eventType: string;
  payload?: unknown;
}

export interface NormalizedServiceFlowResult {
  handled: boolean;
  reply?: string;
  nextState?: MaternalyNormalizedFlowState;
  conversationPatch?: Partial<ConversationRecord>;
  events: NormalizedFlowEvent[];
  needsHuman?: boolean;
}

function nowIso() {
  return new Date().toISOString();
}

export function detectNormalizedServiceKey(message: string): MaternalyNormalizedServiceKey | undefined {
  const normalized = humanNormalize(message);
  for (const service of Object.values(MATERNALY_NORMALIZED_SERVICES)) {
    if (service.aliases.some((alias) => normalized.includes(humanNormalize(alias)))) {
      return service.key;
    }
  }

  return undefined;
}

function mentionsAvailability(message: string): boolean {
  return /\b(horarios?|plazas?|disponibilidad|hay|apuntar|apuntarme|reservar|reserva|interesa)\b/i.test(
    humanNormalize(message),
  );
}

function extractEmail(message: string): string | undefined {
  return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(message: string): string | undefined {
  const match = message.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  return match?.[0]?.replace(/\s+/g, " ").trim();
}

function extractPregnancyWeek(message: string): number | undefined {
  const match = humanNormalize(message).match(/\b(?:estoy\s+de\s+)?(\d{1,2})\s*semanas?\b/);
  const week = match ? Number.parseInt(match[1], 10) : undefined;
  return week && week > 0 && week < 45 ? week : undefined;
}

function extractFullName(message: string): string | undefined {
  const cleaned = message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "")
    .trim();
  const match = cleaned.match(/\b(?:(?:soy|me llamo)\s+|nombre[:\s]+)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){1,4})/i);
  if (!match?.[1]) {
    return undefined;
  }

  return match[1].replace(/\b(?:telefono|teléfono|email|correo)\b.*$/i, "").trim();
}

function chooseSession(
  message: string,
  sessions: NormalizedAvailableSession[],
): NormalizedAvailableSession | undefined {
  const normalized = humanNormalize(message);
  const ordinal = normalized.match(/\b(?:opcion\s*)?([1-9])\b/)?.[1];
  if (ordinal) {
    return sessions[Number.parseInt(ordinal, 10) - 1];
  }

  return sessions.find((session) => {
    const haystack = humanNormalize(
      [session.date, session.startTime, session.sessionName, session.groupName].filter(Boolean).join(" "),
    );
    return haystack && haystack.split(/\s+/).some((token) => token.length > 3 && normalized.includes(token));
  });
}

function mergeCollectedData(
  current: MaternalyNormalizedFlowState | undefined,
  message: string,
): Pick<
  MaternalyNormalizedFlowState,
  "fullName" | "phone" | "email" | "peopleCount" | "pregnancyWeek"
> {
  return {
    fullName: extractFullName(message) ?? current?.fullName,
    phone: extractPhone(message) ?? current?.phone,
    email: extractEmail(message) ?? current?.email,
    peopleCount: current?.peopleCount ?? 1,
    pregnancyWeek: extractPregnancyWeek(message) ?? current?.pregnancyWeek,
  };
}

function summarizePlan(plan: ReturnType<typeof buildRegistrationWritePlan>) {
  return {
    serviceKey: plan.serviceKey,
    mode: plan.mode,
    allowedLive: plan.allowedLive,
    blocked: plan.blocked,
    blockedReasons: plan.blockedReasons,
    operations: plan.operations.map((operation) => ({
      tab: operation.tab,
      operation: operation.operation,
    })),
    session: plan.session,
  };
}

function buildContactPrompt(serviceKey: MaternalyNormalizedServiceKey): string {
  const service = MATERNALY_NORMALIZED_SERVICES[serviceKey];
  return [
    "Perfecto, puedo dejar la solicitud preparada.",
    "Para registrarla necesito nombre completo, teléfono y email.",
    service.requiresPregnancyWeek ? "Para esta charla dime también de cuántas semanas estás." : "",
  ].filter(Boolean).join(" ");
}

export async function advanceNormalizedServiceFlow(input: {
  conversation: ConversationRecord;
  message: string;
  client?: NormalizedSheetsClient;
  env?: NodeJS.ProcessEnv;
}): Promise<NormalizedServiceFlowResult> {
  const env = input.env ?? process.env;
  const config = readMaternalyRuntimeConfig(env);
  const client = input.client ?? new GoogleNormalizedSheetsClient();
  const previous = input.conversation.maternalyNormalizedFlow;
  const serviceKey = detectNormalizedServiceKey(input.message) ?? previous?.serviceKey;

  if (!serviceKey || (!previous && !mentionsAvailability(input.message))) {
    return { handled: false, events: [] };
  }

  if (input.conversation.mode === "human") {
    return {
      handled: true,
      reply: "Te dejo con el equipo de Maternaly para que lo revise una persona.",
      events: [
        {
          eventType: "maternaly_normalized_registration_blocked",
          payload: { reason: "human_mode" },
        },
        { eventType: "human_requested", payload: { matchedFrom: "maternaly_normalized_service_flow" } },
      ],
      needsHuman: true,
      conversationPatch: {
        maternalyReviewStatus: "manual_review_required",
        humanRequested: true,
        requiresManualReview: true,
      },
    };
  }

  if (!config.normalizedSheets.enabled) {
    return { handled: false, events: [] };
  }

  let snapshot;
  try {
    snapshot = await readNormalizedServiceSheet(serviceKey, client, env);
  } catch (error) {
    return {
      handled: true,
      reply: "Ahora mismo no tengo el Sheet de ese servicio configurado. Lo dejo pendiente para que el equipo lo revise.",
      nextState: {
        ...previous,
        serviceKey,
        stage: "blocked",
        updatedAt: nowIso(),
      },
      conversationPatch: {
        serviceDetected: MATERNALY_NORMALIZED_SERVICES[serviceKey].label,
        maternalyReservationStatus: "pending",
        maternalyReviewStatus: "manual_review_required",
        humanRequested: true,
        requiresManualReview: true,
      },
      events: [
        {
          eventType: "maternaly_normalized_registration_blocked",
          payload: {
            reason: error instanceof Error ? error.message : "sheet_read_failed",
            serviceKey,
          },
        },
        { eventType: "human_requested", payload: { matchedFrom: "maternaly_normalized_service_flow" } },
      ],
      needsHuman: true,
    };
  }

  const sessions = listAvailableSessionsFromSnapshot(snapshot);
  const selectedSession =
    (previous?.selectedSessionId
      ? sessions.find((session) => session.sessionId === previous.selectedSessionId)
      : undefined) ?? chooseSession(input.message, sessions);
  const collected = mergeCollectedData(previous, input.message);
  const service = MATERNALY_NORMALIZED_SERVICES[serviceKey];
  const baseState: MaternalyNormalizedFlowState = {
    ...previous,
    ...collected,
    serviceKey,
    selectedSessionId: selectedSession?.sessionId ?? previous?.selectedSessionId,
    selectedGroupId: selectedSession?.groupId ?? previous?.selectedGroupId,
    peopleCount: collected.peopleCount ?? 1,
    updatedAt: nowIso(),
  };

  if (!selectedSession) {
    return {
      handled: true,
      reply: formatAvailableSessionsReply(sessions),
      nextState: {
        ...baseState,
        stage: "choosing_session",
      },
      conversationPatch: {
        serviceDetected: service.label,
        maternalyReservationStatus: "pending",
        sheetSource: "normalized_google_sheets",
      },
      events: [
        {
          eventType: "maternaly_normalized_sheet_availability_checked",
          payload: {
            serviceKey,
            sessions: sessions.map((session) => ({
              sessionId: session.sessionId,
              groupId: session.groupId,
              date: session.date,
              startTime: session.startTime,
              availabilityStatus: session.availabilityStatus,
              availableSeats: session.availableSeats,
            })),
          },
        },
      ],
    };
  }

  const missingContact = !baseState.fullName || !baseState.phone;
  const missingPregnancyWeek = service.requiresPregnancyWeek && !baseState.pregnancyWeek;
  if (missingContact || missingPregnancyWeek) {
    return {
      handled: true,
      reply: buildContactPrompt(serviceKey),
      nextState: {
        ...baseState,
        stage: "collecting_contact",
      },
      conversationPatch: {
        serviceDetected: service.label,
        maternalyReservationStatus: "pending",
        sheetSource: "normalized_google_sheets",
      },
      events: [
        {
          eventType: "maternaly_normalized_sheet_availability_checked",
          payload: {
            serviceKey,
            selectedSessionId: selectedSession.sessionId,
            availabilityStatus: selectedSession.availabilityStatus,
            availableSeats: selectedSession.availableSeats,
          },
        },
      ],
    };
  }

  const draft: NormalizedRegistrationDraft = {
    serviceKey,
    fullName: baseState.fullName,
    phone: baseState.phone,
    email: baseState.email,
    peopleCount: baseState.peopleCount ?? 1,
    pregnancyWeek: baseState.pregnancyWeek,
  };
  const plan = buildRegistrationWritePlan({
    snapshot,
    session: selectedSession,
    draft,
    env,
  });
  const writeResult = await applyRegistrationWritePlan({ snapshot, client, plan });
  const blocked = plan.blocked || !writeResult.ok;
  const liveApplied = writeResult.mode === "live" && writeResult.applied;
  const reply = blocked
    ? selectedSession.full
      ? "Ahora mismo no quedan plazas para esa sesión. Puedo dejarte en lista de espera o pasarte con el equipo."
      : "No puedo registrar la solicitud automáticamente con los datos actuales. La dejo pendiente de revisión del equipo."
    : liveApplied
      ? "Te dejamos preinscrita: solicitud registrada pendiente de validación del equipo."
      : "Te dejamos la solicitud preparada y pendiente de validación del equipo. El equipo revisará la disponibilidad antes de cerrarla.";

  return {
    handled: true,
    reply,
    nextState: {
      ...baseState,
      stage: blocked ? "blocked" : "write_planned",
      idempotencyKey: plan.idempotencyKey,
      updatedAt: nowIso(),
    },
    conversationPatch: {
      serviceDetected: service.label,
      maternalyReservationStatus: "pending",
      maternalyReviewStatus: blocked ? "manual_review_required" : "ok",
      humanRequested: blocked ? true : input.conversation.humanRequested,
      requiresManualReview: input.conversation.requiresManualReview || blocked,
      sheetSource: "normalized_google_sheets",
      sheetRange: writeResult.updatedRanges.join(", ") || undefined,
    },
    events: [
      {
        eventType: "maternaly_normalized_registration_write_plan",
        payload: summarizePlan(plan),
      },
      {
        eventType: liveApplied
          ? "maternaly_normalized_registration_written"
          : blocked
            ? "maternaly_normalized_registration_blocked"
            : "maternaly_normalized_registration_write_plan",
        payload: {
          mode: writeResult.mode,
          applied: writeResult.applied,
          blockedReason: writeResult.blockedReason,
          updatedRanges: writeResult.updatedRanges,
        },
      },
      ...(blocked
        ? [{ eventType: "human_requested", payload: { matchedFrom: "maternaly_normalized_service_flow" } }]
        : []),
    ],
    needsHuman: blocked,
  };
}
