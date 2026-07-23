import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import {
  MaternalyCopyRenderer,
  ensureDistinctMaternalyReply,
} from "@/lib/maternaly/conversation/copy-renderer";
import type { MaternalyRenderedMessage } from "@/lib/maternaly/conversation/outbox";
import {
  findKnowledgeService,
  getKnowledgeService,
  getKnowledgeServiceByNormalizedKey,
  getKnowledgeServicesByModality,
  type KnowledgeService,
} from "@/lib/maternaly/knowledge/catalog";
import {
  isMaternalyResetRequest,
  MaternalyConversationInterpreter,
  type MaternalyInterpretationContext,
  type MaternalyNluSlots,
  type StructuredIntent,
} from "@/lib/maternaly/llm/interpreter";
import {
  GoogleNormalizedSheetsClient,
  type NormalizedSheetsClient,
  type NormalizedServiceSheetSnapshot,
} from "@/lib/maternaly/sheets/normalized-client";
import { type NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";
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
    serviceScope: StructuredIntent["service_scope"];
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
    mode: "generated" | "fallback" | "skipped" | "none";
    reason?: string;
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
  | "booking_declined"
  | "booking_service_selection"
  | "normalized_registration"
  | "catalog_info"
  | "service_info"
  | "greeting"
  | "general";

interface PolicyDecision {
  action: PolicyAction;
  serviceKey?: MaternalyNormalizedServiceKey;
  service?: KnowledgeService | null;
  serviceQuestionFocus?: StructuredIntent["service_question_focus"];
  locationPreference?: string;
  modalityPreference?: "presencial" | "online";
  journeyStage?: MaternalyNluSlots["journey_stage"];
  reason?: string;
}

interface NormalizedToolResult {
  status:
    | "not_configured"
    | "read_error"
    | "sessions_available"
    | "collecting_fields"
    | "manual_validation_required"
    | "write_result";
  serviceKey: MaternalyNormalizedServiceKey;
  snapshot?: NormalizedServiceSheetSnapshot;
  sessions: NormalizedAvailableSession[];
  calendarSessions?: NormalizedAvailableSession[];
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
    journeyStage: state?.journeyStage,
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
    hasPregnancyMonth: Boolean(state?.pregnancyMonth),
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
  const numericDate = normalizeDateLike(
    message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
      message.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0],
  );
  if (numericDate) {
    return numericDate;
  }

  const text = normalize(message);
  const textualDate = text.match(
    /\b(\d{1,2})\s*(?:de\s+)?(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)(?:\s*(?:de\s+)?(\d{4}))?\b/,
  );
  if (!textualDate) {
    return undefined;
  }

  const monthByPrefix: Record<string, number> = {
    ene: 1,
    feb: 2,
    mar: 3,
    abr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    sep: 9,
    set: 9,
    oct: 10,
    nov: 11,
    dic: 12,
  };
  const day = Number(textualDate[1]);
  const month = monthByPrefix[textualDate[2].slice(0, 3)];
  const now = new Date();
  let year = textualDate[3] ? Number(textualDate[3]) : now.getUTCFullYear();
  let candidate = normalizeDateLike(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
  if (!candidate) {
    return undefined;
  }

  if (!textualDate[3]) {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const candidateDate = new Date(`${candidate}T00:00:00.000Z`);
    if (candidateDate.getTime() < today.getTime()) {
      year += 1;
      candidate = normalizeDateLike(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      );
    }
  }

  return candidate;
}

function isFutureDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return date.getTime() > today.getTime();
}

function extractPersonSegmentAfterPrefix(message: string, prefix: RegExp): string | undefined {
  const prefixMatch = prefix.exec(message);
  if (!prefixMatch || prefixMatch.index === undefined) {
    return undefined;
  }

  const remainder = message.slice(prefixMatch.index + prefixMatch[0].length).trim();
  const boundaryPatterns = [
    /[,;.!?]/,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:\+?\d[\d\s().-]{6,}\d)/,
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    /\s+(?:y\s+)?(?:mi\s+)?(?:email|correo|tel[eé]fono|telefono|fecha|fpp)\b/i,
    /\s+y\s+(?:mi\s+)?(?:pareja|acompa[nñ]ante)\b/i,
    /\s+y\s+(?:voy|vengo|vamos|somos|estoy|tengo|quiero|necesito|prefiero)\b/i,
  ];
  const boundaries = boundaryPatterns
    .map((pattern) => remainder.search(pattern))
    .filter((index) => index >= 0);
  const end = boundaries.length > 0 ? Math.min(...boundaries) : remainder.length;
  return remainder.slice(0, end).trim() || undefined;
}

function normalizeFullNameCandidate(
  value: string | undefined,
  options: { requireCapitalized?: boolean } = {},
): string | undefined {
  const candidate = value
    ?.replace(/[.,;:!?]+$/g, "")
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!candidate) {
    return undefined;
  }

  const normalized = normalize(candidate);
  const tokens = candidate.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? [];
  const nonNameTokens = new Set([
    "ahora",
    "bien",
    "buenas",
    "buenos",
    "claro",
    "como",
    "cuando",
    "correo",
    "dias",
    "entiendo",
    "email",
    "estoy",
    "gracias",
    "hola",
    "informacion",
    "me",
    "mi",
    "necesito",
    "no",
    "perfecto",
    "por",
    "quiero",
    "si",
    "sola",
    "solo",
    "sobre",
    "telefono",
    "tengo",
    "vale",
    "vengo",
    "voy",
    "y",
  ]);
  const nameParticles = new Set(["de", "del", "la", "las", "los"]);
  const normalizedTokens = tokens.map((token) => normalize(token));
  const hasValidParticles = normalizedTokens.every(
    (token, index) =>
      !nameParticles.has(token) || (index > 0 && index < normalizedTokens.length - 1),
  );
  const hasStrongBareNameShape =
    !options.requireCapitalized ||
    (tokens.length <= 4 &&
      tokens.every(
        (token, index) =>
          nameParticles.has(normalizedTokens[index]) ||
          /^[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*$/.test(token),
      ));
  if (
    tokens.length < 2 ||
    tokens.length > 6 ||
    normalizedTokens.some((token) => nonNameTokens.has(token)) ||
    !hasValidParticles ||
    !hasStrongBareNameShape ||
    !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){1,5}$/.test(candidate) ||
    /\b(?:embarazad[ao]|gestacion|semanas?|mes(?:es)?|por cierto)\b/.test(normalized)
  ) {
    return undefined;
  }

  return tokens.join(" ");
}

