export const MATERNALY_GROUNDED_COPY_ELIGIBLE_ACTIONS = [
  "service_info",
  "general",
] as const;

export type MaternalyGroundedCopyEligibleAction =
  (typeof MATERNALY_GROUNDED_COPY_ELIGIBLE_ACTIONS)[number];

export interface MaternalyGroundedCopyTurn {
  role: "user" | "assistant";
  /** Used locally for privacy checks and exact-repeat avoidance; never sent. */
  text: string;
}

export interface MaternalyGroundedCopyInput {
  action: string;
  /** Immutable renderer-owned copy and the exact fallback. Never sent to OpenAI. */
  safeDraft: string;
  /** Kept for interface compatibility. Facts are never sent to or rewritten by OpenAI. */
  authorizedFacts?: string[];
  /** Caller-provided context; only closed, derived booleans are sent. */
  redactedContext?: string;
  /** Never sent. Used only for privacy checks and local repeat avoidance. */
  recentTurns?: MaternalyGroundedCopyTurn[];
}

export type MaternalyGroundedCopyRejectionReason =
  | "empty_candidate"
  | "candidate_too_long"
  | "internal_language"
  | "transaction_confirmation"
  | "date_or_time_claim"
  | "price_claim"
  | "capacity_claim"
  | "unauthorized_numeric_fact"
  | "unauthorized_modality_claim"
  | "unauthorized_service_claim"
  | "missing_material_fact"
  | "ungrounded_copy"
  | "unsupported_fact_vocabulary"
  | "safe_draft_mutated"
  | "unapproved_framing"
  | "duplicate_plan"
  | "incompatible_framing"
  | "too_similar_to_recent_reply";

export interface MaternalyGroundedCopyCandidateAudit {
  index: number;
  accepted: boolean;
  reasons: MaternalyGroundedCopyRejectionReason[];
}

export type MaternalyGroundedCopyResultReason =
  | "accepted"
  | "unsupported_action"
  | "empty_safe_draft"
  | "provider_disabled"
  | "missing_api_key"
  | "sensitive_or_unredacted_context"
  | "http_error"
  | "timeout"
  | "invalid_response"
  | "request_error"
  | "no_safe_candidate";

export interface MaternalyGroundedCopyResult {
  /** Approved framing around the literal safeDraft, or the exact safeDraft fallback. */
  text: string;
  source: "grounded_generator" | "safe_draft";
  mode: "generated" | "skipped" | "fallback";
  reason: MaternalyGroundedCopyResultReason;
  attempted: boolean;
  model?: string;
  latencyMs: number;
  candidateAudits: MaternalyGroundedCopyCandidateAudit[];
}

export interface MaternalyGroundedCopyGeneratorOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

export const MATERNALY_GROUNDED_COPY_OPENINGS = {
  none: "",
  friendly: "Claro 😊",
  attentive: "Te leo y lo vemos con calma.",
  warm_ack: "Gracias por contármelo. 💛",
  context_ack: "Gracias por compartirlo; lo tengo en cuenta.",
  step_by_step: "Vamos poquito a poco.",
  direct: "Te cuento.",
} as const;

export const MATERNALY_GROUNDED_COPY_CLOSINGS = {
  none: "",
  invite_continue: "Si te apetece, seguimos desde aquí.",
  invite_detail: "Cuéntame qué parte te gustaría mirar con más calma. 💛",
  available: "Estoy aquí para seguir contigo.",
  unhurried: "Podemos seguir poquito a poco, sin prisa. 😊",
  open_question: "¿Por dónde te apetece continuar?",
} as const;

export type MaternalyGroundedCopyOpeningId =
  keyof typeof MATERNALY_GROUNDED_COPY_OPENINGS;
export type MaternalyGroundedCopyClosingId =
  keyof typeof MATERNALY_GROUNDED_COPY_CLOSINGS;

interface MaternalyGroundedCopyPlan {
  opening_id: MaternalyGroundedCopyOpeningId;
  closing_id: MaternalyGroundedCopyClosingId;
}

const OPENING_IDS = Object.keys(
  MATERNALY_GROUNDED_COPY_OPENINGS,
) as MaternalyGroundedCopyOpeningId[];
const CLOSING_IDS = Object.keys(
  MATERNALY_GROUNDED_COPY_CLOSINGS,
) as MaternalyGroundedCopyClosingId[];
const OPENING_ID_SET = new Set<string>(OPENING_IDS);
const CLOSING_ID_SET = new Set<string>(CLOSING_IDS);

