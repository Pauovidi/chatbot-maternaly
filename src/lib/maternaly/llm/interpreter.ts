import { findKnowledgeService, getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import type { MaternalyServiceId } from "@/lib/maternaly/domain/types";
import type { MaternalyNormalizedServiceKey } from "@/lib/maternaly/sheets/normalized-template";

export const MATERNALY_OPENAI_SYSTEM_PROMPT = [
  "Eres el clasificador NLU estructurado del asistente de Maternaly para WhatsApp.",
  "Identidad del asistente: Maternaly. Tono esperado por la capa de copy: cálido, claro, breve, profesional y cercano.",
  "Servicios de dominio: charla embarazo 1-20, taller BLW, Pilates, AIPAP Agua, AIPAP Terra, Yoga Prenatal, Método 5P, Diagnóstico Prenatal, Lactancia, Suelo Pélvico y Fisioterapia Pediátrica.",
  "Tu única tarea es devolver JSON estructurado. No escribas la respuesta visible a la usuaria.",
  "Mantén contexto multi-turno si aparece en el input, interpreta slots útiles y no inventes disponibilidad, plazas, pagos ni facturas.",
  "Diferencia información general, interés, inscripción, selección de sesión, datos de inscripción, confirmación, pago, factura, humano, privacidad y reset.",
  "Si falta un dato, márcalo en missing_fields; no te bloquees ni inventes datos.",
  "Dudas clínicas o diagnósticas deben marcar should_handoff=true.",
  "Cancelaciones, cambios de fecha o sede, reagendamientos, devoluciones, pagos, facturas y justificantes deben marcar should_handoff=true.",
  "JSON schema: { intent, slots, needs_availability_lookup, confidence, missing_fields, should_handoff, safety_flags }.",
].join(" ");

export type MaternalyIntent =
  | "greeting"
  | "general_info"
  | "service_question"
  | "availability_request"
  | "registration_start"
  | "registration_slot_selected"
  | "registration_data_provided"
  | "registration_confirm"
  | "payment_question"
  | "invoice_question"
  | "handoff_request"
  | "privacy_question"
  | "reset"
  | "unknown";

export interface MaternalyNluSlots {
  service_id?: MaternalyServiceId;
  service_name?: string;
  normalized_service_key?: MaternalyNormalizedServiceKey;
  location?: string;
  modality?: "presencial" | "online";
  preferred_date?: string;
  preferred_time?: string;
  selected_session_id?: string;
  selected_group_id?: string;
  name?: string;
  surname?: string;
  full_name?: string;
  phone?: string;
  email?: string;
  people_count?: number;
  partner_name?: string;
  pregnancy_week?: number;
  fpp_or_due_date?: string;
  baby_birth_date?: string;
  baby_name?: string;
  observations?: string;
  consent?: boolean;
  last_question_answered?: string;
}

export interface StructuredIntent {
  intent: MaternalyIntent;
  slots: MaternalyNluSlots;
  service_candidate?: string;
  location_preference?: string;
  venue_preference?: string;
  time_preference?: string;
  pregnancy_week?: number;
  people_count?: number;
  needs_availability_lookup: boolean;
  confidence: number;
  missing_fields: string[];
  should_handoff: boolean;
  safety_flags: string[];
}

const DEFAULT_INTENT: StructuredIntent = {
  intent: "unknown",
  slots: {},
  needs_availability_lookup: false,
  confidence: 0.35,
  missing_fields: [],
  should_handoff: false,
  safety_flags: [],
};

export const FORBIDDEN_NLU_VISIBLE_FIELDS = [
  "reply",
  "replyText",
  "message",
  "botReply",
  "visibleText",
] as const;

const ALLOWED_INTENTS: MaternalyIntent[] = [
  "greeting",
  "general_info",
  "service_question",
  "availability_request",
  "registration_start",
  "registration_slot_selected",
  "registration_data_provided",
  "registration_confirm",
  "payment_question",
  "invoice_question",
  "handoff_request",
  "privacy_question",
  "reset",
  "unknown",
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function extractNumber(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  return match?.[1] ? Number(match[1]) : undefined;
}

function compact(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validPeopleCount(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 && number <= 4 ? number : undefined;
}

function validPregnancyWeek(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 && number < 45 ? number : undefined;
}

function detectNormalizedServiceKey(serviceId?: string): MaternalyNormalizedServiceKey | undefined {
  if (serviceId === "charla_embarazo_1_20" || serviceId === "taller_blw") {
    return serviceId;
  }

  return undefined;
}

function detectLocation(text: string): string | undefined {
  return [
    "bilbao",
    "erandio",
    "bec",
    "barakaldo",
    "leioa",
    "up&you",
    "hydra",
    "beup",
    "online",
  ].find((item) => text.includes(normalize(item)));
}

function detectModality(text: string): "presencial" | "online" | undefined {
  if (/\bonline\b/.test(text)) {
    return "online";
  }

  if (/\bpresencial\b/.test(text) || /\bbilbao\b|\berandio\b/.test(text)) {
    return "presencial";
  }

  return undefined;
}

function extractDateLike(message: string): string | undefined {
  return (
    message.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    message.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/)?.[0]
  );
}

function extractEmail(message: string): string | undefined {
  return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(message: string): string | undefined {
  const match = message.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  return match?.[0]?.replace(/\s+/g, " ").trim();
}

function extractFullName(message: string): string | undefined {
  const withoutContact = message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, "")
    .replace(/\b(?:telefono|teléfono|email|correo|personas?|pareja|fpp|fecha probable|fecha nacimiento|beb[eé]).*$/i, "")
    .trim();
  const match = withoutContact.match(
    /\b(?:(?:soy|me llamo|nombre(?:\s+y\s+apellidos)?[:\s]+)\s*)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){1,5})/i,
  );
  return match?.[1]?.trim();
}