function extractContextualFullName(
  message: string,
  options: { allowBareName: boolean },
): string | undefined {
  const explicit = extractPersonSegmentAfterPrefix(
    message,
    /\b(?:soy|me\s+llamo|mi\s+nombre\s+es|nombre(?:\s+y\s+apellidos)?)\s*:?\s+/i,
  );
  const explicitCandidate = normalizeFullNameCandidate(explicit);
  if (explicitCandidate) {
    return explicitCandidate;
  }

  if (!options.allowBareName) {
    return undefined;
  }

  const candidateSource = (() => {
    const emailIndex = message.search(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneIndex = message.search(/(?:\+?\d[\d\s().-]{6,}\d)/);
    const dateIndex = message.search(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);
    const commaIndex = message.indexOf(",");
    const limits = [emailIndex, phoneIndex, dateIndex, commaIndex].filter((index) => index >= 0);
    const end = limits.length > 0 ? Math.min(...limits) : message.length;
    return message.slice(0, end);
  })();
  const candidate = candidateSource
    .replace(/^\s*(?:soy|me llamo|mi nombre es|nombre(?:\s+y\s+apellidos)?[:\s]+)\s*/i, "")
    .trim();
  return normalizeFullNameCandidate(candidate, { requireCapitalized: true });
}

function inferContextualPeopleCount(message: string): number | undefined {
  const text = normalize(message);
  if (
    /\b(?:voy|vengo|vamos)\s+en\s+pareja\b|\b(?:yo\s+y\s+mi\s+pareja|mi\s+pareja\s+y\s+yo)\b|\bsomos\s+dos\b|\b2\s*personas?\b|\bdos\s+personas?\b/.test(
      text,
    )
  ) {
    return 2;
  }

  if (/\b(?:voy|vengo|yo)\s+sol[ao]\b|\b1\s*persona\b|\buna\s+persona\b/.test(text)) {
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
  if (inferContextualPeopleCount(message)) {
    return false;
  }
  return /\bopcion\s*[1-9]\b/.test(text) ||
    /\b(?:bilbao|erandio|online)\b/.test(text) ||
    /\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(text) ||
    /^(?:opcion\s*)?[1-9]$/.test(text) ||
    /^(?:la\s+)?(?:primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena)$/.test(text);
}

function normalizePartnerNameCandidate(
  value: string | undefined,
  options: { requireCapitalized?: boolean } = {},
): string | undefined {
  const raw = value
    ?.replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) {
    return undefined;
  }

  const tokens = raw.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) ?? [];
  const normalizedTokens = tokens.map((token) => normalize(token));
  const nameParticles = new Set(["de", "del", "la", "las", "los"]);
  const forbiddenTokens = new Set([
    "acompanante",
    "algo",
    "cuentame",
    "en",
    "estoy",
    "gracias",
    "mi",
    "no",
    "pareja",
    "sabe",
    "se",
    "si",
    "somos",
    "todavia",
    "vengo",
    "viene",
    "voy",
    "y",
  ]);
  const hasStrongBareNameShape =
    !options.requireCapitalized ||
    tokens.every(
      (token, index) =>
        nameParticles.has(normalizedTokens[index]) ||
        /^[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*$/.test(token),
    );
  if (
    tokens.length < 1 ||
    tokens.length > 4 ||
    normalizedTokens.some((token) => forbiddenTokens.has(token)) ||
    !hasStrongBareNameShape ||
    !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '\-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,3}$/.test(raw)
  ) {
    return undefined;
  }

  return tokens.join(" ");
}

function extractContextualPartnerName(message: string): string | undefined {
  const explicit = extractPersonSegmentAfterPrefix(
    message,
    /\b(?:(?:mi\s+)?(?:pareja|acompa[nñ]ante)(?:\s+(?:se\s+llama|es))?\s*:?|se\s+llama)\s+/i,
  );
  const explicitCandidate = normalizePartnerNameCandidate(explicit);
  if (explicitCandidate) {
    return explicitCandidate;
  }

  if (message.includes(",") || extractMessageEmail(message) || extractMessagePhone(message) || extractDateFromMessage(message)) {
    return undefined;
  }

  return normalizePartnerNameCandidate(message, { requireCapitalized: true });
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
  allowRegistrationData: boolean;
}): {
  slots: Partial<MaternalyNormalizedFlowState>;
  diagnostics: ContextualRegistrationDiagnostics;
} {
  const inboundPhone = input.allowRegistrationData
    ? normalizeInboundWhatsappPhone(input.inboundFrom)
    : undefined;
  const messagePhone = input.allowRegistrationData ? extractMessagePhone(input.message) : undefined;
  const email = input.allowRegistrationData
    ? input.slots.email ?? extractMessageEmail(input.message)
    : undefined;
  const peopleCount = input.allowRegistrationData
    ? input.slots.people_count ?? inferContextualPeopleCount(input.message)
    : undefined;
  const collectPartnerName = input.allowRegistrationData && shouldCollectOptionalPartnerName({
    previous: input.previous,
    slots: input.slots,
    serviceKey: input.serviceKey,
    peopleCount,
  });
  const partnerNameSkipped = collectPartnerName && isPendingPartnerNameReply(input.message);
  const partnerName = collectPartnerName && !partnerNameSkipped ? extractContextualPartnerName(input.message) : undefined;
  const collectingContact = input.allowRegistrationData && input.previous?.stage === "collecting_contact";
  const expectsBareFullName = Boolean(
    collectingContact &&
      !input.previous?.fullName &&
      (input.previous?.pendingFields?.includes("fullName") ?? true),
  );
  const contextualFullName = input.allowRegistrationData
    ? extractContextualFullName(input.message, { allowBareName: expectsBareFullName })
    : undefined;
  const hasContactSignal =
    input.allowRegistrationData &&
    Boolean(email || messagePhone || peopleCount || contextualFullName);
  const fullName = hasContactSignal ? contextualFullName : undefined;
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

  if (fullName && !input.previous?.fullName) {
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

const REGISTRATION_REQUEST_INTENTS = new Set<StructuredIntent["intent"]>([
  "availability_request",
  "registration_start",
  "registration_slot_selected",
  "registration_confirm",
]);

function isRegistrationRequestTurn(intent: StructuredIntent): boolean {
  return intent.needs_availability_lookup || REGISTRATION_REQUEST_INTENTS.has(intent.intent);
}

function isRegistrationDataStage(stage: MaternalyNormalizedFlowState["stage"]): boolean {
  return stage === "collecting_contact" || stage === "write_planned";
}

function isActiveRegistrationStage(stage: MaternalyNormalizedFlowState["stage"]): boolean {
  return (
    stage === "choosing_session" ||
    stage === "collecting_contact" ||
    stage === "write_planned" ||
    stage === "blocked"
  );
}

function shouldReplaceServiceFlow(
  previous: MaternalyNormalizedFlowState | undefined,
  intent: StructuredIntent,
): boolean {
  if (
    !previous?.serviceKey ||
    intent.service_scope !== "explicit"
  ) {
    return false;
  }

  const explicitService = getKnowledgeService(
    intent.service_candidate ?? intent.slots.service_id ?? intent.slots.normalized_service_key,
  );
  const previousService = getKnowledgeServiceByNormalizedKey(previous.serviceKey);
  const changesService = Boolean(explicitService && explicitService.id !== previousService?.id);
  return changesService && (
    isRegistrationRequestTurn(intent) || !isActiveRegistrationStage(previous.stage)
  );
}

function stateBaseAfterServiceSwitch(
  previous: MaternalyNormalizedFlowState | undefined,
  intent: StructuredIntent,
): MaternalyNormalizedFlowState | undefined {
  if (!shouldReplaceServiceFlow(previous, intent)) {
    return previous;
  }

  if (!previous || !isRegistrationRequestTurn(intent)) {
    return undefined;
  }

  // Starting a transaction for a different service keeps reusable contact
  // data, but discards the old service's session, group, clinical/service
  // fields, observations, pending fields and idempotency context.
  return {
    journeyStage: previous.journeyStage,
    pregnancyWeek: previous.pregnancyWeek,
    pregnancyMonth: previous.pregnancyMonth,
    fullName: previous.fullName,
    phone: previous.phone,
    email: previous.email,
    peopleCount: previous.peopleCount,
    updatedAt: nowIso(),
  };
}

function registrationSlotsForTurn(
  intent: StructuredIntent,
  previous?: MaternalyNormalizedFlowState,
  message = "",
): MaternalyNluSlots {
  const slots = intent.slots;
  const serviceKey = slots.normalized_service_key ?? previous?.serviceKey;
  const acceptsRegistrationData =
    isRegistrationRequestTurn(intent) || isRegistrationDataStage(previous?.stage);

  if (!acceptsRegistrationData) {
    const normalizedMessage = normalize(message);
    const preservesExplicitPreference =
      Boolean(slots.location || slots.modality) &&
      !/[?¿]/.test(message) &&
      (
        /\b(?:prefiero|elijo|escojo|me\s+quedo\s+con|me\s+viene\s+mejor)\b/.test(
          normalizedMessage,
        ) ||
        /\b(?:quiero|quisiera)\s+(?:(?:la|el|en)\s+)?(?:online|presencial|bilbao|erandio)\b/.test(
          normalizedMessage,
        ) ||
        /\b(?:cuentame|informacion)\b[^.!?]{0,100}\b(?:online|presencial|bilbao|erandio)\b/.test(
          normalizedMessage,
        )
      );
    return {
      service_id: slots.service_id,
      service_name: slots.service_name,
      normalized_service_key: slots.normalized_service_key,
      location: preservesExplicitPreference ? slots.location : undefined,
      modality: preservesExplicitPreference ? slots.modality : undefined,
      preferred_date: slots.preferred_date,
      preferred_time: slots.preferred_time,
    };
  }

  return {
    ...slots,
    pregnancy_week: serviceKey === "charla_embarazo_1_20" ? slots.pregnancy_week : undefined,
    fpp_or_due_date: serviceKey === "charla_embarazo_1_20" ? slots.fpp_or_due_date : undefined,
    baby_birth_date: serviceKey === "taller_blw" ? slots.baby_birth_date : undefined,
  };
}

function registrationFieldChanged(
  before: MaternalyNormalizedFlowState,
  after: MaternalyConversationState,
  field: keyof MaternalyNormalizedFlowState,
): boolean {
  return JSON.stringify(before[field]) !== JSON.stringify(after[field]);
}

function hasRelevantRegistrationDataChange(
  before: MaternalyNormalizedFlowState | undefined,
  after: MaternalyConversationState,
): boolean {
  if (!before || !isRegistrationDataStage(before.stage)) {
    return false;
  }

  const commonFields: Array<keyof MaternalyNormalizedFlowState> = [
    "fullName",
    "phone",
    "email",
    "peopleCount",
    "observations",
    "location",
    "modality",
  ];
  const serviceFields: Array<keyof MaternalyNormalizedFlowState> =
    before.serviceKey === "charla_embarazo_1_20"
      ? ["partnerName", "pregnancyWeek", "fppOrDueDate"]
      : before.serviceKey === "taller_blw"
        ? ["babyBirthDate"]
        : [];

  return [...commonFields, ...serviceFields].some((field) =>
    registrationFieldChanged(before, after, field),
  );
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

function serviceFromConversationContext(conversation: ConversationRecord): KnowledgeService | null {
  const normalizedFlowService = getKnowledgeServiceByNormalizedKey(
    conversation.maternalyNormalizedFlow?.serviceKey,
  );
  const detectedTopic = findKnowledgeService(conversation.serviceDetected ?? "");

  // A collecting_service state is itself the current informational topic
  // (including a catalog result). During an active registration, however, a
  // newer detected service can be an intentional informational detour while
  // the transactional state remains safely parked in the background.
  if (conversation.maternalyNormalizedFlow?.stage === "collecting_service") {
    return normalizedFlowService ?? detectedTopic ?? null;
  }

  return detectedTopic ?? normalizedFlowService ?? null;
}

function redactConversationContextText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, "[telefono]")
    .slice(0, 500);
}

function redactGroundedCopyContextText(value: string): string {
  const text = normalize(value);

  // The stylistic OpenAI call never receives free-form conversation text. It
  // only receives this small allow-list of semantic categories; the NLU and
  // deterministic policy have already resolved the actual meaning upstream.
  if (/\b(?:hola|buenos dias|buenas tardes|buenas noches)\b/.test(text)) {
    return "[saludo]";
  }
  if (/\b(?:gracias|muchas gracias|perfecto|vale)\b/.test(text)) {
    return "[agradecimiento o asentimiento]";
  }
  if (/\b(?:reservar|apuntar|inscribir|plaza|disponibilidad|fecha|horario)\b/.test(text)) {
    return "[consulta transaccional]";
  }
  if (/\b(?:diabetes|dolor|sintoma|diagnostico|gestacional|medicacion|tratamiento|urgencias?)\b/.test(text)) {
    return "[contexto clinico omitido]";
  }
  if (/\b(?:embarazo|embarazada|gestacion|semanas?|mes(?:es)?)\b/.test(text)) {
    return "[contexto de etapa vital compartido]";
  }
  if (/\b(?:precio|cuanto|contenido|taller|servicio|online|presencial)\b/.test(text)) {
    return "[consulta informativa]";
  }

  return "[turno conversacional omitido por privacidad]";
}

function buildGroundedCopyTurns(conversation: ConversationRecord) {
  return messagesAfterLatestReset(conversation)
    .filter((message) => message.senderType !== "system" && message.body.trim())
    .slice(-6)
    .map((message) => ({
      role: message.senderType === "user" ? ("user" as const) : ("assistant" as const),
      text: redactGroundedCopyContextText(message.body),
    }));
}

function buildInterpretationContext(
  conversation: ConversationRecord,
): MaternalyInterpretationContext {
  const service = serviceFromConversationContext(conversation);
  const state = conversation.maternalyNormalizedFlow;
  const contextualMessages = messagesAfterLatestReset(conversation);

  return {
    active_service_id: service?.id,
    active_service_name: service?.name,
    active_normalized_service_key: service?.normalizedServiceKey ?? state?.serviceKey,
    active_stage: state?.stage,
    pending_fields: state?.pendingFields ?? [],
    journey_stage: state?.journeyStage,
    location: state?.location,
    modality: state?.modality,
    recent_messages: contextualMessages
      .filter((message) => message.senderType !== "system" && message.body.trim())
      .slice(-6)
      .map((message) => ({
        role: message.senderType === "user" ? ("user" as const) : ("assistant" as const),
        text: redactConversationContextText(message.body),
      })),
  };
}

function messagesAfterLatestReset(conversation: ConversationRecord): ConversationRecord["messages"] {
  const resetIndex = conversation.messages.findLastIndex(
    (message) =>
      message.senderType === "user" && isMaternalyResetRequest(message.body),
  );
  return resetIndex >= 0 ? conversation.messages.slice(resetIndex + 1) : conversation.messages;
}

function isContextualServiceFollowUp(message: string): boolean {
  const normalized = normalize(message).trim();
  return (
    /^(?:si|vale|ok|perfecto|genial|bien)?[,\s]*(?:cuentame|dime|explicame)(?:\s+mas)?[.!?]*$/.test(
      normalized,
    ) ||
    /\b(?:precio|precios|tarifa|tarifas|que vale|cuanto sale|coste|horarios?|fechas?|plazas?|disponibilidad|dias|cuando es|proxima|proximo|cuanto dura|duracion|cuantas horas|que incluye|que se ve|de que va|contenidos?|temas?|para quien|es para mi|puedo ir|requisitos?|beneficios?|donde|sede|bilbao|erandio|online)\b/.test(
      normalized,
    ) ||
    /\b(?:reservar|apuntar(?:me)?|inscribir(?:me)?|quiero ir|quiero asistir|me interesa reservar|guardame (?:una )?plaza)\b/.test(
      normalized,
    )
  );
}

function shouldUsePreviousServiceForContextualQuestion(
  intent: StructuredIntent,
  message: string,
): boolean {
  if (
    intent.intent === "service_discovery" ||
    intent.service_scope === "catalog" ||
    intent.service_candidate ||
    intent.slots.service_id ||
    intent.slots.normalized_service_key
  ) {
    return false;
  }

  const contextualQuestion =
    !intent.needs_availability_lookup &&
    !hasRegistrationDataSlots(intent.slots) &&
    ["general_info", "service_question"].includes(intent.intent) &&
    (intent.service_question_focus !== "unknown" ||
      Boolean(intent.slots.pregnancy_month || intent.slots.pregnancy_week) ||
      isContextualServiceFollowUp(message));
  const contextualTransaction =
    ["availability_request", "registration_start"].includes(intent.intent) &&
    isContextualServiceFollowUp(message);

  return contextualQuestion || contextualTransaction;
}

function enrichIntentWithConversationServiceContext(
  intent: StructuredIntent,
  conversation: ConversationRecord,
  message: string,
): StructuredIntent {
  if (!shouldUsePreviousServiceForContextualQuestion(intent, message)) {
    return intent;
  }

  const service = serviceFromConversationContext(conversation);
  if (!service) {
    return intent;
  }

  return {
    ...intent,
    service_scope: "contextual",
    service_candidate: service.id,
    slots: {
      ...intent.slots,
      service_id: service.id,
      service_name: service.name,
      normalized_service_key: service.normalizedServiceKey ?? intent.slots.normalized_service_key,
    },
  };
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
  const availableSessions = sessions.filter((session) => !session.full);
  const normalized = normalize(message);
  const trimmed = normalized.trim();
  const asksToChangeSession =
    /\b(?:prefiero|mejor|otra|otro|en\s+vez|he\s+cambiado\s+de\s+idea|cambiar(?:me)?\s+(?:a|al|de|la|el|fecha|sesion|sede|modalidad)|cambio\s+(?:a|al|de|la|el|fecha|sesion|sede|modalidad))\b/.test(
      normalized,
    );
  const containsRegistrationPayload =
    state.stage === "collecting_contact" &&
    /\b(?:soy|me\s+llamo|mi\s+nombre|tel[eé]fono|fpp|fecha\s+(?:probable\s+)?(?:de\s+)?parto|pareja|acompa[nñ]ante)\b/.test(
      normalized,
    );
  const ignorePreferenceWordsInsideRegistrationData =
    containsRegistrationPayload && !asksToChangeSession;
  const explicitLocation = ignorePreferenceWordsInsideRegistrationData
    ? undefined
    : /\berandio\b/.test(normalized)
    ? "erandio"
    : /\bbilbao\b/.test(normalized)
      ? "bilbao"
      : /\bon\s*line\b|\bonline\b|\ba distancia\b/.test(normalized)
        ? "online"
        : undefined;
  const explicitModality = ignorePreferenceWordsInsideRegistrationData
    ? undefined
    : /\bon\s*line\b|\bonline\b|\ba distancia\b/.test(normalized)
    ? "online"
    : /\bpresencial\b/.test(normalized)
      ? "presencial"
      : undefined;
  const location = explicitLocation ?? state.location;
  const modality = explicitModality ?? state.modality;
  const matchesCurrentPreference = (session: NormalizedAvailableSession) => {
    const sessionLocation = normalize(
      [session.location, session.groupName, session.sessionName].filter(Boolean).join(" "),
    );
    const sessionModality = normalize(session.modality ?? "");
    const locationMatches = !location || sessionLocation.includes(normalize(location));
    const modalityMatches = !modality || sessionModality === normalize(modality);
    return locationMatches && modalityMatches;
  };
  const displayedPreferenceSessions = sessions.filter(matchesCurrentPreference);
  let candidates = availableSessions.filter(matchesCurrentPreference);

  const answersPendingPeopleCount =
    state.stage === "collecting_contact" &&
    state.pendingFields?.includes("peopleCount") &&
    /^(?:1|una|uno|2|dos)$/.test(trimmed);
  const ordinal = answersPendingPeopleCount
    ? undefined
    : trimmed.match(/^(?:opcion\s*)?([1-9])$/)?.[1] ??
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
                : /\b(?:la\s+)?quinta\b|\bopcion\s+cinco\b/.test(normalized)
                  ? "5"
                  : /\b(?:la\s+)?sexta\b|\bopcion\s+seis\b/.test(normalized)
                    ? "6"
                    : /\b(?:la\s+)?septima\b|\bopcion\s+siete\b/.test(normalized)
                      ? "7"
                      : /\b(?:la\s+)?octava\b|\bopcion\s+ocho\b/.test(normalized)
                        ? "8"
                        : undefined
      );
  const isoDate = message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const numericDate = message.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  const spanishDate = normalized.match(
    /\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/,
  );
  const dateAnswersRegistrationField =
    state.stage === "collecting_contact" &&
    !asksToChangeSession &&
    (
      state.pendingFields?.some((field) =>
        field === "fppOrDueDate" || field === "babyBirthDate"
      ) ||
      /\b(?:fpp|fecha\s+(?:probable\s+)?(?:de\s+)?parto|salgo\s+de\s+cuentas|fecha\s+(?:de\s+)?nacimiento|naci[oó]\s+(?:el\s+)?beb[eé])\b/.test(normalized)
    );
  let matchedExplicitDate = false;
  if (!dateAnswersRegistrationField && (isoDate || numericDate || spanishDate)) {
    const months: Record<string, number> = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      setiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12,
    };
    const expected = isoDate
      ? { iso: isoDate }
      : numericDate
        ? {
            day: Number.parseInt(numericDate[1], 10),
            month: Number.parseInt(numericDate[2], 10),
            year: numericDate[3]
              ? Number.parseInt(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3], 10)
              : undefined,
          }
        : {
            day: Number.parseInt(spanishDate?.[1] ?? "0", 10),
            month: months[spanishDate?.[2] ?? ""],
            year: spanishDate?.[3] ? Number.parseInt(spanishDate[3], 10) : undefined,
          };
    const dateMatches = candidates.filter((session) => {
      if ("iso" in expected) {
        return session.date === expected.iso;
      }
      const match = session.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) {
        return false;
      }
      return (
        Number.parseInt(match[3], 10) === expected.day &&
        Number.parseInt(match[2], 10) === expected.month &&
        (!expected.year || Number.parseInt(match[1], 10) === expected.year)
      );
    });
    if (dateMatches.length === 1) {
      return dateMatches[0];
    }
    if (dateMatches.length > 1) {
      candidates = dateMatches;
      matchedExplicitDate = true;
    }
  }

  if (ordinal) {
    const index = Number.parseInt(ordinal, 10) - 1;
    // La Charla se numera sobre exactamente la vista que se ha mostrado. Sin
    // preferencia son las ocho convocatorias globales; con sede o modalidad,
    // son únicamente las fechas compatibles, incluidas las sesiones llenas.
    const selected = state.serviceKey === "charla_embarazo_1_20"
      ? displayedPreferenceSessions[index]
      : candidates[index];
    return selected && !selected.full ? selected : undefined;
  }

  const dateMention = Boolean(isoDate || numericDate || spanishDate);
  const unmatchedDateIsSessionChoice =
    !dateAnswersRegistrationField &&
    dateMention &&
    (state.stage !== "collecting_contact" || asksToChangeSession);
  const hasExplicitChoice = Boolean(
    explicitLocation ||
    explicitModality ||
    ordinal ||
    matchedExplicitDate ||
    unmatchedDateIsSessionChoice,
  );
  if (!hasExplicitChoice && state.selectedSessionId) {
    // Una selección anterior solo se puede reutilizar si continúa siendo
    // compatible con la sede/modalidad vigentes. Esto impide volver a Bilbao
    // después de que la usuaria haya cambiado su preferencia a online.
    const previous = candidates.find(
      (session) => session.sessionId === state.selectedSessionId,
    );
    if (previous) {
      return previous;
    }
  }

  // La Charla tiene ocho convocatorias contractuales. Nunca se elige una por
  // ser la única fila que haya quedado en Sheets: la persona debe señalar una
  // fecha concreta para evitar registrar otra sede por error.
  if (state.serviceKey === "charla_embarazo_1_20") {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (availableSessions.length === 1) {
    return availableSessions[0];
  }

  return undefined;
}