const DEFAULT_TIMEOUT_MS = 3_500;
const MAX_CANDIDATE_LENGTH = 2_400;

export const MATERNALY_GROUNDED_COPY_SYSTEM_PROMPT = [
  "Eres un selector cerrado de framing conversacional para Maternaly.",
  "No recibes el borrador ni hechos del negocio y no redactas texto visible.",
  "Elige exactamente dos planes distintos usando solo opening_id y closing_id de los enums del schema.",
  "Los IDs warm_ack y context_ack encajan cuando la usuaria acaba de compartir contexto personal.",
  "Usa none cuando convenga evitar una apertura o un cierre adicional.",
  "No devuelvas texto libre, explicaciones, servicios, fechas, precios, sedes, reservas, pagos ni afirmaciones clinicas.",
  "Devuelve unicamente el JSON estricto solicitado.",
].join(" ");

const MATERNALY_GROUNDED_COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    plans: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          opening_id: { type: "string", enum: OPENING_IDS },
          closing_id: { type: "string", enum: CLOSING_IDS },
        },
        required: ["opening_id", "closing_id"],
      },
    },
  },
  required: ["plans"],
} as const;

const SECRET_OR_PII_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?\d[\s().-]*){9,}|\bsk-[A-Za-z0-9_-]{10,}\b|\b(?:AC|SK|SM)[a-f0-9]{20,}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\b(?:api[_ -]?key|auth[_ -]?token|authorization|bearer)\s*[:=]\s*\S+)/i;
const CLINICAL_OR_GESTATIONAL_DETAIL_PATTERN =
  /\b(?:sangrado|dolor\s+fuerte|contracciones?|fiebre|mastitis|medicaci[oó]n|dosis|diagn[oó]stico\s+(?:m[eé]dico|personal)|resultado\s+(?:m[eé]dico|cl[ií]nico)|p[eé]rdida\s+de\s+l[ií]quido|historial\s+m[eé]dico|(?:primer|segundo|tercer|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|\d{1,2})\s+(?:mes(?:es)?|semanas?))\b/i;

class MaternalyGroundedCopyTimeoutError extends Error {}
class MaternalyGroundedCopyHttpError extends Error {}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSensitiveInput(input: MaternalyGroundedCopyInput): boolean {
  const allText = [
    input.safeDraft,
    ...(input.authorizedFacts ?? []),
    input.redactedContext ?? "",
    ...(input.recentTurns ?? []).map((turn) => turn.text),
  ].join("\n");
  if (SECRET_OR_PII_PATTERN.test(allText)) {
    return true;
  }

  const purportedlyRedactedContext = [
    input.redactedContext ?? "",
    ...(input.recentTurns ?? []).map((turn) => turn.text),
  ].join("\n");
  return CLINICAL_OR_GESTATIONAL_DETAIL_PATTERN.test(purportedlyRedactedContext);
}

function responseOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  };
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const outputText = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text" && typeof item.text === "string")?.text;
  return typeof outputText === "string" ? outputText : null;
}

function parsePlans(payload: unknown): MaternalyGroundedCopyPlan[] | null {
  const outputText = responseOutputText(payload);
  if (!outputText) {
    return null;
  }

  try {
    const parsed = JSON.parse(outputText) as { plans?: unknown };
    if (!Array.isArray(parsed.plans) || parsed.plans.length !== 2) {
      return null;
    }

    const plans: MaternalyGroundedCopyPlan[] = [];
    for (const rawPlan of parsed.plans) {
      if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
        return null;
      }
      const plan = rawPlan as Record<string, unknown>;
      const keys = Object.keys(plan).sort();
      if (keys.length !== 2 || keys[0] !== "closing_id" || keys[1] !== "opening_id") {
        return null;
      }
      if (
        typeof plan.opening_id !== "string" ||
        typeof plan.closing_id !== "string" ||
        !OPENING_ID_SET.has(plan.opening_id) ||
        !CLOSING_ID_SET.has(plan.closing_id)
      ) {
        return null;
      }
      plans.push({
        opening_id: plan.opening_id as MaternalyGroundedCopyOpeningId,
        closing_id: plan.closing_id as MaternalyGroundedCopyClosingId,
      });
    }
    return plans;
  } catch {
    return null;
  }
}

function composePlan(plan: MaternalyGroundedCopyPlan, safeDraft: string): string {
  return [
    MATERNALY_GROUNDED_COPY_OPENINGS[plan.opening_id],
    safeDraft,
    MATERNALY_GROUNDED_COPY_CLOSINGS[plan.closing_id],
  ]
    .filter(Boolean)
    .join("\n\n");
}

