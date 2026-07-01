import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import { MaternalyCopyRenderer } from "@/lib/maternaly/conversation/copy-renderer";
import type { MaternalyRenderedMessage } from "@/lib/maternaly/conversation/outbox";
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
  readNormalizedServiceSheet,
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
  renderedMessage?: MaternalyRenderedMessage;
  intent: StructuredIntent;
  state?: MaternalyNormalizedFlowState;
  conversationPatch: Partial<ConversationRecord>;
  events: Array<{ eventType: string; payload?: unknown }>;
  authorityTrace: MaternalyAuthorityTurnTrace;
}

export interface MaternalyAuthorityTiming {
  totalDurationMs: number;
  nluTotalMs: number;
  reducerMs: number;
  policyMs: number;
  toolsMs: number;
  rendererMs: number;
  outboxMs: number;
  persistenceMs: number;
  eventLogMs: number;
  openaiCalls: number;
  usedDeterministicFastPath: boolean;
  usedFallback: boolean;
}

export interface MaternalyAuthorityTurnTrace {
  turnId: string;
  pipeline: Array<
    | "normalized_inbound"
    | "nlu_structured"
    | "state_reducer"
    | "policy"
    | "tool_executor"
    | "copy_renderer"
    | "outbox"
  >;
  inbound: {
    provider: MaternalyNormalizedInbound["provider"];
    textLength: number;
    fromRedacted: string;
  };
  intent: {
    intent: StructuredIntent["intent"];
    serviceCandidate?: string;
    serviceQuestionFocus: StructuredIntent["service_question_focus"];
    locationPreference?: string;
    shouldHandoff: boolean;
    safetyFlags: string[];
  };
  stateBefore: ReturnType<typeof summarizeState>;
  stateAfter: ReturnType<typeof summarizeState> | null;
  policy: {
    action: PolicyAction;
    reason?: string;
    serviceKey?: MaternalyNormalizedServiceKey;
  };
  tool?: {
    status: NormalizedToolResult["status"];
    serviceKey: MaternalyNormalizedServiceKey;
    missingFields: string[];
    applied?: boolean;
    mode?: "dry_run" | "live";
  };
  renderer: {
    source: "MaternalyCopyRenderer";
    visibleReply: boolean;
    action: PolicyAction;
  };
  outbox: {
    planned: boolean;
    kind: "twiml" | "none";
  };
  invariants: {
    nluStructuredOnly: boolean;
    rendererUsedForVisibleText: boolean;
    policyUsedStateAfter: boolean;
    pendingFieldsFromStateAfter: boolean;
    humanModeSuppressesAutoresponse: boolean;
  };
  timing: MaternalyAuthorityTiming;
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
  serviceQuestionFocus?: StructuredIntent["service_question_focus"];
  locationPreference?: string;
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

interface ContextualRegistrationDiagnostics {
  source: "contextual_reducer";
  phoneFromInbound: boolean;
  phoneFromMessage: boolean;
  fullNameDetected: boolean;
  emailDetected: boolean;
  peopleCountDetected: boolean;
  partnerNameDetected: boolean;
  partnerNameSkipped: boolean;
  dateMappedTo?: "babyBirthDate" | "fppOrDueDate";
  changed: boolean;
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

function elapsedSince(start: number): number {
  return Math.max(0, Date.now() - start);
}

function createTurnId(): string {
  return `maternaly_turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function redactPhone(value: string | undefined): string {
  const normalized = value?.replace(/[^\d+]/g, "") ?? "";
  if (normalized.length <= 5) {
    return normalized ? "[redacted]" : "";
  }

  return `${normalized.slice(0, 3)}...${normalized.slice(-2)}`;
}

function summarizeState(state: MaternalyNormalizedFlowState | undefined) {
  return {
    serviceKey: state?.serviceKey,
    stage: state?.stage,
    selectedSessionId: state?.selectedSessionId ? "[session-selected]" : undefined,
    selectedGroupId: state?.selectedGroupId ? "[group-selected]" : undefined,
    hasFullName: Boolean(state?.fullName),
    hasPhone: Boolean(state?.phone),
    hasEmail: Boolean(state?.email),
    peopleCount: state?.peopleCount,
    hasPartnerName: Boolean(state?.partnerName),
    hasPregnancyWeek: Boolean(state?.pregnancyWeek),
    hasFppOrDueDate: Boolean(state?.fppOrDueDate),
    hasBabyBirthDate: Boolean(state?.babyBirthDate),
    location: state?.location,
    modality: state?.modality,
    pendingFields: state?.pendingFields ?? [],
  };
}

function inferOpenAiCall(env: NodeJS.ProcessEnv | undefined): boolean {
  return (env?.LLM_PROVIDER ?? process.env.LLM_PROVIDER) === "openai" && Boolean(env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
}

export function normalizeInboundWhatsappPhone(value: string | undefined): string | undefined {
  const raw = value?.replace(/^whatsapp:/i, "").trim();
  if (!raw) {
    return undefined;
  }

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return undefined;
  }

  if (digits.startsWith("00") && digits.length > 10) {
    return `+${digits.slice(2)}`;
  }

  if (digits.length === 9 && /^[6789]/.test(digits)) {
    return `+34${digits}`;
  }

  if (digits.startsWith("34") && digits.length === 11) {
    return `+${digits}`;
  }

  if (hasPlus || digits.length >= 10) {
    return `+${digits}`;
  }

  return undefined;
}

function extractMessagePhone(message: string): string | undefined {
  const match = message.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  return normalizeInboundWhatsappPhone(match?.[0]);
}

function extractMessageEmail(message: string): string | undefined {
  return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim().toLowerCase();
}

function hasSyntheticMarker(message: string): boolean {
  return /\bprueba\b|example\.test|synthetic|test/i.test(message);
}

function normalizeDateLike(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) {
    return undefined;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  const year = iso ? Number(iso[1]) : local ? Number(local[3].length === 2 ? `20${local[3]}` : local[3]) : NaN;
  const month = iso ? Number(iso[2]) : local ? Number(local[2]) : NaN;
  const day = iso ? Number(iso[3]) : local ? Number(local[1]) : NaN;

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDateFromMessage(message: string): string | undefined {
  return normalizeDateLike(
    message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
      message.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0],
  );
}

function isFutureDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return date.getTime() > today.getTime();
}

function extractContextualFullName(message: string): string | undefined {
  const explicit = message.match(
    /\b(?:(?:soy|me llamo|nombre(?:\s+y\s+apellidos)?[:\s]+)\s*)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){1,5})/i,
  )?.[1];
  const candidateSource = explicit ?? (() => {
    const emailIndex = message.search(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneIndex = message.search(/(?:\+?\d[\d\s().-]{6,}\d)/);
    const dateIndex = message.search(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);
    const commaIndex = message.indexOf(",");
    const limits = [emailIndex, phoneIndex, dateIndex, commaIndex].filter((index) => index >= 0);
    const end = limits.length > 0 ? Math.min(...limits) : message.length;
    return message.slice(0, end);
  })();
  const candidate = candidateSource
    .replace(/^\s*(?:soy|me llamo|nombre(?:\s+y\s+apellidos)?[:\s]+)\s*/i, "")
    .trim();
  const normalized = normalize(candidate);
  if (
    !candidate ||
    /^(?:voy|vamos|somos|fecha|fpp|email|correo|tel[eé]fono|telefono|opci[oó]n|persona|pareja|naci[oó]|beb[eé]|hola)\b/.test(normalized)
  ) {
    return undefined;
  }

  const tokens = candidate.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? [];
  if (tokens.length < 2 || tokens.length > 6) {
    return undefined;
  }

  return tokens.join(" ");
}

function inferContextualPeopleCount(message: string): number | undefined {
  const text = normalize(message);
  if (/\b(?:voy|vamos)\s+en\s+pareja\b|\bsomos\s+dos\b|\b2\s*personas?\b|\bdos\s+personas?\b/.test(text)) {
    return 2;
  }

  if (/\b(?:voy|yo)\s+sol[ao]\b|\b1\s*persona\b|\buna\s+persona\b/.test(text)) {
    return 1;
  }

  return undefined;
}

function shouldCollectOptionalPartnerName(input: {
  previous?: MaternalyNormalizedFlowState;
  slots: MaternalyNluSlots;
  serviceKey?: MaternalyNormalizedServiceKey;
  peopleCount?: number;
}): boolean {
  return Boolean(
    input.serviceKey === "charla_embarazo_1_20" &&
      !input.previous?.partnerName &&
      !input.slots.partner_name &&
      (input.peopleCount ?? input.previous?.peopleCount ?? 0) > 1,
  );
}

function isPendingPartnerNameReply(message: string): boolean {
  const text = normalize(message);
  return /\b(?:no\s+lo\s+se|luego|pendiente|no\s+hace\s+falta|no\s+tengo\s+nombre|sin\s+nombre|somos\s+dos)\b/.test(text);
}

function isSessionSelectionReply(message: string, previous?: MaternalyNormalizedFlowState): boolean {
  if (previous?.stage !== "choosing_session") {
    return false;
  }

  const text = normalize(message).trim();
  return /^(?:opcion\s*)?[1-9]$/.test(text) ||
    /^(?:la\s+)?(?:primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena)$/.test(text);
}

function normalizePartnerNameCandidate(value: string | undefined): string | undefined {
  const raw = value
    ?.replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) {
    return undefined;
  }

  const tokens = raw.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? [];
  const normalized = normalize(tokens.join(" "));
  if (
    tokens.length < 1 ||
    tokens.length > 4 ||
    /^(?:hola|buenas|ok|vale|si|sí|no|gracias|perfecto|correcto|confirmo|pareja|acompanante|acompañante)$/i.test(normalized)
  ) {
    return undefined;
  }

  return tokens.join(" ");
}

function extractContextualPartnerName(message: string): string | undefined {
  const explicit =
    message.match(
      /\b(?:mi\s+)?(?:pareja|acompa[nñ]ante)\s+(?:se\s+llama|es)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,3})/i,
    )?.[1] ??
    message.match(/\bse\s+llama\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,3})/i)?.[1];
  const explicitCandidate = normalizePartnerNameCandidate(explicit);
  if (explicitCandidate) {
    return explicitCandidate;
  }

  if (message.includes(",") || extractMessageEmail(message) || extractMessagePhone(message) || extractDateFromMessage(message)) {
    return undefined;
  }

  return normalizePartnerNameCandidate(message);
}

function mergeObservations(...values: Array<string | undefined>): string | undefined {
  const parts = values
    .flatMap((value) => (value ?? "").split("|"))
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length > 0 ? Array.from(new Set(parts)).join(" | ") : undefined;
}

function extractContextualRegistrationSlots(input: {
  message: string;
  previous?: MaternalyNormalizedFlowState;
  slots: MaternalyNluSlots;
  serviceKey?: MaternalyNormalizedServiceKey;
  inboundFrom?: string;
}): {
  slots: Partial<MaternalyNormalizedFlowState>;
  diagnostics: ContextualRegistrationDiagnostics;
} {
  const inboundPhone = normalizeInboundWhatsappPhone(input.inboundFrom);
  const messagePhone = extractMessagePhone(input.message);
  const email = input.slots.email ?? extractMessageEmail(input.message);
  const peopleCount = input.slots.people_count ?? inferContextualPeopleCount(input.message);
  const collectPartnerName = shouldCollectOptionalPartnerName({
    previous: input.previous,
    slots: input.slots,
    serviceKey: input.serviceKey,
    peopleCount,
  });
  const partnerNameSkipped = collectPartnerName && isPendingPartnerNameReply(input.message);
  const partnerName = collectPartnerName && !partnerNameSkipped ? extractContextualPartnerName(input.message) : undefined;
  const collectingContact = input.previous?.stage === "collecting_contact";
  const hasContactSignal = collectingContact || Boolean(email || messagePhone || peopleCount || input.message.includes(","));
  const fullName = input.slots.full_name ?? (hasContactSignal ? extractContextualFullName(input.message) : undefined);
  const contextualDate = extractDateFromMessage(input.message);
  const syntheticContext = hasSyntheticMarker(
    [input.message, input.previous?.fullName, input.previous?.email, input.previous?.observations]
      .filter(Boolean)
      .join(" "),
  );
  const contextualSlots: Partial<MaternalyNormalizedFlowState> = {};
  const phone = inboundPhone ?? messagePhone;
  const phoneDiscrepancy =
    Boolean(inboundPhone && messagePhone && inboundPhone !== messagePhone);

  if (fullName && !input.previous?.fullName && !input.slots.full_name) {
    contextualSlots.fullName = fullName;
  }

  if (email && !input.previous?.email && !input.slots.email) {
    contextualSlots.email = email;
  }

  if (peopleCount && !input.previous?.peopleCount && !input.slots.people_count) {
    contextualSlots.peopleCount = peopleCount;
  }

  if (partnerName) {
    contextualSlots.partnerName = partnerName;
  }

  if (partnerNameSkipped) {
    contextualSlots.observations = mergeObservations(
      contextualSlots.observations,
      "acompañante pendiente",
    );
  }

  if (phone && (!input.previous?.phone || inboundPhone)) {
    contextualSlots.phone = phone;
  }

  let dateMappedTo: ContextualRegistrationDiagnostics["dateMappedTo"];
  if (contextualDate && collectingContact && input.serviceKey === "taller_blw" && !input.previous?.babyBirthDate && !input.slots.baby_birth_date) {
    if (!isFutureDate(contextualDate) || syntheticContext) {
      contextualSlots.babyBirthDate = contextualDate;
      dateMappedTo = "babyBirthDate";
    } else {
      contextualSlots.observations = mergeObservations(
        contextualSlots.observations,
        "fecha_nacimiento_bebe_futura_requiere_aclaracion",
      );
    }
  }

  if (
    contextualDate &&
    collectingContact &&
    input.serviceKey === "charla_embarazo_1_20" &&
    !input.previous?.fppOrDueDate &&
    !input.slots.fpp_or_due_date
  ) {
    contextualSlots.fppOrDueDate = contextualDate;
    dateMappedTo = "fppOrDueDate";
  }

  if (phoneDiscrepancy) {
    contextualSlots.observations = mergeObservations(
      contextualSlots.observations,
      "telefono_mensaje_difiere_de_whatsapp",
    );
  }

  const diagnostics: ContextualRegistrationDiagnostics = {
    source: "contextual_reducer",
    phoneFromInbound: Boolean(inboundPhone && (contextualSlots.phone === inboundPhone || input.previous?.phone === inboundPhone)),
    phoneFromMessage: Boolean(messagePhone),
    fullNameDetected: Boolean(fullName),
    emailDetected: Boolean(email),
    peopleCountDetected: Boolean(peopleCount),
    partnerNameDetected: Boolean(partnerName),
    partnerNameSkipped,
    dateMappedTo,
    changed: Object.keys(contextualSlots).length > 0,
  };

  return { slots: contextualSlots, diagnostics };
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

function hasRegistrationDataSlots(slots: MaternalyNluSlots): boolean {
  return Boolean(
    slots.full_name ||
      slots.phone ||
      slots.email ||
      slots.people_count ||
      slots.partner_name ||
      slots.pregnancy_week ||
      slots.fpp_or_due_date ||
      slots.baby_birth_date ||
      slots.selected_session_id ||
      slots.selected_group_id,
  );
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
    state.serviceKey === "charla_embarazo_1_20" && state.peopleCount && state.peopleCount > 1 && !state.partnerName
      ? "Acompañante: pendiente/no indicado"
      : "",
    state.location ? `Sede/modalidad preferida: ${state.location}` : "",
  ].filter(Boolean).join(" | ");
}

export class MaternalyStateReducer {
  reduce(input: {
    conversation: ConversationRecord;
    intent: StructuredIntent;
    message: string;
    inbound?: MaternalyNormalizedInbound;
  }): MaternalyConversationState {
    return this.reduceWithDiagnostics(input).state;
  }

  reduceWithDiagnostics(input: {
    conversation: ConversationRecord;
    intent: StructuredIntent;
    message: string;
    inbound?: MaternalyNormalizedInbound;
  }): { state: MaternalyConversationState; diagnostics: ContextualRegistrationDiagnostics } {
    const previous = input.conversation.maternalyNormalizedFlow;
    const slots = input.intent.slots;
    const registrationSlots = isSessionSelectionReply(input.message, previous)
      ? { ...slots, people_count: undefined }
      : slots;
    const serviceKey = serviceKeyFromSlots(slots, previous);
    const contextual = extractContextualRegistrationSlots({
      message: input.message,
      previous,
      slots: registrationSlots,
      serviceKey,
      inboundFrom: input.inbound?.from,
    });
    const observations = mergeObservations(
      previous?.observations,
      slots.observations,
      contextual.slots.observations,
    );

    const state = {
      ...(previous ?? { updatedAt: nowIso() }),
      ...definedEntries({
        serviceKey,
        fullName: registrationSlots.full_name ?? contextual.slots.fullName ?? previous?.fullName,
        phone: contextual.slots.phone ?? registrationSlots.phone ?? previous?.phone,
        email: registrationSlots.email ?? contextual.slots.email ?? previous?.email,
        peopleCount: contextual.slots.peopleCount ?? registrationSlots.people_count ?? previous?.peopleCount,
        partnerName: registrationSlots.partner_name ?? contextual.slots.partnerName ?? previous?.partnerName,
        pregnancyWeek: registrationSlots.pregnancy_week ?? previous?.pregnancyWeek,
        fppOrDueDate: registrationSlots.fpp_or_due_date ?? contextual.slots.fppOrDueDate ?? previous?.fppOrDueDate,
        babyBirthDate: registrationSlots.baby_birth_date ?? contextual.slots.babyBirthDate ?? previous?.babyBirthDate,
        selectedSessionId: registrationSlots.selected_session_id ?? previous?.selectedSessionId,
        selectedGroupId: registrationSlots.selected_group_id ?? previous?.selectedGroupId,
        location: registrationSlots.location ?? previous?.location,
        modality: registrationSlots.modality ?? previous?.modality,
        observations,
      }),
      mode: input.conversation.mode,
      updatedAt: nowIso(),
    };

    return { state, diagnostics: contextual.diagnostics };
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
          : intent.safety_flags.includes("clinical_or_diagnostic_escalation")
            ? "clinical_safety_requires_professional"
            : "user_or_safety_handoff";
      return {
        action: "handoff",
        reason,
        serviceQuestionFocus: intent.service_question_focus,
        locationPreference: intent.location_preference,
      };
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

    const service = getKnowledgeService(intent.service_candidate);
    if (
      service &&
      !intent.needs_availability_lookup &&
      !hasRegistrationDataSlots(intent.slots) &&
      ["general_info", "service_question"].includes(intent.intent)
    ) {
      return {
        action: "service_info",
        service,
        reason: "faq_escape_hatch",
        serviceQuestionFocus: intent.service_question_focus,
        locationPreference: intent.location_preference,
      };
    }

    if (state.serviceKey) {
      return {
        action: "normalized_registration",
        serviceKey: state.serviceKey,
        service: getKnowledgeServiceByNormalizedKey(state.serviceKey),
      };
    }

    if (service?.normalizedServiceKey) {
      return {
        action: "normalized_registration",
        serviceKey: service.normalizedServiceKey,
        service,
      };
    }

    if (service) {
      return {
        action: "service_info",
        service,
        serviceQuestionFocus: intent.service_question_focus,
        locationPreference: intent.location_preference,
      };
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

    let writeSnapshot: NormalizedServiceSheetSnapshot;
    try {
      writeSnapshot = await readNormalizedServiceSheet(input.serviceKey, this.client, env);
    } catch (error) {
      return {
        status: "read_error",
        serviceKey: input.serviceKey,
        snapshot,
        sessions,
        selectedSession,
        missingFields: [],
        availability,
        error: error instanceof Error ? error.message : "sheet_read_failed",
      };
    }

    const plan = buildRegistrationWritePlan({
      snapshot: writeSnapshot,
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
    const writeResult = await applyRegistrationWritePlan({ snapshot: writeSnapshot, client: this.client, plan });

    return {
      status: "write_result",
      serviceKey: input.serviceKey,
      snapshot: writeSnapshot,
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
    criticalTabsOk: availability?.diagnostics.criticalTabsOk,
    nonCriticalParseErrorsCount: availability?.diagnostics.nonCriticalParseErrorsCount,
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
    const turnStartedAt = Date.now();
    const turnId = createTurnId();
    const stateBefore = input.conversation.maternalyNormalizedFlow;
    const openaiCallExpected = inferOpenAiCall(input.env);
    const nluStartedAt = Date.now();
    const intent = await this.interpreter.interpret(input.inbound.text);
    const nluTotalMs = elapsedSince(nluStartedAt);
    const reducerStartedAt = Date.now();
    const reduced = this.reducer.reduceWithDiagnostics({
      conversation: input.conversation,
      intent,
      message: input.inbound.text,
      inbound: input.inbound,
    });
    const reducerMs = elapsedSince(reducerStartedAt);
    const state = reduced.state;
    const policyStartedAt = Date.now();
    const decision = this.policy.decide({
      conversation: input.conversation,
      intent,
      state,
    });
    const policyMs = elapsedSince(policyStartedAt);
    const events: MaternalyCoreResult["events"] = [
      {
        eventType: "maternaly_nlu_interpreted",
        payload: {
          turnId,
          intent: intent.intent,
          serviceCandidate: intent.service_candidate,
          serviceQuestionFocus: intent.service_question_focus,
          locationPreference: intent.location_preference,
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
          turnId,
          botDomain: "maternaly",
          source: "maternaly_core_policy_copy",
          intent: intent.intent,
          serviceCandidate: intent.service_candidate,
          serviceQuestionFocus: intent.service_question_focus,
          locationPreference: intent.location_preference,
          needsAvailabilityLookup: intent.needs_availability_lookup,
          shouldHandoff: intent.should_handoff,
          safetyFlags: intent.safety_flags,
        },
      },
      {
        eventType: "maternaly_policy_decision",
        payload: {
          turnId,
          action: decision.action,
          reason: decision.reason,
          serviceKey: decision.serviceKey ?? state.serviceKey,
          serviceQuestionFocus: decision.serviceQuestionFocus,
        },
      },
    ];

    let toolResult: NormalizedToolResult | undefined;
    let toolsMs = 0;
    let nextState: MaternalyNormalizedFlowState | undefined =
      decision.action === "reset"
        ? undefined
        : {
            ...toPersistedState(state),
            stage:
              decision.action === "handoff"
                ? "handoff"
                : decision.action === "normalized_registration" && state.serviceKey
                  ? "choosing_session"
                  : state.stage,
            pendingFields: [],
            updatedAt: nowIso(),
          };

    if (decision.action === "normalized_registration" && (decision.serviceKey ?? state.serviceKey)) {
      const serviceKey = (decision.serviceKey ?? state.serviceKey) as MaternalyNormalizedServiceKey;
      const toolsStartedAt = Date.now();
      toolResult = await this.toolExecutor.runNormalizedRegistration({
        serviceKey,
        state: { ...state, serviceKey },
        message: input.inbound.text,
        env: input.env,
      });
      toolsMs = elapsedSince(toolsStartedAt);
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
        pendingFields: toolResult.missingFields,
        idempotencyKey: toolResult.plan?.idempotencyKey ?? state.idempotencyKey,
        updatedAt: nowIso(),
      };
      if (reduced.diagnostics.changed || reduced.diagnostics.phoneFromInbound || reduced.diagnostics.phoneFromMessage) {
        events.push({
          eventType: "maternaly_registration_slots_enriched",
          payload: definedEntries({
            source: reduced.diagnostics.source,
            phoneFromInbound: reduced.diagnostics.phoneFromInbound,
            phoneFromMessage: reduced.diagnostics.phoneFromMessage,
            fullNameDetected: reduced.diagnostics.fullNameDetected,
            emailDetected: reduced.diagnostics.emailDetected,
            peopleCountDetected: reduced.diagnostics.peopleCountDetected,
            partnerNameDetected: reduced.diagnostics.partnerNameDetected,
            partnerNameSkipped: reduced.diagnostics.partnerNameSkipped,
            dateMappedTo: reduced.diagnostics.dateMappedTo,
            missingFieldsAfter: toolResult.missingFields,
          }),
        });
      }
      if (
        serviceKey === "charla_embarazo_1_20" &&
        toolResult.status === "write_result" &&
        (state.peopleCount ?? 0) > 1 &&
        !state.partnerName
      ) {
        events.push({
          eventType: "maternaly_registration_soft_field_skipped",
          payload: {
            serviceKey,
            field: "partnerName",
            reason: "optional_not_blocking",
          },
        });
      }
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
            criticalTabsOk: toolResult.availability?.diagnostics.criticalTabsOk,
            nonCriticalParseErrorsCount: toolResult.availability?.diagnostics.nonCriticalParseErrorsCount,
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
          formattedRanges: toolResult.writeResult?.formattedRanges,
          formatApplied: toolResult.writeResult?.formatApplied,
          formatWarnings: toolResult.writeResult?.formatWarnings,
        },
      });
    }

    const rendererStartedAt = Date.now();
    const reply = this.renderer.render({ decision, state: nextState, toolResult });
    const rendererMs = elapsedSince(rendererStartedAt);
    const renderedMessage: MaternalyRenderedMessage | undefined = reply
      ? {
          kind: "text",
          text: reply,
          source: "copy_renderer",
          renderer: "MaternalyCopyRenderer",
        }
      : undefined;
    const service = serviceFromDecision(decision, nextState);
    const needsHuman =
      decision.action === "handoff" ||
      (toolResult?.status === "write_result" && Boolean(toolResult.plan?.blocked || !toolResult.writeResult?.ok));
    const clinicalHandoff =
      decision.reason === "clinical_safety_requires_professional" ||
      intent.service_question_focus === "clinical_risk";
    if (needsHuman) {
      if (clinicalHandoff) {
        events.push({
          eventType: "maternaly_clinical_safety_handoff",
          payload: {
            reason: decision.reason ?? "clinical_safety_requires_professional",
            serviceCandidate: intent.service_candidate,
            safetyFlags: intent.safety_flags,
            mode: "human",
            requiresManualReview: true,
          },
        });
      }
      events.push({
        eventType: "maternaly_handoff_required",
        payload: {
          reason: decision.reason ?? toolResult?.writeResult?.blockedReason ?? "manual_review_required",
          serviceKey: decision.serviceKey ?? state.serviceKey,
          clinical: clinicalHandoff,
          blockedReasons: toolResult?.plan?.blockedReasons,
          readError: safeInternalError(toolResult?.error),
        },
      });
      events.push({
        eventType: "human_requested",
        payload: {
          matchedFrom: "maternaly_core_policy_copy",
          reason: decision.reason ?? toolResult?.writeResult?.blockedReason,
          clinical: clinicalHandoff,
        },
      });
    }

    const pendingFieldsFromStateAfter =
      !toolResult ||
      JSON.stringify(nextState?.pendingFields ?? []) === JSON.stringify(toolResult.missingFields);
    const invariants = {
      nluStructuredOnly: true,
      rendererUsedForVisibleText: Boolean(!reply || renderedMessage?.source === "copy_renderer"),
      policyUsedStateAfter: true,
      pendingFieldsFromStateAfter,
      humanModeSuppressesAutoresponse:
        input.conversation.mode !== "human" || decision.action === "reset" || !renderedMessage,
    };
    const timing: MaternalyAuthorityTiming = {
      totalDurationMs: elapsedSince(turnStartedAt),
      nluTotalMs,
      reducerMs,
      policyMs,
      toolsMs,
      rendererMs,
      outboxMs: 0,
      persistenceMs: 0,
      eventLogMs: 0,
      openaiCalls: openaiCallExpected ? 1 : 0,
      usedDeterministicFastPath: !openaiCallExpected,
      usedFallback: false,
    };
    const authorityTrace: MaternalyAuthorityTurnTrace = {
      turnId,
      pipeline: [
        "normalized_inbound",
        "nlu_structured",
        "state_reducer",
        "policy",
        ...(decision.action === "normalized_registration" ? (["tool_executor"] as const) : []),
        "copy_renderer",
        "outbox",
      ],
      inbound: {
        provider: input.inbound.provider,
        textLength: input.inbound.text.length,
        fromRedacted: redactPhone(input.inbound.from),
      },
      intent: {
        intent: intent.intent,
        serviceCandidate: intent.service_candidate,
        serviceQuestionFocus: intent.service_question_focus,
        locationPreference: intent.location_preference,
        shouldHandoff: intent.should_handoff,
        safetyFlags: intent.safety_flags,
      },
      stateBefore: summarizeState(stateBefore),
      stateAfter: nextState ? summarizeState(nextState) : null,
      policy: {
        action: decision.action,
        reason: decision.reason,
        serviceKey: decision.serviceKey ?? state.serviceKey,
      },
      tool: toolResult
        ? {
            status: toolResult.status,
            serviceKey: toolResult.serviceKey,
            missingFields: toolResult.missingFields,
            applied: toolResult.writeResult?.applied,
            mode: toolResult.writeResult?.mode,
          }
        : undefined,
      renderer: {
        source: "MaternalyCopyRenderer",
        visibleReply: Boolean(renderedMessage),
        action: decision.action,
      },
      outbox: {
        planned: Boolean(renderedMessage),
        kind: renderedMessage ? "twiml" : "none",
      },
      invariants,
      timing,
    };
    events.push({
      eventType: "maternaly_authority_timing_completed",
      payload: {
        turnId,
        ...timing,
      },
    });
    events.push({
      eventType: "maternaly_authority_turn_completed",
      payload: authorityTrace,
    });

    return {
      handled: true,
      reply,
      renderedMessage,
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
        priority: clinicalHandoff ? "urgent" : input.conversation.priority,
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
      authorityTrace,
    };
  }
}