function extractPartnerName(message: string): string | undefined {
  const match = message.match(/\b(?:pareja|acompañante|acompanante)[:\s]+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,4})/i);
  return match?.[1]?.trim();
}

function inferPeopleCount(text: string): number | undefined {
  if (/\bpareja\b|\bdos\b|\b2\s*(personas|plazas|asistentes)?\b/.test(text)) {
    return 2;
  }

  if (/\buna\b|\b1\s*(persona|plaza|asistente)?\b/.test(text)) {
    return 1;
  }

  return extractNumber(text, /\b(\d{1,2})\s*(personas|plazas|asistentes)\b/);
}

function validateSlots(value: unknown): MaternalyNluSlots {
  const raw = (value ?? {}) as Partial<MaternalyNluSlots>;
  const service = getKnowledgeService(compact(raw.service_id) ?? compact(raw.normalized_service_key));
  const normalizedServiceKey =
    compact(raw.normalized_service_key) === "charla_embarazo_1_20" ||
    compact(raw.normalized_service_key) === "taller_blw"
      ? (compact(raw.normalized_service_key) as MaternalyNormalizedServiceKey)
      : detectNormalizedServiceKey(service?.id);
  const peopleCount = validPeopleCount(raw.people_count);
  const pregnancyWeek = validPregnancyWeek(raw.pregnancy_week);

  return {
    service_id: service?.id,
    service_name: compact(raw.service_name) ?? service?.name,
    normalized_service_key: normalizedServiceKey,
    location: compact(raw.location),
    modality: raw.modality === "online" || raw.modality === "presencial" ? raw.modality : undefined,
    preferred_date: compact(raw.preferred_date),
    preferred_time: compact(raw.preferred_time),
    selected_session_id: compact(raw.selected_session_id),
    selected_group_id: compact(raw.selected_group_id),
    name: compact(raw.name),
    surname: compact(raw.surname),
    full_name: compact(raw.full_name),
    phone: compact(raw.phone),
    email: compact(raw.email),
    people_count: peopleCount,
    partner_name: compact(raw.partner_name),
    pregnancy_week: pregnancyWeek,
    fpp_or_due_date: compact(raw.fpp_or_due_date),
    baby_birth_date: compact(raw.baby_birth_date),
    baby_name: compact(raw.baby_name),
    observations: compact(raw.observations),
    consent: typeof raw.consent === "boolean" ? raw.consent : undefined,
    last_question_answered: compact(raw.last_question_answered),
  };
}

