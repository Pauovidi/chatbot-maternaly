import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import { MaternalyCopyRenderer } from "@/lib/maternaly/conversation/copy-renderer";
import {
  getKnowledgeService,
  getKnowledgeServiceByNormalizedKey,
  type KnowledgeService,
} from "@/lib/maternaly/knowledge/catalog";
import {
  MaternalyConversationInterpreter,
  type MaternalyNluSlots,
  type StructuredIntent,
} from "@/lib/maternaly/llm/interpreter";
import {
  GoogleNormalizedSheetsClient,
  type NormalizedSheetsClient,
  type NormalizedServiceSheetSnapshot,
} from "@/lib/maternaly/sheets/normalized-client";
import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";
import {
  getNormalizedServiceAvailability,
  type NormalizedServiceAvailabilityResult,
} from "@/lib/maternaly/sheets/normalized-service-availability";
import {
  applyRegistrationWritePlan,
  buildRegistrationWritePlan,
  type NormalizedRegistrationWritePlan,
  type NormalizedRegistrationWriteResult,
} from "@/lib/maternaly/sheets/normalized-write";
import {
  humanNormalize,
  type MaternalyNormalizedServiceKey,
} from "@/lib/maternaly/sheets/normalized-template";

export interface MaternalyNormalizedInbound {
  provider: "twilio" | "twilio_sandbox" | "ycloud" | "webchat" | "api";
  from: string;
  to?: string;
  text: string;
  messageSid?: string;
  displayName?: string;
}

export interface MaternalyConversationState extends MaternalyNormalizedFlowState {
  mode: "bot" | "human";
}

export interface MaternalyCoreResult {
  handled: boolean;
  reply?: string;
  intent: StructuredIntent;
  state?: MaternalyNormalizedFlowState;
  conversationPatch: Partial<ConversationRecord>;
  events: Array<{ eventType: string; payload?: unknown }>;
}

type PolicyAction =
  | "silent_human"
  | "reset"
  | "handoff"
  | "privacy"
  | "payment"
  | "invoice"
  | "normalized_registration"
  | "service_info"
  | "greeting"
  | "general";

interface PolicyDecision {
  action: PolicyAction;
  serviceKey?: MaternalyNormalizedServiceKey;
  service?: KnowledgeService | null;
  reason?: string;
}

interface NormalizedToolResult {
  status:
    | "not_configured"
    | "read_error"
    | "sessions_available"
    | "collecting_fields"
    | "write_result";
  serviceKey: MaternalyNormalizedServiceKey;
  snapshot?: NormalizedServiceSheetSnapshot;
  sessions: NormalizedAvailableSession[];
  selectedSession?: NormalizedAvailableSession;
  missingFields: string[];
  plan?: NormalizedRegistrationWritePlan;
  writeResult?: NormalizedRegistrationWriteResult;
  availability?: NormalizedServiceAvailabilityResult;
  error?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function definedEntries<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Partial<T>;
}

function normalize(text: string): string {
  return humanNormalize(text);
}

function safeInternalError(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, "[redacted-private-key]")
    .replace(/[A-Za-z0-9_=-]{64,}/g, "[redacted-token]")
    .slice(0, 240);
}

function classifySheetDiagnostics(toolResult: NormalizedToolResult | undefined): string[] | undefined {
  if (!toolResult) {
    return undefined;
  }

  const diagnostics = new Set<string>();
  const safeError = safeInternalError(toolResult.error) ?? "";
  const parseErrors = toolResult.snapshot
    ? Object.values(toolResult.snapshot.tabs)
        .map((tab) => tab.parseError ?? "")
        .filter(Boolean)
    : [];

  if (toolResult.status === "read_error") {
    diagnostics.add("read_error");
  }

  if (
    toolResult.availability?.reason &&
    !["sessions_available"].includes(toolResult.availability.reason)
  ) {
    diagnostics.add(toolResult.availability.reason);
  }

  if (toolResult.availability?.diagnostics.errorType) {
    diagnostics.add(toolResult.availability.diagnostics.errorType);
  }

  if (parseErrors.some((error) => error.includes("header_not_found"))) {
    diagnostics.add("header_not_found");
  }

  if (/missing_tab|unable to parse range|tab_not_found|sheet_not_found/i.test(safeError)) {
    diagnostics.add("missing_tab");
  }

  if (
    toolResult.status === "sessions_available" &&
    toolResult.sessions.length === 0
  ) {
    diagnostics.add("no_sessions_available");
  }

  if (
    toolResult.sessions.some((session) => session.availabilityStatus === "unknown_capacity") ||
    toolResult.plan?.blockedReasons.includes("unknown_capacity_requires_manual_review")
  ) {
    diagnostics.add("unknown_capacity");
  }

  if (
    toolResult.plan?.blockedReasons.some((reason) =>
      reason.startsWith("missing_required_columns:") || /^missing_.+_column:/.test(reason),
    )
  ) {
    diagnostics.add("missing_required_columns");
  }

  return diagnostics.size > 0 ? Array.from(diagnostics) : undefined;
}