function planKey(plan: MaternalyGroundedCopyPlan): string {
  return `${plan.opening_id}:${plan.closing_id}`;
}

function planCompatibilityReasons(
  plan: MaternalyGroundedCopyPlan,
  safeDraft: string,
  contextMode: ReturnType<typeof abstractContextMode>,
): MaternalyGroundedCopyRejectionReason[] {
  const reasons: MaternalyGroundedCopyRejectionReason[] = [];
  const shape = safeDraftShape(safeDraft);
  const opening = MATERNALY_GROUNDED_COPY_OPENINGS[plan.opening_id];
  const closing = MATERNALY_GROUNDED_COPY_CLOSINGS[plan.closing_id];
  const framingEmojiCount = (opening.match(/\p{Extended_Pictographic}/gu) ?? []).length +
    (closing.match(/\p{Extended_Pictographic}/gu) ?? []).length;

  if (
    (contextMode !== "shared_context" &&
      (plan.opening_id === "warm_ack" || plan.opening_id === "context_ack")) ||
    (shape.starts_warm && opening) ||
    (shape.ends_with_question && closing) ||
    (opening && normalize(safeDraft).startsWith(normalize(opening))) ||
    (closing && normalize(safeDraft).endsWith(normalize(closing))) ||
    framingEmojiCount > 1
  ) {
    reasons.push("incompatible_framing");
  }

  return reasons;
}

function isApprovedPrefix(prefix: string): boolean {
  return OPENING_IDS.some((id) => {
    const opening = MATERNALY_GROUNDED_COPY_OPENINGS[id];
    return prefix === (opening ? `${opening}\n\n` : "");
  });
}

function isApprovedSuffix(suffix: string): boolean {
  return CLOSING_IDS.some((id) => {
    const closing = MATERNALY_GROUNDED_COPY_CLOSINGS[id];
    return suffix === (closing ? `\n\n${closing}` : "");
  });
}

export function validateMaternalyGroundedCopyCandidate(input: {
  candidate: string;
  safeDraft: string;
  authorizedFacts?: string[];
  recentAssistantReplies?: string[];
}): MaternalyGroundedCopyRejectionReason[] {
  const candidate = input.candidate.trim();
  const reasons: MaternalyGroundedCopyRejectionReason[] = [];

  if (!candidate) reasons.push("empty_candidate");
  if (candidate.length > MAX_CANDIDATE_LENGTH) reasons.push("candidate_too_long");

  const safeDraftIndex = candidate.indexOf(input.safeDraft);
  if (
    !input.safeDraft ||
    safeDraftIndex < 0 ||
    candidate.lastIndexOf(input.safeDraft) !== safeDraftIndex
  ) {
    reasons.push("safe_draft_mutated");
  } else {
    const prefix = candidate.slice(0, safeDraftIndex);
    const suffix = candidate.slice(safeDraftIndex + input.safeDraft.length);
    if (!isApprovedPrefix(prefix) || !isApprovedSuffix(suffix)) {
      reasons.push("unapproved_framing");
    }
  }

  if (
    (input.recentAssistantReplies ?? []).some(
      (recentReply) => normalize(recentReply) === normalize(candidate),
    )
  ) {
    reasons.push("too_similar_to_recent_reply");
  }

  return [...new Set(reasons)];
}

export function isMaternalyGroundedCopyEligibleAction(
  action: string,
): action is MaternalyGroundedCopyEligibleAction {
  return (MATERNALY_GROUNDED_COPY_ELIGIBLE_ACTIONS as readonly string[]).includes(action);
}

function abstractContextMode(value: string | undefined):
  | "shared_context"
  | "general_orientation"
  | "informational" {
  const normalized = normalize(value ?? "");
  if (normalized.includes("comparte contexto") || normalized.includes("contexto personal")) {
    return "shared_context";
  }
  if (normalized.includes("orientacion general")) {
    return "general_orientation";
  }
  return "informational";
}

function safeDraftShape(safeDraft: string): {
  length_band: "short" | "medium" | "long";
  starts_warm: boolean;
  ends_with_question: boolean;
} {
  return {
    length_band:
      safeDraft.length < 220 ? "short" : safeDraft.length < 700 ? "medium" : "long",
    starts_warm: /^(?:¡?hola|buen(?:os|as)?\b|claro\b|gracias\b|s[ií][,.!\s])/i.test(
      safeDraft.trim(),
    ),
    ends_with_question: /\?\s*(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})?\s*$/u.test(
      safeDraft,
    ),
  };
}