export function validateStructuredIntent(value: unknown): StructuredIntent {
  const raw = value as Partial<StructuredIntent> & Record<string, unknown>;
  const intent = raw.intent ?? DEFAULT_INTENT.intent;
  const forbiddenVisibleFields = FORBIDDEN_NLU_VISIBLE_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(raw ?? {}, field),
  );
  const slots = validateSlots(raw.slots);
  const serviceCandidate = compact(raw.service_candidate) ?? slots.service_id ?? slots.normalized_service_key;
  const locationPreference = compact(raw.location_preference) ?? slots.location;
  const peopleCount = validPeopleCount(raw.people_count) ?? slots.people_count;
  const pregnancyWeek = validPregnancyWeek(raw.pregnancy_week) ?? slots.pregnancy_week;

  return {
    ...DEFAULT_INTENT,
    intent: ALLOWED_INTENTS.includes(intent) ? intent : "unknown",
    slots,
    service_candidate: serviceCandidate,
    location_preference: locationPreference,
    venue_preference: compact(raw.venue_preference),
    time_preference: compact(raw.time_preference) ?? slots.preferred_time,
    pregnancy_week: pregnancyWeek,
    people_count: peopleCount,
    needs_availability_lookup: Boolean(raw.needs_availability_lookup),
    confidence:
      typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
        ? raw.confidence
        : DEFAULT_INTENT.confidence,
    missing_fields: Array.isArray(raw.missing_fields) ? raw.missing_fields.map(String) : [],
    should_handoff: Boolean(raw.should_handoff),
    safety_flags: Array.from(
      new Set([
        ...(Array.isArray(raw.safety_flags) ? raw.safety_flags.map(String) : []),
        ...forbiddenVisibleFields.map((field) => `nlu_visible_copy_field_stripped:${field}`),
      ]),
    ),
  };
}

export class LlmIntentClassifier {
  async classify(message: string): Promise<StructuredIntent> {
    if (process.env.LLM_PROVIDER === "openai" && process.env.OPENAI_API_KEY) {
      return this.classifyWithOpenAi(message);
    }

    return this.classifyWithMock(message);
  }

  classifyWithMock(message: string): StructuredIntent {
    const text = normalize(message);
    const service = findKnowledgeService(text);
    const serviceKey = detectNormalizedServiceKey(service?.id);
    const wantsAvailability = /(horarios?|plazas?|disponibilidad|hay hueco|hueco|fechas?)/.test(text);
    const wantsRegistration = /(reserv|apunt|inscrib|preinscrib|plaza|me interesa|quiero)/.test(text);
    const wantsPayment = /\b(pago|pagar|link|enlace)\b/.test(text);
    const wantsInvoice = /(factura|justificante)/.test(text);
    const cancelOrReschedule =
      /(cancel|anular|darme de baja|darse de baja|\bbaja\b|cambiar(?:\s+de|\s+la)?\s+fecha|cambio(?:\s+de|\s+la)?\s+fecha|reagend|mover(?:\s+la)?\s+cita|no puedo ir|cambiar(?:\s+de|\s+la)?\s+sede)/.test(text);
    const paymentOrInvoiceHandoff = /(devolucion|devolución|factura|justificante|\bpago\b|pagar|link de pago|enlace de pago)/.test(text);
    const stopRequest = /\b(?:stop|parar|no\s+seguir|no\s+me\s+escrib|no\s+quiero\s+mensajes|baja\s+comunicaciones)\b/.test(text);
    const handoff =
      cancelOrReschedule ||
      paymentOrInvoiceHandoff ||
      stopRequest ||
      /(hablar con|persona humana|humano|humana|llamad|equipo|matrona|profesional)/.test(text);
    const reset = /(reiniciar|reset|empezar de cero|borrar conversacion|borrar conversación|volver al bot|modo bot|reanudar bot)/.test(text);
    const privacy = /(privacidad|datos|proteccion de datos|protección de datos|rgpd|consentimiento)/.test(text);
    const selectedSession = /\b(?:opci[oó]n\s*)?([1-9])\b/.test(text) || Boolean(extractDateLike(message));
    const location = detectLocation(text);
    const peopleCount = inferPeopleCount(text);
    const pregnancyWeek = extractNumber(text, /\b(\d{1,2})\s*(semanas|semana)\b/);
    const fullName = extractFullName(message);
    const phone = extractPhone(message);
    const email = extractEmail(message);
    const hasContactData = Boolean(fullName || phone || email || peopleCount);
    const clinicalSignal =
      /(dolor\s+fuerte|sangrado|fiebre|contracciones?|p[eé]rdida\s+de\s+l[ií]quido|mareo\s+fuerte|desmayo|urgente|diagn[oó]stico\s+(?:m[eé]dico|cl[ií]nico|personalizado|de mi|del resultado)|contraindicaci[oó]n|malestar\s+importante|mastitis)/.test(
        text,
      );
    const clinical = clinicalSignal;
    const explicitGeneralInfo = /\b(que es|qué es|info|informaci[oó]n|precio|cu[aá]nto cuesta|cuanto cuesta)\b/.test(text);
    const serviceOnlyReservationRequest = Boolean(
      serviceKey &&
        service?.category === "reservable" &&
        !explicitGeneralInfo &&
        text.trim().length <= 80,
    );

    const slots: MaternalyNluSlots = {
      service_id: service?.id,
      service_name: service?.name,
      normalized_service_key: serviceKey,
      location,
      modality: detectModality(text),
      preferred_date: extractDateLike(message),
      preferred_time: text.includes("mañana") || text.includes("manana")
        ? "morning"
        : text.includes("tarde")
          ? "afternoon"
          : undefined,
      full_name: fullName,
      phone,
      email,
      people_count: peopleCount,
      partner_name: extractPartnerName(message),
      pregnancy_week: pregnancyWeek,
      fpp_or_due_date: /fpp|fecha probable|parto/.test(text) ? extractDateLike(message) : undefined,
      baby_birth_date: /beb[eé]|nacimiento/.test(text) ? extractDateLike(message) : undefined,
      observations: text.includes("prueba_bot_codex_no_cliente_real")
        ? "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL"
        : undefined,
    };

    return validateStructuredIntent({
      intent: reset
        ? "reset"
        : privacy
          ? "privacy_question"
          : handoff
            ? wantsInvoice
              ? "invoice_question"
              : wantsPayment
                ? "payment_question"
                : "handoff_request"
            : wantsInvoice
              ? "invoice_question"
              : wantsPayment && !wantsRegistration
                ? "payment_question"
                : selectedSession && serviceKey
                  ? "registration_slot_selected"
                  : hasContactData
                    ? "registration_data_provided"
                    : serviceKey && (wantsAvailability || wantsRegistration || serviceOnlyReservationRequest)
                      ? "registration_start"
                      : wantsAvailability
                        ? "availability_request"
                        : service
                          ? "service_question"
                          : /^(hola|buenos dias|buenos días|buenas|buenas noches|kaixo|hello)\b/.test(text)
                            ? "greeting"
                            : text.trim()
                              ? "general_info"
                              : "unknown",
      slots,
      service_candidate: service?.id,
      location_preference: location,
      venue_preference:
        location && ["up&you", "hydra", "beup"].includes(location) ? location : undefined,
      time_preference: slots.preferred_time,
      pregnancy_week: pregnancyWeek,
      people_count: peopleCount,
      needs_availability_lookup: Boolean(
        serviceKey && (wantsAvailability || wantsRegistration || selectedSession || serviceOnlyReservationRequest),
      ),
      confidence: service || reset || privacy || handoff ? 0.82 : hasContactData ? 0.65 : 0.45,
      missing_fields: [],
      should_handoff: handoff || clinical === true,
      safety_flags: [
        cancelOrReschedule ? "handoff_cancel_or_reschedule" : "",
        paymentOrInvoiceHandoff ? "handoff_payment_or_invoice" : "",
        stopRequest ? "stop_requested_no_follow_up" : "",
        service?.id === "aipap_agua" ? "pool_access_justification_required" : "",
        clinical ? "clinical_or_diagnostic_escalation" : "",
      ].filter(Boolean),
    });
  }