function serviceKeyFromSlots(
  slots: MaternalyNluSlots,
  previous?: MaternalyNormalizedFlowState,
): MaternalyNormalizedServiceKey | undefined {
  return slots.normalized_service_key ?? previous?.serviceKey;
}

function serviceFromDecision(decision: PolicyDecision, state?: MaternalyNormalizedFlowState) {
  return (
    decision.service ??
    getKnowledgeServiceByNormalizedKey(decision.serviceKey ?? state?.serviceKey) ??
    getKnowledgeService(state?.serviceKey)
  );
}

function toPersistedState(state: MaternalyConversationState): MaternalyNormalizedFlowState {
  const persisted: Partial<MaternalyConversationState> = { ...state };
  delete persisted.mode;
  return persisted as MaternalyNormalizedFlowState;
}

function chooseSession(
  message: string,
  state: MaternalyNormalizedFlowState,
  sessions: NormalizedAvailableSession[],
): NormalizedAvailableSession | undefined {
  if (state.selectedSessionId) {
    const previous = sessions.find((session) => session.sessionId === state.selectedSessionId);
    if (previous) {
      return previous;
    }
  }

  const availableSessions = sessions.filter((session) => !session.full);
  if (availableSessions.length === 1) {
    return availableSessions[0];
  }

  const normalized = normalize(message);
  const trimmed = normalized.trim();
  const ordinal =
    trimmed.match(/^(?:opcion\s*)?([1-9])$/)?.[1] ??
    normalized.match(/\bopcion\s*([1-9])\b/)?.[1] ??
    (
      /\b(?:la\s+)?primera\b|\bopcion\s+uno\b/.test(normalized)
        ? "1"
        : /\b(?:la\s+)?segunda\b|\bopcion\s+dos\b/.test(normalized)
          ? "2"
          : /\b(?:la\s+)?tercera\b|\bopcion\s+tres\b/.test(normalized)
            ? "3"
            : /\b(?:la\s+)?cuarta\b|\bopcion\s+cuatro\b/.test(normalized)
              ? "4"
              : undefined
    );
  if (ordinal) {
    return availableSessions[Number.parseInt(ordinal, 10) - 1];
  }

  const dateLike = message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? message.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/)?.[0];
  if (dateLike) {
    const dateMatches = availableSessions.filter((session) => normalize(session.date ?? "").includes(normalize(dateLike)));
    if (dateMatches.length === 1) {
      return dateMatches[0];
    }
  }

  const locationMatches = availableSessions.filter((session) => {
    const haystack = normalize([session.groupName, session.sessionName, session.date, session.startTime].filter(Boolean).join(" "));
    return state.location && haystack.includes(normalize(state.location));
  });
  if (locationMatches.length === 1) {
    return locationMatches[0];
  }

  const modalityMatches = availableSessions.filter((session) => {
    const haystack = normalize([session.groupName, session.sessionName, session.date, session.startTime].filter(Boolean).join(" "));
    return state.modality && haystack.includes(normalize(state.modality));
  });
  if (modalityMatches.length === 1) {
    return modalityMatches[0];
  }

  return undefined;
}