function requiredFieldsForService(
  serviceKey: MaternalyNormalizedServiceKey,
  state: MaternalyNormalizedFlowState,
): string[] {
  if (serviceKey === "charla_embarazo_1_20") {
    return [
      !state.peopleCount ? "peopleCount" : "",
      !state.fullName ? "fullName" : "",
      !state.phone ? "phone" : "",
      (state.peopleCount ?? 0) > 1 && !state.partnerName ? "partnerName" : "",
      !state.fppOrDueDate ? "fppOrDueDate" : "",
    ].filter(Boolean);
  }

  return [
    !state.fullName ? "fullName" : "",
    !state.phone ? "phone" : "",
    !state.email ? "email" : "",
    !state.peopleCount ? "peopleCount" : "",
    !state.babyBirthDate ? "babyBirthDate" : "",
  ].filter(Boolean);
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
    const persistedPrevious = input.conversation.maternalyNormalizedFlow;
    const previous = stateBaseAfterServiceSwitch(persistedPrevious, input.intent);
    const applicableRegistrationSlots = registrationSlotsForTurn(
      input.intent,
      previous,
      input.message,
    );
    const registrationSlots = isSessionSelectionReply(input.message, previous)
      ? { ...applicableRegistrationSlots, people_count: undefined }
      : { ...applicableRegistrationSlots };
    // Names are accepted only when the current text itself contains a valid
    // explicit name, or a valid bare name while that exact field is pending.
    // Never persist a free-form NLU guess independently of the source text.
    registrationSlots.full_name = undefined;
    registrationSlots.partner_name = undefined;
    const serviceKey = serviceKeyFromSlots(registrationSlots, previous);
    const contextual = extractContextualRegistrationSlots({
      message: input.message,
      previous,
      slots: registrationSlots,
      serviceKey,
      inboundFrom: input.inbound?.from,
      allowRegistrationData:
        isRegistrationRequestTurn(input.intent) || isRegistrationDataStage(previous?.stage),
    });
    const observations = mergeObservations(
      previous?.observations,
      registrationSlots.observations,
      contextual.slots.observations,
    );

    const journeyStage = input.intent.slots.journey_stage ?? previous?.journeyStage;
    const state =
      input.intent.intent === "service_discovery" || input.intent.service_scope === "catalog"
        ? {
            ...(previous ?? { updatedAt: nowIso() }),
            journeyStage,
            pregnancyWeek: input.intent.slots.pregnancy_week ?? previous?.pregnancyWeek,
            pregnancyMonth: input.intent.slots.pregnancy_month ?? previous?.pregnancyMonth,
            mode: input.conversation.mode,
            updatedAt: nowIso(),
          }
        : {
            ...(previous ?? { updatedAt: nowIso() }),
            ...definedEntries({
              serviceKey,
              journeyStage,
              fullName: registrationSlots.full_name ?? contextual.slots.fullName ?? previous?.fullName,
              phone: contextual.slots.phone ?? registrationSlots.phone ?? previous?.phone,
              email: registrationSlots.email ?? contextual.slots.email ?? previous?.email,
              peopleCount: contextual.slots.peopleCount ?? registrationSlots.people_count ?? previous?.peopleCount,
              partnerName: registrationSlots.partner_name ?? contextual.slots.partnerName ?? previous?.partnerName,
              pregnancyWeek: registrationSlots.pregnancy_week ?? previous?.pregnancyWeek,
              pregnancyMonth: input.intent.slots.pregnancy_month ?? previous?.pregnancyMonth,
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

    if (intent.intent === "greeting") {
      return { action: "greeting" };
    }

    if (
      conversation.maternalyNormalizedFlow?.stage === "awaiting_booking_decision" &&
      intent.slots.consent === false &&
      intent.slots.last_question_answered === "reservation_declined"
    ) {
      return { action: "booking_declined", reason: "reservation_declined" };
    }

    const service = getKnowledgeService(intent.service_candidate);
    if (isRegistrationRequestTurn(intent) && !service && !state.serviceKey) {
      return {
        action: "booking_service_selection",
        reason: "booking_service_required",
        journeyStage: intent.slots.journey_stage ?? state.journeyStage,
        serviceQuestionFocus: "booking",
      };
    }

    if (intent.intent === "service_discovery" || intent.service_scope === "catalog") {
      const catalogMatches = getKnowledgeServicesByModality(intent.slots.modality);
      return {
        action: "catalog_info",
        reason: "catalog_scope",
        service: catalogMatches.length === 1 ? catalogMatches[0] : null,
        modalityPreference: intent.slots.modality,
        journeyStage: intent.slots.journey_stage ?? state.journeyStage,
      };
    }

    const previousRegistration = conversation.maternalyNormalizedFlow;
    const changesActiveSessionPreference = Boolean(
      previousRegistration &&
      isActiveRegistrationStage(previousRegistration.stage) &&
      (
        registrationFieldChanged(previousRegistration, state, "location") ||
        registrationFieldChanged(previousRegistration, state, "modality")
      ),
    );
    const continuesRegistration =
      isRegistrationRequestTurn(intent) ||
      hasRelevantRegistrationDataChange(conversation.maternalyNormalizedFlow, state);
    const isInformationalServiceQuestion =
      ["general_info", "service_question"].includes(intent.intent) &&
      intent.service_question_focus !== "booking";
    if (
      service &&
      !changesActiveSessionPreference &&
      !intent.needs_availability_lookup &&
      (!hasRegistrationDataSlots(intent.slots) || isInformationalServiceQuestion) &&
      ["general_info", "service_question"].includes(intent.intent)
    ) {
      return {
        action: "service_info",
        service,
        reason: "faq_escape_hatch",
        serviceQuestionFocus: intent.service_question_focus,
        locationPreference: intent.location_preference,
        modalityPreference: intent.slots.modality,
      };
    }

    if (state.serviceKey && continuesRegistration) {
      return {
        action: "normalized_registration",
        serviceKey: state.serviceKey,
        service: getKnowledgeServiceByNormalizedKey(state.serviceKey),
        locationPreference: intent.slots.location,
        modalityPreference: intent.slots.modality,
      };
    }

    if (service?.normalizedServiceKey && continuesRegistration) {
      return {
        action: "normalized_registration",
        serviceKey: service.normalizedServiceKey,
        service,
        locationPreference: intent.slots.location,
        modalityPreference: intent.slots.modality,
      };
    }

    if (service?.normalizedServiceKey) {
      return {
        action: "service_info",
        service,
        reason: "topic_without_transaction",
        serviceQuestionFocus: intent.service_question_focus,
        locationPreference: intent.location_preference,
        modalityPreference: intent.slots.modality,
      };
    }

    if (service) {
      return {
        action: "service_info",
        service,
        serviceQuestionFocus: intent.service_question_focus,
        locationPreference: intent.location_preference,
        modalityPreference: intent.slots.modality,
      };
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
        calendarSessions: availability.sessions,
        missingFields: [],
        availability,
        error: availability.diagnostics.errorType ?? availability.reason,
      };
    }

    const snapshot = availability.snapshot;
    const sessions = availability.sessions;
    const calendarSessions = sessions;
    const selectedSession = chooseSession(input.message, input.state, calendarSessions);
    if (!selectedSession) {
      return {
        status: "sessions_available",
        serviceKey: input.serviceKey,
        snapshot,
        sessions,
        calendarSessions,
        missingFields: [],
        availability,
      };
    }

    const stateWithSelection: MaternalyNormalizedFlowState = {
      ...input.state,
      selectedSessionId: selectedSession.sessionId,
      selectedGroupId: selectedSession.groupId,
      location: selectedSession.location ?? input.state.location,
      modality: selectedSession.modality ?? input.state.modality,
    };
    const missingFields = requiredFieldsForService(input.serviceKey, stateWithSelection);
    if (missingFields.length > 0) {
      return {
        status: "collecting_fields",
        serviceKey: input.serviceKey,
        snapshot,
        sessions,
        calendarSessions,
        selectedSession,
        missingFields,
        availability,
      };
    }

    const draft = {
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
    };

    let writeAvailability: NormalizedServiceAvailabilityResult;
    try {
      writeAvailability = await getNormalizedServiceAvailability({
        serviceKey: input.serviceKey,
        client: this.client,
        env,
      });
    } catch (error) {
      return {
        status: "read_error",
        serviceKey: input.serviceKey,
        snapshot,
        sessions,
        calendarSessions,
        selectedSession,
        missingFields: [],
        availability,
        error: error instanceof Error ? error.message : "sheet_read_failed",
      };
    }

    if (!writeAvailability.ok || !writeAvailability.snapshot) {
      return {
        status: "read_error",
        serviceKey: input.serviceKey,
        snapshot: writeAvailability.snapshot ?? snapshot,
        sessions: writeAvailability.sessions,
        calendarSessions: writeAvailability.sessions,
        selectedSession,
        missingFields: [],
        availability: writeAvailability,
        error: writeAvailability.diagnostics.errorType ?? writeAvailability.reason,
      };
    }

    const writeSnapshot = writeAvailability.snapshot;
    const writeSessions = writeAvailability.sessions;
    const writeCalendarSessions = writeSessions;
    const revalidatedSession =
      writeCalendarSessions.find((candidate) => candidate.sessionId === selectedSession.sessionId) ??
      writeCalendarSessions.find(
        (candidate) =>
          candidate.date === selectedSession.date &&
          candidate.startTime === selectedSession.startTime &&
          normalize(candidate.location ?? "") === normalize(selectedSession.location ?? "") &&
          candidate.modality === selectedSession.modality,
      );

    if (!revalidatedSession) {
      return {
        status: "read_error",
        serviceKey: input.serviceKey,
        snapshot: writeSnapshot,
        sessions: writeSessions,
        calendarSessions: writeCalendarSessions,
        selectedSession,
        missingFields: [],
        availability: writeAvailability,
        error: "selected_session_not_available_on_revalidation",
      };
    }

    const plan = buildRegistrationWritePlan({
      snapshot: writeSnapshot,
      session: revalidatedSession,
      draft,
      env,
    });
    const writeResult = await applyRegistrationWritePlan({ snapshot: writeSnapshot, client: this.client, plan });

    return {
      status: "write_result",
      serviceKey: input.serviceKey,
      snapshot: writeSnapshot,
      sessions: writeSessions,
      calendarSessions: writeCalendarSessions,
      selectedSession: revalidatedSession,
      missingFields: [],
      plan,
      writeResult,
      availability: writeAvailability,
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
    calendarSessionsCount: toolResult.calendarSessions?.length ?? sessionsCount,
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
    const interpretedIntent = await this.interpreter.interpret(
      input.inbound.text,
      buildInterpretationContext(input.conversation),
      input.env ?? process.env,
    );
    const intent = enrichIntentWithConversationServiceContext(
      interpretedIntent,
      input.conversation,
      input.inbound.text,
    );
    const replacesServiceFlow = shouldReplaceServiceFlow(stateBefore, intent);
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
          serviceScope: intent.service_scope,
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
            pregnancy_month: intent.slots.pregnancy_month,
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
          serviceScope: intent.service_scope,
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
        : decision.action === "booking_declined"
          ? {
              ...toPersistedState(state),
              serviceKey: undefined,
              stage: "collecting_service",
              selectedSessionId: undefined,
              selectedGroupId: undefined,
              location: undefined,
              modality: undefined,
              pendingFields: [],
              updatedAt: nowIso(),
            }
        : decision.action === "booking_service_selection"
          ? {
              ...toPersistedState(state),
              serviceKey: undefined,
              journeyStage: decision.journeyStage ?? state.journeyStage,
              stage: "choosing_booking_service",
              selectedSessionId: undefined,
              selectedGroupId: undefined,
              pendingFields: [],
              updatedAt: nowIso(),
            }
        : decision.action === "catalog_info"
          ? {
              ...toPersistedState(state),
              serviceKey: decision.service?.normalizedServiceKey,
              journeyStage: decision.journeyStage ?? state.journeyStage,
              stage: "collecting_service",
              modality: decision.modalityPreference ?? state.modality,
              pendingFields: [],
              updatedAt: nowIso(),
            }
        : {
            ...toPersistedState(state),
            stage:
               decision.action === "handoff"
                 ? "handoff"
                 : decision.action === "greeting"
                  ? state.journeyStage
                    ? state.stage ?? "collecting_service"
                    : "choosing_journey_stage"
                : decision.action === "normalized_registration" && state.serviceKey
                  ? "choosing_session"
                  : decision.action === "service_info" &&
                      decision.service?.id === "charla_embarazo_1_20" &&
                      !isActiveRegistrationStage(stateBefore?.stage)
                    ? "awaiting_booking_decision"
                  : decision.action === "service_info" && (!stateBefore?.stage || replacesServiceFlow)
                    ? "collecting_service"
                  : state.stage,
            pendingFields: state.pendingFields ?? [],
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
      const clearUnresolvedCharlaSelection =
        serviceKey === "charla_embarazo_1_20" &&
        toolResult.status === "sessions_available";
      nextState = {
        ...toPersistedState(state),
        serviceKey,
        selectedSessionId:
          toolResult.selectedSession?.sessionId ??
          (clearUnresolvedCharlaSelection ? undefined : state.selectedSessionId),
        selectedGroupId:
          toolResult.selectedSession?.groupId ??
          (clearUnresolvedCharlaSelection ? undefined : state.selectedGroupId),
        location: toolResult.selectedSession?.location ?? state.location,
        modality: toolResult.selectedSession?.modality ?? state.modality,
        stage:
          toolResult.status === "manual_validation_required"
            ? "blocked"
            : toolResult.status === "write_result"
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
    const renderInput = {
      decision,
      state: nextState,
      toolResult,
      message: input.inbound.text,
    };
    const groundedRender = await this.renderer.renderGrounded(
      {
        ...renderInput,
        intent,
        recentTurns: buildGroundedCopyTurns(input.conversation),
      },
      input.env ?? process.env,
    );
    const baseReply = groundedRender?.text;
    const distinctReply = baseReply
      ? ensureDistinctMaternalyReply({
          reply: baseReply,
          recentAssistantReplies: messagesAfterLatestReset(input.conversation)
            .filter((message) => message.senderType === "bot" && message.body.trim())
            .slice(-20)
            .map((message) => message.body),
          action: decision.action,
          preferredAlternatives: this.renderer.renderAlternatives(renderInput),
        })
      : undefined;
    const reply = distinctReply?.reply;
    if (groundedRender) {
      events.push({
        eventType: "maternaly_grounded_copy_completed",
        payload: {
          action: decision.action,
          mode: groundedRender.mode,
          reason: groundedRender.reason,
          attempted: groundedRender.attempted,
          latencyMs: groundedRender.latencyMs,
          acceptedCandidate: groundedRender.candidateAudits.find((audit) => audit.accepted)?.index,
          rejectedCandidateReasons: groundedRender.candidateAudits
            .filter((audit) => !audit.accepted)
            .flatMap((audit) => audit.reasons),
        },
      });
    }
    if (distinctReply?.changed) {
      events.push({
        eventType: "maternaly_copy_repetition_avoided",
        payload: {
          action: decision.action,
          duplicateCount: distinctReply.duplicateCount,
          serviceKey: decision.serviceKey ?? state.serviceKey,
        },
      });
    }
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
      toolResult?.status === "manual_validation_required" ||
      (toolResult?.status === "write_result" && Boolean(toolResult.plan?.blocked || !toolResult.writeResult?.ok));
    const resetPreservesManualReview =
      decision.action === "reset" &&
      (input.conversation.clientStatus === "blocked" || input.conversation.clientStatus === "ambiguous");
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
      openaiCalls: (openaiCallExpected ? 1 : 0) + (groundedRender?.attempted ? 1 : 0),
      usedDeterministicFastPath: !openaiCallExpected && !groundedRender?.attempted,
      usedFallback: groundedRender?.mode === "fallback",
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
        serviceScope: intent.service_scope,
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
        mode: groundedRender?.mode ?? "none",
        reason: groundedRender?.reason,
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

    const hasConfirmedServiceMilestone =
      input.conversation.maternalyReservationStatus === "confirmed" ||
      input.conversation.maternalyPaymentStatus === "confirmed" ||
      input.conversation.maternalyInvoiceStatus === "sent";
    const hasTrackedServiceMilestone =
      hasConfirmedServiceMilestone ||
      input.conversation.maternalyPaymentStatus === "pending" ||
      input.conversation.maternalyInvoiceStatus === "pending" ||
      input.conversation.maternalyInvoiceStatus === "failed";

    return {
      handled: true,
      reply,
      renderedMessage,
      intent,
      state: nextState,
      conversationPatch: {
        maternalyNormalizedFlow: nextState,
        serviceDetected:
          decision.action === "reset"
            ? hasConfirmedServiceMilestone
              ? input.conversation.serviceDetected
              : undefined
            : decision.action === "booking_declined"
              ? undefined
            : decision.action === "catalog_info"
              ? hasTrackedServiceMilestone
                ? input.conversation.serviceDetected
                : service?.name
              : service?.name ?? input.conversation.serviceDetected,
        maternalyReservationStatus:
          decision.action === "reset" || decision.action === "catalog_info"
            ? input.conversation.maternalyReservationStatus === "pending"
              ? "none"
              : input.conversation.maternalyReservationStatus ?? "none"
            : decision.action === "normalized_registration"
              ? "pending"
              : input.conversation.maternalyReservationStatus ?? "none",
        maternalyPaymentStatus:
          decision.action === "reset"
            ? input.conversation.maternalyPaymentStatus === "pending"
              ? "none"
              : input.conversation.maternalyPaymentStatus ?? "none"
            : decision.action === "payment"
              ? "pending"
              : input.conversation.maternalyPaymentStatus ?? "none",
        maternalyInvoiceStatus:
          decision.action === "reset"
            ? input.conversation.maternalyInvoiceStatus === "pending"
              ? "none"
              : input.conversation.maternalyInvoiceStatus ?? "none"
            : decision.action === "invoice"
              ? "pending"
              : input.conversation.maternalyInvoiceStatus ?? "none",
        maternalyReviewStatus:
          decision.action === "reset"
            ? resetPreservesManualReview
              ? input.conversation.maternalyReviewStatus ?? "manual_review_required"
              : "ok"
            : needsHuman
              ? "manual_review_required"
              : input.conversation.maternalyReviewStatus ?? "ok",
        priority:
          decision.action === "reset"
            ? resetPreservesManualReview
              ? input.conversation.priority
              : "normal"
            : clinicalHandoff
              ? "urgent"
              : input.conversation.priority,
        mode:
          decision.action === "reset"
            ? resetPreservesManualReview
              ? "human"
              : "bot"
            : needsHuman
              ? "human"
              : input.conversation.mode,
        humanRequested: needsHuman
          ? true
          : decision.action === "reset"
            ? resetPreservesManualReview
            : input.conversation.humanRequested,
        requiresManualReview:
          needsHuman
            ? true
            : decision.action === "reset"
              ? resetPreservesManualReview
              : input.conversation.requiresManualReview,
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