  private async classifyWithOpenAi(message: string): Promise<StructuredIntent> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: MATERNALY_OPENAI_SYSTEM_PROMPT,
          },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      return this.classifyWithMock(message);
    }

    const payload = (await response.json()) as { output_text?: string };
    try {
      return validateStructuredIntent(JSON.parse(payload.output_text ?? "{}"));
    } catch {
      return this.classifyWithMock(message);
    }
  }
}

export class MaternalyConversationInterpreter {
  constructor(private readonly classifier = new LlmIntentClassifier()) {}

  async interpret(message: string): Promise<StructuredIntent> {
    return this.classifier.classify(message);
  }
}

export class ConversationStateReducer {
  reduce(previous: StructuredIntent | null, next: StructuredIntent): StructuredIntent {
    return validateStructuredIntent({
      ...previous,
      ...next,
      slots: {
        ...(previous?.slots ?? {}),
        ...Object.fromEntries(
          Object.entries(next.slots).filter(([, value]) => value !== undefined && value !== ""),
        ),
      },
      missing_fields: Array.from(new Set([...(previous?.missing_fields ?? []), ...next.missing_fields])),
      safety_flags: Array.from(new Set([...(previous?.safety_flags ?? []), ...next.safety_flags])),
    });
  }
}

export class SafeToolRouter {
  route(intent: StructuredIntent): "availability_lookup" | "write_plan" | "handoff" | "reply_only" | "reset" {
    if (intent.intent === "reset") {
      return "reset";
    }

    if (intent.should_handoff || intent.intent === "handoff_request") {
      return "handoff";
    }

    if (intent.needs_availability_lookup && intent.confidence >= 0.65) {
      return "availability_lookup";
    }

    return "reply_only";
  }
}