function requiredFieldsForService(
  serviceKey: MaternalyNormalizedServiceKey,
  state: MaternalyNormalizedFlowState,
): string[] {
  const common = [
    !state.fullName ? "fullName" : "",
    !state.phone ? "phone" : "",
    !state.email ? "email" : "",
    !state.peopleCount ? "peopleCount" : "",
  ];
  const serviceSpecific =
    serviceKey === "charla_embarazo_1_20"
      ? [
          state.peopleCount && state.peopleCount > 1 && !state.partnerName ? "partnerName" : "",
          !state.fppOrDueDate && !state.pregnancyWeek ? "fppOrDueDate" : "",
        ]
      : [!state.babyBirthDate ? "babyBirthDate" : ""];

  return [...common, ...serviceSpecific].filter(Boolean);
}

function notesFromState(state: MaternalyNormalizedFlowState) {
  return [
    state.observations,
    state.fppOrDueDate ? `FPP/fecha relevante: ${state.fppOrDueDate}` : "",
    state.babyBirthDate ? `Fecha nacimiento bebé: ${state.babyBirthDate}` : "",
    state.partnerName ? `Pareja/acompañante: ${state.partnerName}` : "",
    state.location ? `Sede/modalidad preferida: ${state.location}` : "",
  ].filter(Boolean).join(" | ");
}

export class MaternalyStateReducer {
  reduce(input: {
    conversation: ConversationRecord;
    intent: StructuredIntent;
    message: string;
  }): MaternalyConversationState {
    const previous = input.conversation.maternalyNormalizedFlow;
    const slots = input.intent.slots;
    const serviceKey = serviceKeyFromSlots(slots, previous);

    return {
      ...(previous ?? { updatedAt: nowIso() }),
      ...definedEntries({
        serviceKey,
        fullName: slots.full_name ?? previous?.fullName,
        phone: slots.phone ?? previous?.phone,
        email: slots.email ?? previous?.email,
        peopleCount: slots.people_count ?? previous?.peopleCount,
        partnerName: slots.partner_name ?? previous?.partnerName,
        pregnancyWeek: slots.pregnancy_week ?? previous?.pregnancyWeek,
        fppOrDueDate: slots.fpp_or_due_date ?? previous?.fppOrDueDate,
        babyBirthDate: slots.baby_birth_date ?? previous?.babyBirthDate,
        selectedSessionId: slots.selected_session_id ?? previous?.selectedSessionId,
        selectedGroupId: slots.selected_group_id ?? previous?.selectedGroupId,
        location: slots.location ?? previous?.location,
        modality: slots.modality ?? previous?.modality,
        observations: slots.observations ?? previous?.observations,
      }),
      mode: input.conversation.mode,
      updatedAt: nowIso(),
    };
  }
}

export class MaternalyConversationPolicy {
  decide(input: {
    conversation: ConversationRecord;
    intent: StructuredIntent;
    state: MaternalyConversationState;
  }): PolicyDecision {
    const { conversation, intent, state } = input;

    if (intent.intent === "reset") {
      return { action: "reset", reason: "explicit_reset" };
    }

    if (conversation.mode === "human") {
      return { action: "silent_human", reason: "human_mode" };
    }

    if (intent.should_handoff || intent.intent === "handoff_request") {
      const reason = intent.safety_flags.includes("handoff_cancel_or_reschedule")
        ? "cancel_or_reschedule_requires_human"
        : intent.safety_flags.includes("handoff_payment_or_invoice")
          ? "payment_or_invoice_requires_human"
          : "user_or_safety_handoff";
      return { action: "handoff", reason };
    }

    if (intent.intent === "privacy_question") {
      return { action: "privacy" };
    }

    if (intent.intent === "payment_question") {
      return { action: "handoff", reason: "payment_or_invoice_requires_human" };
    }

    if (intent.intent === "invoice_question") {
      return { action: "handoff", reason: "payment_or_invoice_requires_human" };
    }

    if (state.serviceKey) {
      return {
        action: "normalized_registration",
        serviceKey: state.serviceKey,
        service: getKnowledgeServiceByNormalizedKey(state.serviceKey),
      };
    }

    const service = getKnowledgeService(intent.service_candidate);
    if (service?.normalizedServiceKey) {
      return {
        action: "normalized_registration",
        serviceKey: service.normalizedServiceKey,
        service,
      };
    }

    if (service) {
      return { action: "service_info", service };
    }

    if (intent.intent === "greeting") {
      return { action: "greeting" };
    }

    return { action: "general" };
  }
}