export class MaternalyGroundedCopyGenerator {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: MaternalyGroundedCopyGeneratorOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  async generate(
    input: MaternalyGroundedCopyInput,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<MaternalyGroundedCopyResult> {
    const startedAt = this.now();
    const fallback = (
      mode: "skipped" | "fallback",
      reason: MaternalyGroundedCopyResultReason,
      attempted: boolean,
      candidateAudits: MaternalyGroundedCopyCandidateAudit[] = [],
      model?: string,
    ): MaternalyGroundedCopyResult => ({
      text: input.safeDraft,
      source: "safe_draft",
      mode,
      reason,
      attempted,
      model,
      latencyMs: Math.max(0, this.now() - startedAt),
      candidateAudits,
    });

    if (!isMaternalyGroundedCopyEligibleAction(input.action)) {
      return fallback("skipped", "unsupported_action", false);
    }
    if (!input.safeDraft.trim()) {
      return fallback("skipped", "empty_safe_draft", false);
    }
    if (env.LLM_PROVIDER && env.LLM_PROVIDER !== "openai") {
      return fallback("skipped", "provider_disabled", false);
    }
    if (!env.OPENAI_API_KEY) {
      return fallback("skipped", "missing_api_key", false);
    }
    if (hasSensitiveInput(input)) {
      return fallback("skipped", "sensitive_or_unredacted_context", false);
    }

    const model = env.LLM_MODEL || "gpt-4.1-mini";
    const contextMode = abstractContextMode(input.redactedContext);
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const request = this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          store: false,
          max_output_tokens: 240,
          tools: [],
          input: [
            { role: "system", content: MATERNALY_GROUNDED_COPY_SYSTEM_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                action: input.action,
                context_mode: contextMode,
                draft_shape: safeDraftShape(input.safeDraft),
                has_recent_assistant_reply: (input.recentTurns ?? []).some(
                  (turn) => turn.role === "assistant",
                ),
              }),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "maternaly_framing_plan",
              strict: true,
              schema: MATERNALY_GROUNDED_COPY_SCHEMA,
            },
          },
        }),
      }).then(async (response) => {
        if (!response.ok) {
          throw new MaternalyGroundedCopyHttpError(String(response.status));
        }
        return response.json() as Promise<unknown>;
      });

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new MaternalyGroundedCopyTimeoutError());
        }, this.timeoutMs);
      });
      const payload = await Promise.race([request, timeout]);
      const plans = parsePlans(payload);
      if (!plans) {
        return fallback("fallback", "invalid_response", true, [], model);
      }

      if (planKey(plans[0]) === planKey(plans[1])) {
        const duplicateAudits = plans.map((_, index) => ({
          index,
          accepted: false,
          reasons: ["duplicate_plan" as const],
        }));
        return fallback("fallback", "no_safe_candidate", true, duplicateAudits, model);
      }

      const candidates = plans.map((plan) => composePlan(plan, input.safeDraft));
      const recentAssistantReplies = (input.recentTurns ?? [])
        .filter((turn) => turn.role === "assistant")
        .map((turn) => turn.text);
      const candidateAudits = candidates.map((candidate, index) => {
        const reasons = [
          ...planCompatibilityReasons(plans[index], input.safeDraft, contextMode),
          ...validateMaternalyGroundedCopyCandidate({
            candidate,
            safeDraft: input.safeDraft,
            recentAssistantReplies,
          }),
        ];
        return {
          index,
          accepted: reasons.length === 0,
          reasons: [...new Set(reasons)],
        } satisfies MaternalyGroundedCopyCandidateAudit;
      });
      const accepted = candidateAudits.find((audit) => audit.accepted);
      if (!accepted) {
        return fallback("fallback", "no_safe_candidate", true, candidateAudits, model);
      }

      return {
        text: candidates[accepted.index],
        source: "grounded_generator",
        mode: "generated",
        reason: "accepted",
        attempted: true,
        model,
        latencyMs: Math.max(0, this.now() - startedAt),
        candidateAudits,
      };
    } catch (error) {
      if (error instanceof MaternalyGroundedCopyTimeoutError || controller.signal.aborted) {
        return fallback("fallback", "timeout", true, [], model);
      }
      if (error instanceof MaternalyGroundedCopyHttpError) {
        return fallback("fallback", "http_error", true, [], model);
      }
      return fallback("fallback", "request_error", true, [], model);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
