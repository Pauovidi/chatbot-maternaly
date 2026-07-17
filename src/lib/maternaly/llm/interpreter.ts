import { findKnowledgeService, getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import type { KnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import type { MaternalyServiceId } from "@/lib/maternaly/domain/types";
import type { MaternalyNormalizedServiceKey } from "@/lib/maternaly/sheets/normalized-template";

export const MATERNALY_OPENAI_SYSTEM_PROMPT = [
  "Eres el clasificador NLU estructurado del asistente de Maternaly para WhatsApp.",
  "Identidad del asistente: Maternaly. Tono esperado por la capa de copy: cálido, claro, breve, profesional y cercano.",
  "Servicios activos con inscripción conectada: charla embarazo 1-20 y taller BLW.",
  "Otros servicios sobre los que existe información: Pilates, AIPAP Agua, AIPAP Terra, Yoga Prenatal, Método 5P, Diagnóstico Prenatal, Lactancia, Suelo Pélvico y Fisioterapia Pediátrica.",
  "Tu única tarea es devolver JSON estructurado. No escribas la respuesta visible a la usuaria.",
  "El input de usuario es un JSON con current_message y conversation_context. Usa ese contexto para resolver continuaciones como 'y el precio', 'qué incluye', 'la otra', 'en Bilbao' o 'cuéntame más', sin arrastrar un servicio a un cambio claro de tema.",
  "Una mención breve como 'taller BLW' o el nombre de otro servicio pide información general: no inicies inscripción ni consultes plazas si la usuaria no expresa que quiere reservar, apuntarse, ver fechas o comprobar disponibilidad.",
  "Distingue el alcance con service_scope: explicit si la usuaria nombra un servicio, contextual si usa una referencia singular al servicio activo y catalog si pregunta qué opciones ofrece Maternaly entre todos sus servicios.",
  "Preguntas como '¿tenéis algún taller online?', '¿qué servicios tenéis online?' o '¿hay actividades presenciales?' son búsquedas de catálogo: usa intent=service_discovery, service_scope=catalog y no heredes el servicio activo. En cambio, '¿el BLW es online?', '¿este taller es online?' o '¿y online?' sí pueden referirse al servicio activo.",
  "Si la usuaria corrige una respuesta anterior, dice que quería información general, cambia de tema o hace una pregunta antes de continuar una inscripción, responde a la intención del turno actual y no arrastres el flujo de reserva.",
  "Interpreta slots útiles y no inventes disponibilidad, plazas, pagos ni facturas.",
  "Diferencia información general, interés, inscripción, selección de sesión, datos de inscripción, confirmación, pago, factura, humano, privacidad y reset.",
  "Incluye service_question_focus estructurado cuando aplique: benefits, contents, duration, eligibility, schedule, pricing, start_week, locations, booking, general, clinical_risk o unknown.",
  "Si falta un dato, márcalo en missing_fields; no te bloquees ni inventes datos.",
  "Dudas clínicas o diagnósticas deben marcar should_handoff=true.",
  "Cancelaciones, cambios de fecha o sede, reagendamientos, devoluciones, pagos, facturas y justificantes deben marcar should_handoff=true.",
  "JSON schema: { intent, slots, service_question_focus, needs_availability_lookup, confidence, missing_fields, should_handoff, safety_flags }.",
].join(" ");

export interface MaternalyInterpretationContext {
  active_service_id?: MaternalyServiceId;
  active_service_name?: string;
  active_normalized_service_key?: MaternalyNormalizedServiceKey;
  active_stage?: string;
  location?: string;
  modality?: "presencial" | "online";
  recent_messages?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}

export type MaternalyIntent =
  | "greeting"
  | "general_info"
  | "service_discovery"
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

export type MaternalyServiceScope = "explicit" | "contextual" | "catalog" | "unknown";

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
  service_scope: MaternalyServiceScope;
  service_candidate?: string;
  service_question_focus: MaternalyServiceQuestionFocus;
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

export type MaternalyServiceQuestionFocus =
  | "benefits"
  | "contents"
  | "duration"
  | "eligibility"
  | "schedule"
  | "pricing"
  | "start_week"
  | "locations"
  | "booking"
  | "general"
  | "clinical_risk"
  | "unknown";

const DEFAULT_INTENT: StructuredIntent = {
  intent: "unknown",
  slots: {},
  service_scope: "unknown",
  service_question_focus: "unknown",
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
  "service_discovery",
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

const ALLOWED_SERVICE_QUESTION_FOCUS: MaternalyServiceQuestionFocus[] = [
  "benefits",
  "contents",
  "duration",
  "eligibility",
  "schedule",
  "pricing",
  "start_week",
  "locations",
  "booking",
  "general",
  "clinical_risk",
  "unknown",
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function asksForGeneralOverview(text: string): boolean {
  return /\b(?:info|informacion|informacion general|vision general|que me puedes contar|cuentame sobre|hablame de|de que va en general)\b/.test(
    text,
  );
}

function asksForCatalogModality(text: string, alternativeToExplicitService = false): boolean {
  if (!/\b(?:online|presencial(?:es)?)\b/.test(text)) {
    return false;
  }

  const serviceKind = /\b(?:taller(?:es)?|actividad(?:es)?|servicio(?:s)?|curso(?:s)?|charla(?:s)?|clase(?:s)?|opcion(?:es)?)\b/;
  const pluralKind = /\b(?:talleres|actividades|servicios|cursos|charlas|clases|opciones)\b/;
  const providerVerb = /\b(?:teneis|hay|ofreceis|impartis|haceis|contais\s+con)\b/;
  const globalMarker = /\b(?:algun(?:a|os|as)?|algo|que|cual(?:es)?|aparte|ademas|otr[ao]s?)\b/;
  const singularAnaphora =
    /\b(?:este|esta|ese|esa|aquel|aquella|el|la)\s+(?:taller|actividad|servicio|curso|charla|clase)\b/;

  if (singularAnaphora.test(text) && !alternativeToExplicitService) {
    return false;
  }

  return (
    (globalMarker.test(text) && (serviceKind.test(text) || providerVerb.test(text))) ||
    pluralKind.test(text) ||
    (providerVerb.test(text) && serviceKind.test(text))
  );
}

function asksForCatalogOverview(text: string, alternativeToExplicitService = false): boolean {
  const trimmed = text.replace(/[¡!¿?.,;:]/g, " ").replace(/\s+/g, " ").trim();
  const pluralKind = /\b(?:talleres|actividades|servicios|cursos|charlas|clases|opciones)\b/;
  if (pluralKind.test(trimmed) && trimmed.split(" ").length <= 2) {
    return true;
  }

  const providerVerb = /\b(?:teneis|hay|ofreceis|impartis|haceis|contais\s+con)\b/;
  const globalMarker = /\b(?:que|cual(?:es)?|algun(?:a|os|as)?|lista|ver|mostrar|aparte|ademas|otr[ao]s?)\b/;
  const singularAnaphora =
    /\b(?:este|esta|ese|esa|aquel|aquella|el|la)\s+(?:taller|actividad|servicio|curso|charla|clase)\b/;
  if (singularAnaphora.test(text) && !alternativeToExplicitService) {
    return false;
  }

  return pluralKind.test(text) && (providerVerb.test(text) || globalMarker.test(text));
}

function asksForAlternativeCatalog(
  text: string,
  explicitService: KnowledgeService | null,
): boolean {
  if (!explicitService) {
    return false;
  }

  return explicitService.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    let aliasIndex = text.indexOf(normalizedAlias);

    while (aliasIndex >= 0) {
      const before = text.slice(Math.max(0, aliasIndex - 100), aliasIndex);
      const after = text.slice(aliasIndex + normalizedAlias.length, aliasIndex + normalizedAlias.length + 30);
      const serviceKind = "(?:taller|actividad|servicio|curso|charla|clase)";
      const article = "(?:l|\\s+(?:la|los|las))?";
      const excludesBefore = new RegExp(
        `(?:\\b(?:ademas|aparte|fuera)\\s+de${article}|\\b(?:excepto|salvo)\\s+|\\bsin\\s+contar(?:\\s+con)?(?:\\s+(?:a|al|el|la))?\\s+|\\b(?:distint[ao]s?|diferente(?:s)?)\\s+de${article}|\\bno\\s+me\\s+refiero\\s+(?:a|al)|\\b(?:que|pero)\\s+no\\s+sea(?:n)?)\\s*(?:${serviceKind}\\s+)?$`,
      ).test(before);
      const alternativeBefore = new RegExp(
        `\\balternativ[ao]s?\\b[^.;!?]{0,60}\\b(?:a|al)\\s+(?:${serviceKind}\\s+)?$`,
      ).test(before);
      const excludesAfter = /^\s*(?:aparte|no|descartad[oa]s?)\b/.test(after);

      if (excludesBefore || alternativeBefore || excludesAfter) {
        return true;
      }

      aliasIndex = text.indexOf(normalizedAlias, aliasIndex + normalizedAlias.length);
    }

    return false;
  });
}

function isPureGreeting(text: string): boolean {
  const normalized = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/\b(?:hola|kaixo|hello|buen dia|buenos dias|buenas tardes|buenas noches|buenas)\b/.test(normalized)) {
    return false;
  }

  return normalized
    .replace(
      /\b(?:muchas gracias|gracias|muy|de nuevo|a tod[oa]s?|hola|kaixo|hello|buen dia|buenos dias|buenas tardes|buenas noches|buenas|que tal|como estas|como va|todo bien)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim() === "";
}

export function isMaternalyResetRequest(text: string): boolean {
  const compact = normalize(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const command =
    "(?:reiniciar|reinicia|reset|resetear|empezar de cero|borrar (?:la )?conversacion|volver al bot|modo bot|reanudar (?:el )?bot)";
  const mentionsWithoutRequest = new RegExp(
    `\\b(?:no\\s+(?:(?:quiero|necesito|deseo|pretendo|vamos a|hace falta)\\s+)?|sin\\s+|como\\s+|saber\\s+como\\s+|que\\s+pasa\\s+si\\s+)${command}\\b`,
  );
  if (mentionsWithoutRequest.test(compact)) {
    return false;
  }

  const directCommand = new RegExp(`^(?:por favor\\s+)?${command}(?:\\s+por favor)?$`);
  const explicitRequest = new RegExp(
    `\\b(?:quiero|necesito|puedes|podrias|haz|vamos a)\\b(?:\\s+\\w+){0,4}\\s+${command}\\b`,
  );
  return directCommand.test(compact) || explicitRequest.test(compact);
}

function correctsAnAvailabilityAnswer(text: string): boolean {
  return (
    /\b(?:me has dado|me diste|me has enviado|me has mandado)\b.*\b(?:plazas|fechas|horarios|opciones)\b/.test(
      text,
    ) ||
    /\b(?:no te pedi|no te pedia|no queria|cuando te pedi|antes de (?:eso|esto))\b.*\b(?:plazas|fechas|reserv|info|informacion)\b/.test(
      text,
    ) ||
    /\b(?:info|informacion)\s+en\s+general\b/.test(text)
  );
}

function isBareServiceMention(
  text: string,
  service: ReturnType<typeof findKnowledgeService>,
): boolean {
  if (!service) {
    return false;
  }

  const compactText = text.replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  return service.aliases.some((alias) => compactText === normalize(alias));
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

function validServiceQuestionFocus(value: unknown): MaternalyServiceQuestionFocus {
  return ALLOWED_SERVICE_QUESTION_FOCUS.includes(value as MaternalyServiceQuestionFocus)
    ? (value as MaternalyServiceQuestionFocus)
    : "unknown";
}

function detectServiceQuestionFocus(input: {
  text: string;
  service?: ReturnType<typeof findKnowledgeService>;
  clinical: boolean;
  wantsAvailability: boolean;
  wantsBooking: boolean;
  wantsPricing: boolean;
}): MaternalyServiceQuestionFocus {
  const { text, service, clinical, wantsAvailability, wantsBooking, wantsPricing } = input;

  if (clinical) {
    return "clinical_risk";
  }

  if (/\b(?:cu[aá]nto dura|duraci[oó]n|cu[aá]ntas horas|de qu[eé] hora a qu[eé] hora)\b/.test(text)) {
    return "duration";
  }

  if (
    /\b(?:qu[eé] incluye|qu[eé] se ve|qu[eé] se trata|de qu[eé] va|de qu[eé] habl[aá]is|contenidos?|temas?|qu[eé] aprender|qu[eé] ense[nñ][aá]is)\b/.test(
      text,
    )
  ) {
    return "contents";
  }

  if (
    /\b(?:para qui[eé]n|es para m[ií]|es para nosotr[oa]s?|puedo ir|puedo hacerlo|requisitos?|edad del beb[eé]|beb[eé]s?\s+de\s+\d+\s+meses|meses tiene|mi beb[eé] tiene|puede venir mi pareja|acompa[nñ]ante)\b/.test(
      text,
    )
  ) {
    return "eligibility";
  }

  if (/\b(?:desde\s+qu[eé]\s+semana|semana\s+14|cu[aá]ndo\s+puedo\s+empezar|hasta\s+el\s+final)\b/.test(text)) {
    return "start_week";
  }

  if (
    wantsPricing ||
    /\b(?:precio|precios|tarifa|tarifas|cu[aá]nto cuesta|cuanto cuesta|qu[eé] vale|cu[aá]nto sale|coste)\b|€/.test(
      text,
    )
  ) {
    return "pricing";
  }

  if (
    wantsAvailability ||
    /\b(?:horario|horarios|d[ií]as|clases|turnos|cu[aá]ndo es|pr[oó]xima|pr[oó]ximo)\b/.test(text)
  ) {
    return "schedule";
  }

  if (
    /\b(?:beneficios?|para qu[eé] sirve|qu[eé]\s+trabaja|qu[eé] me aporta|me aporta|ayuda|mejora)\b/.test(
      text,
    )
  ) {
    return "benefits";
  }

  if (wantsBooking) {
    return "booking";
  }

  if (
    service &&
    /\b(?:d[oó]nde|sede|sedes|ubicaci[oó]n|bilbao|erandio|online|presencial|modalidad)\b/.test(
      text,
    )
  ) {
    return "locations";
  }

  return service ? "general" : "unknown";
}

function isContextualContinuation(text: string): boolean {
  return (
    /^(?:s[ií]|vale|ok|perfecto|genial|bien)?[,\s]*(?:cu[eé]ntame|dime|expl[ií]came)(?:\s+m[aá]s)?[.!?]*$/.test(
      text.trim(),
    ) ||
    /^(?:y|pero)?\s*(?:el|la|los|las)?\s*(?:precio|coste|horario|duraci[oó]n|contenido|requisitos?|beneficios?|ubicaci[oó]n|sede)[?!.\s]*$/.test(
      text.trim(),
    ) ||
    /^(?:y\s+)?(?:en\s+)?(?:bilbao|erandio|online)[?!.\s]*$/.test(text.trim())
  );
}

function alternateActiveService(
  activeServiceId: MaternalyServiceId | undefined,
): ReturnType<typeof getKnowledgeService> {
  if (activeServiceId === "taller_blw") {
    return getKnowledgeService("charla_embarazo_1_20");
  }

  if (activeServiceId === "charla_embarazo_1_20") {
    return getKnowledgeService("taller_blw");
  }

  return null;
}

const MATERNALY_STRUCTURED_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ALLOWED_INTENTS },
    slots: {
      type: "object",
      additionalProperties: true,
    },
    service_candidate: { type: ["string", "null"] },
    service_scope: {
      type: "string",
      enum: ["explicit", "contextual", "catalog", "unknown"],
    },
    service_question_focus: { type: "string", enum: ALLOWED_SERVICE_QUESTION_FOCUS },
    location_preference: { type: ["string", "null"] },
    venue_preference: { type: ["string", "null"] },
    time_preference: { type: ["string", "null"] },
    pregnancy_week: { type: ["number", "null"] },
    people_count: { type: ["number", "null"] },
    needs_availability_lookup: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    missing_fields: { type: "array", items: { type: "string" } },
    should_handoff: { type: "boolean" },
    safety_flags: { type: "array", items: { type: "string" } },
  },
  required: [
    "intent",
    "slots",
    "service_scope",
    "service_candidate",
    "service_question_focus",
    "location_preference",
    "venue_preference",
    "time_preference",
    "pregnancy_week",
    "people_count",
    "needs_availability_lookup",
    "confidence",
    "missing_fields",
    "should_handoff",
    "safety_flags",
  ],
} as const;

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

  if (/\bpresencial(?:es)?\b/.test(text) || /\bbilbao\b|\berandio\b/.test(text)) {
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
  const serviceScope: MaternalyServiceScope =
    raw.service_scope === "explicit" ||
    raw.service_scope === "contextual" ||
    raw.service_scope === "catalog" ||
    raw.service_scope === "unknown"
      ? raw.service_scope
      : "unknown";
  const locationPreference = compact(raw.location_preference) ?? slots.location;
  const peopleCount = validPeopleCount(raw.people_count) ?? slots.people_count;
  const pregnancyWeek = validPregnancyWeek(raw.pregnancy_week) ?? slots.pregnancy_week;
  const safetyFlags = Array.from(
    new Set([
      ...(Array.isArray(raw.safety_flags) ? raw.safety_flags.map(String) : []),
      ...forbiddenVisibleFields.map((field) => `nlu_visible_copy_field_stripped:${field}`),
    ]),
  );
  const rawFocus = raw.service_question_focus ?? raw.question_focus;
  const serviceQuestionFocus = safetyFlags.includes("clinical_or_diagnostic_escalation")
    ? "clinical_risk"
    : validServiceQuestionFocus(rawFocus);

  return {
    ...DEFAULT_INTENT,
    intent: ALLOWED_INTENTS.includes(intent) ? intent : "unknown",
    slots,
    service_scope: serviceScope,
    service_candidate: serviceCandidate,
    service_question_focus: serviceQuestionFocus,
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
    safety_flags: safetyFlags,
  };
}

export class LlmIntentClassifier {
  async classify(
    message: string,
    context: MaternalyInterpretationContext = {},
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<StructuredIntent> {
    if (env.LLM_PROVIDER === "openai" && env.OPENAI_API_KEY) {
      return this.classifyWithOpenAi(message, context, env);
    }

    return this.classifyWithMock(message, context);
  }

  classifyWithMock(
    message: string,
    context: MaternalyInterpretationContext = {},
  ): StructuredIntent {
    const text = normalize(message);
    const explicitService = findKnowledgeService(text);
    const alternativeCatalogQuery = asksForAlternativeCatalog(text, explicitService);
    const catalogFilterContinuation =
      context.active_stage === "collecting_service" &&
      /^[¿¡]?(?:y\s+)?(?:en\s+)?(?:online|presencial(?:es)?)[?!.,;:\s]*$/.test(text.trim());
    const catalogModalityQuery =
      (catalogFilterContinuation ||
        asksForCatalogModality(text, alternativeCatalogQuery) ||
        asksForCatalogOverview(text, alternativeCatalogQuery)) &&
      (!explicitService || alternativeCatalogQuery);
    const pureGreeting = isPureGreeting(text);
    const asksForOtherActiveService = /\b(?:la|el)\s+otr[ao]\b/.test(text);
    const contextualService =
      catalogModalityQuery || pureGreeting
        ? null
        : asksForOtherActiveService
        ? alternateActiveService(context.active_service_id)
        : isContextualContinuation(text) ||
            asksForGeneralOverview(text) ||
            correctsAnAvailabilityAnswer(text) ||
            /\b(?:cu[aá]nto dura|duraci[oó]n|cu[aá]ntas horas|qu[eé] incluye|qu[eé] se ve|de qu[eé] va|contenidos?|temas?|para qui[eé]n|es para m[ií]|puedo ir|requisitos?|precio|precios|tarifa|tarifas|qu[eé] vale|cu[aá]nto sale|coste|horarios?|d[ií]as|pr[oó]xim[ao]s?|ediciones?|beneficios?|d[oó]nde|sede|bilbao|erandio|online)\b/.test(
              text,
            )
          ? getKnowledgeService(context.active_service_id)
          : null;
    const service = catalogModalityQuery ? null : explicitService ?? contextualService;
    const serviceScope: MaternalyServiceScope = catalogModalityQuery
      ? "catalog"
      : explicitService
        ? "explicit"
        : contextualService
          ? "contextual"
          : "unknown";
    const serviceKey = detectNormalizedServiceKey(service?.id);
    const wantsAvailability =
      /(horarios?|plazas?|disponibilidad|hay hueco|hueco|fechas?|qu[eé] d[ií]as|cu[aá]ndo es|pr[oó]xima|pr[oó]ximo|siguiente)/.test(
        text,
      );
    const wantsRegistration =
      /(reserv|apunt|inscrib|preinscrib|plaza|me interesa|quiero ir|quiero asistir|me gustar[ií]a asistir|gu[aá]rdame)/.test(
        text,
      );
    const wantsBookingFocus =
      /(reserv|apunt|inscrib|preinscrib|plaza|quiero ir|quiero asistir|me gustar[ií]a asistir|gu[aá]rdame)/.test(
        text,
      );
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
    const reset = isMaternalyResetRequest(text);
    const privacy = /(privacidad|datos|proteccion de datos|protección de datos|rgpd|consentimiento)/.test(text);
    const selectedSession = /\b(?:opci[oó]n\s*)?([1-9])\b/.test(text) || Boolean(extractDateLike(message));
    const location = detectLocation(text);
    const asksAboutCompanionEligibility =
      /\b(?:puedo ir con|puede venir|puedo acudir con|admit[ií]s|acept[aá]is)\b.*\b(?:pareja|acompa[nñ]ante)\b/.test(
        text,
      );
    const peopleCount = asksAboutCompanionEligibility ? undefined : inferPeopleCount(text);
    const pregnancyWeek = extractNumber(text, /\b(\d{1,2})\s*(semanas|semana)\b/);
    const fullName = extractFullName(message);
    const phone = extractPhone(message);
    const email = extractEmail(message);
    const hasExplicitContactData = Boolean(fullName || phone || email);
    const clinicalSignal =
      /(dolor\s+fuerte|sangrado|fiebre|contracciones?\s+fuertes?|no\s+noto\s+al\s+beb[eé]|p[eé]rdida\s+de\s+l[ií]quido|mareo\s+fuerte|desmayo|urgente|me\s+encuentro\s+muy\s+mal|diagn[oó]stico\s+(?:m[eé]dico|cl[ií]nico|personalizado|de mi|del resultado)|contraindicaci[oó]n|malestar\s+importante|mastitis)/.test(
        text,
      );
    const clinical = clinicalSignal;
    const serviceQuestionFocus = detectServiceQuestionFocus({
      text,
      service,
      clinical,
      wantsAvailability,
      wantsBooking: wantsBookingFocus,
      wantsPricing:
        wantsPayment ||
        /\b(?:precio|precios|tarifa|tarifas|cu[aá]nto cuesta|cuanto cuesta|qu[eé] vale|cu[aá]nto sale|coste|€)\b/.test(
          text,
        ),
    });
    const hasContactData = Boolean(
      hasExplicitContactData ||
        (peopleCount && ["general", "booking", "unknown"].includes(serviceQuestionFocus)),
    );
    const explicitOverview = asksForGeneralOverview(text);
    const correctionTurn = correctsAnAvailabilityAnswer(text);
    const bareServiceMention = isBareServiceMention(text, explicitService);
    const shouldAnswerWithServiceInformation =
      correctionTurn || explicitOverview || bareServiceMention;
    const shouldStartRegistration = Boolean(
      serviceKey &&
        !shouldAnswerWithServiceInformation &&
        (wantsAvailability || wantsRegistration),
    );
    const stabilizedQuestionFocus = catalogModalityQuery
      ? "locations"
      : correctionTurn || explicitOverview
        ? "general"
        : serviceQuestionFocus;

    const slots: MaternalyNluSlots = {
      service_id: service?.id,
      service_name: service?.name,
      normalized_service_key: serviceKey,
      location,
      modality: detectModality(text) ?? (contextualService ? context.modality : undefined),
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
                    : catalogModalityQuery
                      ? "service_discovery"
                    : shouldStartRegistration
                      ? "registration_start"
                      : wantsAvailability && !shouldAnswerWithServiceInformation
                        ? "availability_request"
                        : service
                          ? "service_question"
                          : pureGreeting
                            ? "greeting"
                            : text.trim()
                              ? "general_info"
                              : "unknown",
      slots,
      service_scope: serviceScope,
      service_candidate: service?.id,
      service_question_focus: stabilizedQuestionFocus,
      location_preference: location,
      venue_preference:
        location && ["up&you", "hydra", "beup"].includes(location) ? location : undefined,
      time_preference: slots.preferred_time,
      pregnancy_week: pregnancyWeek,
      people_count: peopleCount,
      needs_availability_lookup: Boolean(
        serviceKey &&
          !shouldAnswerWithServiceInformation &&
          (wantsAvailability || wantsRegistration || selectedSession),
      ),
      confidence: catalogModalityQuery
        ? 0.92
        : service || reset || privacy || handoff
          ? 0.82
          : hasContactData
            ? 0.65
            : 0.45,
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

  private async classifyWithOpenAi(
    message: string,
    context: MaternalyInterpretationContext,
    env: NodeJS.ProcessEnv,
  ): Promise<StructuredIntent> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.LLM_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: MATERNALY_OPENAI_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify({
              current_message: message,
              conversation_context: context,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "maternaly_structured_intent",
            strict: false,
            schema: MATERNALY_STRUCTURED_OUTPUT_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      return this.classifyWithMock(message, context);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
    };
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text" && typeof item.text === "string")
        ?.text;
    try {
      const parsed = validateStructuredIntent(JSON.parse(outputText ?? "{}"));
      const deterministic = this.classifyWithMock(message, context);
      const normalizedMessage = normalize(message);
      const deterministicService = getKnowledgeService(deterministic.service_candidate);
      const mustHonorCurrentTurn =
        deterministic.intent === "reset" ||
        deterministic.intent === "greeting" ||
        deterministic.intent === "service_discovery" ||
        deterministic.service_scope === "catalog" ||
        correctsAnAvailabilityAnswer(normalizedMessage) ||
        asksForGeneralOverview(normalizedMessage) ||
        isBareServiceMention(normalizedMessage, deterministicService) ||
        (deterministic.intent === "service_question" &&
          /\b(?:online|presencial|modalidad)\b/.test(normalizedMessage));

      return mustHonorCurrentTurn ? deterministic : parsed;
    } catch {
      return this.classifyWithMock(message, context);
    }
  }
}

export class MaternalyConversationInterpreter {
  constructor(private readonly classifier = new LlmIntentClassifier()) {}

  async interpret(
    message: string,
    context: MaternalyInterpretationContext = {},
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<StructuredIntent> {
    return this.classifier.classify(message, context, env);
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