export class MaternalyToolExecutor {
  constructor(private readonly client: NormalizedSheetsClient = new GoogleNormalizedSheetsClient()) {}

  async runNormalizedRegistration(input: {
    serviceKey: MaternalyNormalizedServiceKey;
    state: MaternalyNormalizedFlowState;
    message: string;
    env?: NodeJS.ProcessEnv;
  }): Promise<NormalizedToolResult> {
    const env = input.env ?? process.env;

    const availability = await getNormalizedServiceAvailability({
      serviceKey: input.serviceKey,
      client: this.client,
      env,
    });

    if (!availability.ok) {
      const status =
        availability.reason === "missing_sheet_id"
          ? "not_configured"
          : availability.reason === "no_sessions_available"
            ? "sessions_available"
            : "read_error";

      return {
        status,
        serviceKey: input.serviceKey,
        snapshot: availability.snapshot,
        sessions: availability.sessions,
        missingFields: [],
        availability,
        error: availability.diagnostics.errorType ?? availability.reason,
      };
    }

    const snapshot = availability.snapshot as NormalizedServiceSheetSnapshot;
    const sessions = availability.sessions;
    const selectedSession = chooseSession(input.message, input.state, sessions);
    if (!selectedSession) {
      return {
        status: "sessions_available",
        serviceKey: input.serviceKey,
        snapshot,
        sessions,
        missingFields: [],
        availability,
      };
    }

    const stateWithSelection: MaternalyNormalizedFlowState = {
      ...input.state,
      selectedSessionId: selectedSession.sessionId,
      selectedGroupId: selectedSession.groupId,
    };
    const missingFields = requiredFieldsForService(input.serviceKey, stateWithSelection);
    if (missingFields.length > 0) {
      return {
        status: "collecting_fields",
        serviceKey: input.serviceKey,
        snapshot,
        sessions,
        selectedSession,
        missingFields,
        availability,
      };
    }

    const plan = buildRegistrationWritePlan({
      snapshot,
      session: selectedSession,
      draft: {
        serviceKey: input.serviceKey,
        fullName: stateWithSelection.fullName,
        phone: stateWithSelection.phone,
        email: stateWithSelection.email,
        peopleCount: stateWithSelection.peopleCount ?? 1,
        pregnancyWeek: stateWithSelection.pregnancyWeek,
        babyBirthDate: stateWithSelection.babyBirthDate,
        fppOrDueDate: stateWithSelection.fppOrDueDate,
        partnerName: stateWithSelection.partnerName,
        notes: notesFromState(stateWithSelection),
      },
      env,
    });
    const writeResult = await applyRegistrationWritePlan({ snapshot, client: this.client, plan });

    return {
      status: "write_result",
      serviceKey: input.serviceKey,
      snapshot,
      sessions,
      selectedSession,
      missingFields: [],
      plan,
      writeResult,
      availability,
    };
  }
}

function buildAvailabilityCheckedPayload(
  serviceKey: MaternalyNormalizedServiceKey,
  toolResult: NormalizedToolResult,
): Record<string, unknown> {
  const availability = toolResult.availability;
  const sessionsCount = availability?.sessions.length ?? toolResult.sessions.length;
  const reason =
    availability?.reason ??
    (toolResult.status === "not_configured"
      ? "missing_sheet_id"
      : toolResult.status === "read_error"
        ? "read_error"
        : sessionsCount === 0
          ? "no_sessions_available"
          : "sessions_available");

  return {
    route: "whatsapp_core",
    serviceKey,
    ok:
      availability?.ok ??
      (toolResult.status !== "not_configured" &&
        toolResult.status !== "read_error" &&
        sessionsCount > 0),
    sessionsCount,
    reason,
    headersDetected: availability?.diagnostics.headersDetected ?? Boolean(toolResult.snapshot),
    selectedSource: availability?.diagnostics.selectedSource ?? "normalized_sheets",
    sheetIdRedacted: availability?.diagnostics.sheetIdRedacted,
    errorType: availability?.diagnostics.errorType,
  };
}

function availabilityFallbackReason(toolResult: NormalizedToolResult): string | undefined {
  if (toolResult.status === "not_configured" || toolResult.status === "read_error") {
    return toolResult.availability?.reason ?? toolResult.status;
  }

  if (toolResult.status === "sessions_available" && toolResult.sessions.length === 0) {
    return toolResult.availability?.reason ?? "no_sessions_available";
  }

  return undefined;
}

export class MaternalyCoreAdapter {
  constructor(
    private readonly interpreter = new MaternalyConversationInterpreter(),
    private readonly reducer = new MaternalyStateReducer(),
    private readonly policy = new MaternalyConversationPolicy(),
    private readonly toolExecutor = new MaternalyToolExecutor(),
    private readonly renderer = new MaternalyCopyRenderer(),
  ) {}

  async handle(input: {
    conversation: ConversationRecord;
    inbound: MaternalyNormalizedInbound;
    env?: NodeJS.ProcessEnv;
  }): Promise<MaternalyCoreResult> {
    const intent = await this.interpreter.interpret(input.inbound.text);
    const state = this.reducer.reduce({
      conversation: input.conversation,
      intent,
      message: input.inbound.text,
    });
    const decision = this.policy.decide({
      conversation: input.conversation,
      intent,
      state,
    });
    const events: MaternalyCoreResult["events"] = [
      {
        eventType: "maternaly_nlu_interpreted",
        payload: {
          intent: intent.intent,
          serviceCandidate: intent.service_candidate,
          slots: definedEntries({
            service_id: intent.slots.service_id,
            normalized_service_key: intent.slots.normalized_service_key,
            location: intent.slots.location,
            modality: intent.slots.modality,
            people_count: intent.slots.people_count,
            pregnancy_week: intent.slots.pregnancy_week,
          }),
          shouldHandoff: intent.should_handoff,
          safetyFlags: intent.safety_flags,
        },
      },
      {
        eventType: "maternaly_intent_detected",
        payload: {
          botDomain: "maternaly",
          source: "maternaly_core_policy_copy",
          intent: intent.intent,
          serviceCandidate: intent.service_candidate,
          needsAvailabilityLookup: intent.needs_availability_lookup,
          shouldHandoff: intent.should_handoff,
          safetyFlags: intent.safety_flags,
        },
      },
      {
        eventType: "maternaly_policy_decision",
        payload: {
          action: decision.action,
          reason: decision.reason,
          serviceKey: decision.serviceKey ?? state.serviceKey,
        },
      },
    ];

    let toolResult: NormalizedToolResult | undefined;
    let nextState: MaternalyNormalizedFlowState | undefined =
      decision.action === "reset"
        ? undefined
        : {
            ...toPersistedState(state),
            stage:
              decision.action === "handoff"
                ? "handoff"
                : state.serviceKey
                  ? "choosing_session"
                  : state.stage,
            updatedAt: nowIso(),
          };

    if (decision.action === "normalized_registration" && (decision.serviceKey ?? state.serviceKey)) {
      const serviceKey = (decision.serviceKey ?? state.serviceKey) as MaternalyNormalizedServiceKey;
      toolResult = await this.toolExecutor.runNormalizedRegistration({
        serviceKey,
        state: { ...state, serviceKey },
        message: input.inbound.text,
        env: input.env,
      });
      nextState = {
        ...toPersistedState(state),
        serviceKey,
        selectedSessionId: toolResult.selectedSession?.sessionId ?? state.selectedSessionId,
        selectedGroupId: toolResult.selectedSession?.groupId ?? state.selectedGroupId,
        stage:
          toolResult.status === "write_result"
            ? toolResult.plan?.blocked || !toolResult.writeResult?.ok
              ? "blocked"
              : "write_planned"
            : toolResult.status === "collecting_fields"
              ? "collecting_contact"
              : toolResult.status === "sessions_available"
                ? "choosing_session"
                : "collecting_contact",
        idempotencyKey: toolResult.plan?.idempotencyKey ?? state.idempotencyKey,
        updatedAt: nowIso(),
      };
      events.push({
        eventType: "maternaly_availability_checked",
        payload: buildAvailabilityCheckedPayload(serviceKey, toolResult),
      });
      const fallbackReason = availabilityFallbackReason(toolResult);
      if (fallbackReason) {
        events.push({
          eventType: "maternaly_availability_fallback",
          payload: {
            route: "whatsapp_core",
            serviceKey,
            reason: fallbackReason,
            sessionsCount: toolResult.sessions.length,
            headersDetected: toolResult.availability?.diagnostics.headersDetected ?? Boolean(toolResult.snapshot),
            selectedSource: toolResult.availability?.diagnostics.selectedSource ?? "normalized_sheets",
            sheetIdRedacted: toolResult.availability?.diagnostics.sheetIdRedacted,
            errorType: toolResult.availability?.diagnostics.errorType,
          },
        });
      }
      events.push({
        eventType: "maternaly_tool_executed",
        payload: {
          tool: "normalized_sheets_registration",
          status: toolResult.status,
          serviceKey,
          sessionId: toolResult.selectedSession?.sessionId,
          missingFields: toolResult.missingFields,
          mode: toolResult.writeResult?.mode,
          applied: toolResult.writeResult?.applied,
          blockedReasons: toolResult.plan?.blockedReasons,
          diagnostics: classifySheetDiagnostics(toolResult),
          error: safeInternalError(toolResult.error),
          parseErrors: toolResult.snapshot
            ? Object.values(toolResult.snapshot.tabs)
                .filter((tab) => tab.parseError)
                .map((tab) => ({ tab: tab.tab, error: tab.parseError }))
            : undefined,
          updatedRanges: toolResult.writeResult?.updatedRanges,
        },
      });
    }

    const reply = this.renderer.render({ decision, state: nextState, toolResult });
    const service = serviceFromDecision(decision, nextState);
    const needsHuman =
      decision.action === "handoff" ||
      (toolResult?.status === "write_result" && Boolean(toolResult.plan?.blocked || !toolResult.writeResult?.ok));
    if (needsHuman) {
      events.push({
        eventType: "maternaly_handoff_required",
        payload: {
          reason: decision.reason ?? toolResult?.writeResult?.blockedReason ?? "manual_review_required",
          serviceKey: decision.serviceKey ?? state.serviceKey,
          blockedReasons: toolResult?.plan?.blockedReasons,
          readError: safeInternalError(toolResult?.error),
        },
      });
      events.push({
        eventType: "human_requested",
        payload: {
          matchedFrom: "maternaly_core_policy_copy",
          reason: decision.reason ?? toolResult?.writeResult?.blockedReason,
        },
      });
    }

    return {
      handled: true,
      reply,
      intent,
      state: nextState,
      conversationPatch: {
        maternalyNormalizedFlow: nextState,
        serviceDetected: service?.name ?? input.conversation.serviceDetected,
        maternalyReservationStatus:
          decision.action === "normalized_registration" ? "pending" : input.conversation.maternalyReservationStatus ?? "none",
        maternalyPaymentStatus:
          decision.action === "payment" ? "pending" : input.conversation.maternalyPaymentStatus ?? "none",
        maternalyInvoiceStatus:
          decision.action === "invoice" ? "pending" : input.conversation.maternalyInvoiceStatus ?? "none",
        maternalyReviewStatus: needsHuman ? "manual_review_required" : input.conversation.maternalyReviewStatus ?? "ok",
        mode:
          decision.action === "reset"
            ? "bot"
            : needsHuman
              ? "human"
              : input.conversation.mode,
        humanRequested: needsHuman ? true : decision.action === "reset" ? false : input.conversation.humanRequested,
        requiresManualReview:
          needsHuman ? true : decision.action === "reset" ? false : input.conversation.requiresManualReview,
        sheetSource: toolResult?.snapshot ? "normalized_google_sheets" : input.conversation.sheetSource,
        sheetRange:
          toolResult?.writeResult?.updatedRanges.join(", ") || input.conversation.sheetRange,
        tags: Array.from(
          new Set([
            ...(input.conversation.tags ?? []),
            "maternaly",
            decision.action === "normalized_registration" ? "normalized-sheets" : "",
            "policy-copy",
          ].filter(Boolean)),
        ),
        updatedAt: nowIso(),
      },
      events,
    };
  }
}
