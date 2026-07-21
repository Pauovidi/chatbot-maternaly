import { findKnowledgeService, getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import type { KnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import type { MaternalyServiceId } from "@/lib/maternaly/domain/types";
import type { MaternalyNormalizedServiceKey } from "@/lib/maternaly/sheets/normalized-template";
import {
  MATERNALY_CHARLA_OPTIONS,
  type MaternalyJourneyStage,
} from "@/lib/maternaly/knowledge/charla-informativa-contract";

export const MATERNALY_OPENAI_SYSTEM_PROMPT = [
  "Eres el clasificador NLU estructurado del asistente de Maternaly para WhatsApp.",
  "Identidad del asistente: Maternaly. Tono esperado por la capa de copy: cálido, claro, breve, profesional y cercano.",
  "Servicios activos con inscripción conectada: charla embarazo 1-20 y taller BLW.",
  "Otros servicios sobre los que existe información: Pilates, AIPAP Agua, AIPAP Terra, Yoga Prenatal, Método 5P, Diagnóstico Prenatal, Lactancia, Suelo Pélvico y Fisioterapia Pediátrica.",
  "Al comienzo de una conversación se pregunta por la etapa vital. Si la usuaria elige EMBARAZO, POSTPARTO u OTROS, devuelve intent=service_discovery, service_scope=catalog y slots.journey_stage con embarazo, postparto u otros. No confundas nombres de servicios como 'Pilates embarazo' con una elección de etapa.",
  "Reconoce como charla_embarazo_1_20 las paráfrasis inequívocas de la charla informativa gratuita de las primeras 20 semanas, por ejemplo una sesión gratuita de matronas o la sesión que dan las matronas al comienzo del embarazo.",
  "Si el último mensaje del asistente pregunta si quiere reservar la plaza, interpreta una respuesta afirmativa breve como registration_start y una negativa breve como rechazo contextual; no exijas que repita el nombre del servicio.",
  "La respuesta a esa invitación puede combinar la decisión con una preferencia, por ejemplo 'sí, online', 'vale, Bilbao' o 'de acuerdo, presencial en Erandio': conserva a la vez el consentimiento y los slots literales de sede, modalidad y fecha.",
  "Durante choosing_session, una respuesta breve con Erandio, Bilbao u online elige sede o modalidad y continúa la consulta de disponibilidad; no la conviertas en una pregunta informativa genérica.",
  "Tu única tarea es devolver JSON estructurado. No escribas la respuesta visible a la usuaria.",
  "El input de usuario es un JSON con current_message y conversation_context. Usa ese contexto para resolver continuaciones como 'y el precio', 'qué incluye', 'la otra', 'en Bilbao' o 'cuéntame más', sin arrastrar un servicio a un cambio claro de tema.",
  "Una mención breve como 'taller BLW' o el nombre de otro servicio pide información general: no inicies inscripción ni consultes plazas si la usuaria no expresa que quiere reservar, apuntarse, ver fechas o comprobar disponibilidad.",
  "Expresiones como 'agendar cita', 'pedir cita', 'coger cita' o 'solicitar una cita' expresan intención de reserva aunque todavía no se haya indicado el servicio. Conserva esa intención y pide el servicio; no reinicies la presentación ni vuelvas a preguntar la etapa vital.",
  "Distingue el alcance con service_scope: explicit si la usuaria nombra un servicio, contextual si usa una referencia singular al servicio activo y catalog si pregunta qué opciones ofrece Maternaly entre todos sus servicios.",
  "Preguntas como '¿tenéis algún taller online?', '¿qué servicios tenéis online?' o '¿hay actividades presenciales?' son búsquedas de catálogo: usa intent=service_discovery, service_scope=catalog y no heredes el servicio activo. En cambio, '¿el BLW es online?', '¿este taller es online?' o '¿y online?' sí pueden referirse al servicio activo.",
  "Si la usuaria corrige una respuesta anterior, dice que quería información general, cambia de tema o hace una pregunta antes de continuar una inscripción, responde a la intención del turno actual y no arrastres el flujo de reserva.",
  "Interpreta slots útiles y no inventes disponibilidad, plazas, pagos ni facturas.",
  "Una revelación de contexto personal como el mes o la semana de embarazo no es por sí sola una petición de reserva ni de disponibilidad. Extrae pregnancy_month o pregnancy_week, pero usa needs_availability_lookup=false salvo que el turno pida explícitamente fechas, plazas, reserva o responda a un dato pendiente de una inscripción activa.",
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
  pending_fields?: string[];
  journey_stage?: MaternalyJourneyStage;
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
  journey_stage?: MaternalyJourneyStage;
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
  pregnancy_month?: number;
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
  pregnancy_month?: number;
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

function validJourneyStage(value: unknown): MaternalyJourneyStage | undefined {
  return value === "embarazo" || value === "postparto" || value === "otros"
    ? value
    : undefined;
}

function findParaphrasedCharlaService(text: string): KnowledgeService | null {
  const mentionsInformationalSession =
    /\b(?:charla|sesion|encuentro|reunion|informacion|orientacion)\b/.test(text);
  const mentionsMidwives = /\bmatronas?\b/.test(text);
  const mentionsFreeFormat = /\bgratuit[ao]s?\b/.test(text);
  const mentionsEarlyPregnancy =
    /\b(?:embarazo|embarazada|gestacion)\b/.test(text) &&
    /\b(?:comienzo|inicio|principio|primeras?|1\s*(?:a|-)\s*20|veinte\s+semanas|20\s+semanas)\b/.test(
      text,
    );
  const mentionsFirstTwentyWeeks =
    /\b(?:primeras?\s+)?(?:veinte|20)\s+semanas\b|\bsemanas?\s+(?:1\s*(?:a|-)\s*20|uno\s+a\s+veinte)\b/.test(
      text,
    );

  if (
    mentionsInformationalSession &&
    ((mentionsMidwives && (mentionsFreeFormat || mentionsEarlyPregnancy)) ||
      (mentionsFreeFormat && (mentionsEarlyPregnancy || mentionsFirstTwentyWeeks)) ||
      mentionsFirstTwentyWeeks)
  ) {
    return getKnowledgeService("charla_embarazo_1_20");
  }

  return null;
}

function detectJourneyStage(input: {
  text: string;
  explicitService: KnowledgeService | null;
  context: MaternalyInterpretationContext;
}): MaternalyJourneyStage | undefined {
  const { text, explicitService, context } = input;
  const explicitPregnancyIdentity =
    /\b(?:estoy|soy|me encuentro)\s+embarazada\b/.test(text);
  const gestationalTimingAnswer =
    /\b(?:estoy|voy)\s+(?:de|en|por el|por la)\s+(?:\d{1,2}|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|primer|segundo|tercer|cuarto|quinto|sexto|septimo|octavo|noveno)\s+(?:mes(?:es)?|semanas?)\b/.test(
      text,
    );
  const explicitPregnancyDisclosure =
    explicitPregnancyIdentity ||
    (gestationalTimingAnswer &&
      context.active_stage === "choosing_journey_stage" &&
      !explicitService);
  if (explicitPregnancyDisclosure) {
    return "embarazo";
  }

  if (explicitService || context.active_service_id || context.active_normalized_service_key) {
    return undefined;
  }

  const compactText = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pregnancyChoice =
    /^(?:embarazo|en embarazo|durante el embarazo)$/.test(compactText) ||
    /^(?:(?:ahora\s+)?estoy|me encuentro|soy)?\s*embarazada(?:\s+de\s+(?:\d{1,2}|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|primer|segundo|tercer|cuarto|quinto|sexto|septimo|octavo|noveno)\s+(?:mes(?:es)?|semanas?))?$/.test(
      compactText,
    );
  if (pregnancyChoice) {
    return "embarazo";
  }

  if (
    /^(?:(?:ahora\s+)?estoy\s+en\s+|en\s+)?(?:postparto|posparto)$/.test(compactText) ||
    /^(?:acabo\s+de\s+dar\s+a\s+luz|ya\s+he\s+dado\s+a\s+luz|he\s+dado\s+a\s+luz)$/.test(
      compactText,
    )
  ) {
    return "postparto";
  }

  if (
    /^(?:otros?|otra\s+cosa|ninguna\s+de\s+las\s+dos|ninguna\s+de\s+esas|no\s+es\s+ninguna\s+de\s+las\s+dos)$/.test(
      compactText,
    )
  ) {
    return "otros";
  }

  return undefined;
}

type ReservationCtaAnswer = "yes" | "no";

function hasLiteralSessionPreference(text: string): boolean {
  return Boolean(
    detectLocation(text) ||
      detectModality(text) ||
      extractDateLike(text) ||
      /\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?\b/.test(
        text,
      ) ||
      /\b(?:a\s+)?las\s+\d{1,2}(?::\d{2})?\b/.test(text),
  );
}

function asksForInformationBeforeBooking(text: string): boolean {
  const asksNonAvailabilityInformation =
    /\b(?:precio|precios|cuesta|cuanto\s+vale|coste|incluye|contenido|contenidos|de\s+que\s+va|en\s+que\s+consiste|duracion|cuanto\s+dura|para\s+quien|requisitos?|es\s+en\s+directo|como\s+funciona)\b/.test(
      text,
    );
  const rejectsMentionedPreference =
    /\b(?:pero\s+)?(?:mejor\s+)?no\s+(?:quiero\s+)?(?:(?:en|la|el|de)\s+)*(?:online|presencial|bilbao|erandio)\b/.test(
      text,
    );
  const expressesUncertainty =
    /\b(?:quizas?|quiza|tal\s+vez|no\s+se\s+si|no\s+estoy\s+segur[oa]|puede\s+ser|dudo)\b/.test(
      text,
    );

  return (
    defersBookingForInformation(text) ||
    asksNonAvailabilityInformation ||
    rejectsMentionedPreference ||
    expressesUncertainty
  );
}

function asksToBookAppointment(text: string): boolean {
  return (
    /\b(?:agend|concert|pedir|solicitar|sacar|coger|reservar)\w*\b[^.!?]{0,45}\bcitas?\b/.test(
      text,
    ) ||
    /\bcitas?\b[^.!?]{0,45}\b(?:agend|concert|pedir|solicitar|sacar|coger|reservar)\w*\b/.test(
      text,
    )
  );
}

function isStandaloneSessionPreference(text: string): boolean {
  if (/[?¿]/.test(text) || /\b(?:no|quizas|quiza|tal\s+vez|no\s+se|puede\s+ser)\b/.test(text)) {
    return false;
  }

  const compactText = text
    .replace(/[^\p{L}\p{N}\s:]/gu, " ")
    .replace(/\b(?:por favor|gracias)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^(?:(?:yo\s+)?(?:prefiero|elijo|escojo|quiero|quisiera)\s+|me\s+gustaria\s+|me\s+viene\s+mejor\s+|me\s+quedo\s+con\s+|mejor\s+)?(?:(?:de|en|para)\s+)?(?:la\s+|el\s+)?(?:opcion\s+|modalidad\s+)?(?:(?:de|en|para)\s+)?(?:bilbao|erandio|online|presencial)(?:\s+presencial)?(?:\s+(?:el\s+)?\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?)?$/.test(
      compactText,
    ) ||
    /^(?:bilbao|erandio|online|presencial)\s+me\s+(?:viene|va)\s+mejor$/.test(compactText) ||
    /^(?:el\s+)?\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?$/.test(
      compactText,
    )
  );
}

function reservationCtaAnswer(
  text: string,
  context: MaternalyInterpretationContext,
): ReservationCtaAnswer | undefined {
  const lastAssistantMessage = [...(context.recent_messages ?? [])]
    .reverse()
    .find((entry) => entry.role === "assistant")?.text;
  const awaitingBookingDecision = context.active_stage === "awaiting_booking_decision";
  if (!lastAssistantMessage && !awaitingBookingDecision) {
    return undefined;
  }

  const assistantText = normalize(lastAssistantMessage ?? "");
  const askedToReserve =
    awaitingBookingDecision ||
    /\b(?:quieres|quereis|te gustaria|os gustaria|deseas|deseais)\b[^.!?]{0,55}\b(?:reservar|apuntarte|apuntaros|inscribirte|inscribiros)\b/.test(
      assistantText,
    ) ||
    /\b(?:reservamos|te apunto|os apunto|preparamos la reserva)\b/.test(assistantText);
  if (!askedToReserve) {
    return undefined;
  }

  const compactText = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(?:no|no gracias|ahora no|todavia no|de momento no|por ahora no|no por ahora|prefiero que no|mejor no)$/.test(
      compactText,
    ) ||
    /^(?:no\s+gracias|no\s+por\s+ahora)(?:\s|$)/.test(compactText) ||
    /\b(?:no\s+(?:quiero|deseo|me\s+interesa)|prefiero\s+no|mejor\s+no|todavia\s+no\s+quiero|aun\s+no\s+quiero)\b[^.!?]{0,55}\b(?:reservar|apuntarme|apuntarnos|inscribirme|inscribirnos)\b/.test(
      text,
    )
  ) {
    return "no";
  }

  if (asksForInformationBeforeBooking(text)) {
    return undefined;
  }

  if (
    /^(?:si|si gracias|si por favor|claro|claro que si|vale|de acuerdo|perfecto|por supuesto|adelante|quiero|quiero reservar|me quiero apuntar|me gustaria reservar)$/.test(
      compactText,
    )
  ) {
    return "yes";
  }

  const startsWithAffirmative =
    /^(?:si|claro(?:\s+que\s+si)?|vale|de\s+acuerdo|perfecto|por\s+supuesto|adelante)\b/.test(
      compactText,
    );
  if (
    startsWithAffirmative ||
    (isStandaloneSessionPreference(text) && hasLiteralSessionPreference(compactText))
  ) {
    return "yes";
  }

  return undefined;
}

function defersBookingForInformation(text: string): boolean {
  return (
    /\b(?:no\s+(?:quiero|deseo|necesito|voy\s+a|me\s+interesa)|prefiero\s+no|mejor\s+no)\s+(?:reservar|apuntarme|apuntarnos|inscribirme|inscribirnos)(?:\s+(?:aun|todavia|ahora|de\s+momento|por\s+ahora))?\b/.test(
      text,
    ) ||
    /\bantes\s+de\s+(?:reservar|apuntarme|apuntarnos|inscribirme|inscribirnos)\b[^.!?]{0,100}\b(?:explic|cuent|inform|saber|conocer|duda)/.test(
      text,
    ) ||
    /\b(?:primero|antes)\b[^.!?]{0,80}\b(?:explic|cuent|inform|saber|conocer)\b/.test(text)
    ||
    /\b(?:primero|antes(?:\s+de\s+(?:reservar|apuntarme|apuntarnos|inscribirme|inscribirnos))?)\b[^.!?]{0,120}\b(?:dime|precio|precios|cuesta|coste|duracion|dura|incluye|contenido|requisitos?|como\s+funciona)\b/.test(
      text,
    ) ||
    /\bsolo\s+queria\s+saber\b[^.!?]{0,100}\b(?:horario|horarios|precio|precios|cuesta|coste|duracion|dura|incluye|contenido|modalidad|online|presencial)\b/.test(
      text,
    )
  );
}

function isAvailabilityPreferenceContinuation(
  text: string,
  context: MaternalyInterpretationContext,
): boolean {
  if (context.active_stage !== "choosing_session" || !detectModality(text)) {
    return false;
  }

  const compactText = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\bpor favor\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:(?:yo\s+)?(?:prefiero|elijo|escojo|quiero|mejor)\s+|me\s+viene\s+mejor\s+|me\s+quedo\s+con\s+)?(?:la\s+)?(?:opcion\s+)?(?:de\s+|en\s+|para\s+)?(?:bilbao|erandio|online|presencial)(?:\s+presencial)?$/.test(
    compactText,
  );
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

function validPregnancyMonth(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 && number <= 9 ? number : undefined;
}

function extractPregnancyMonth(text: string): number | undefined {
  const numeric = extractNumber(
    text,
    /\b(?:estoy|embarazad[ao]|embarazo|gestacion|gestando|voy)\b[^.!?]{0,40}\b(?:de|en|por el|por la)?\s*(\d)\s*(?:º|°)?\s*mes(?:es)?\b/,
  );
  if (numeric) {
    return validPregnancyMonth(numeric);
  }

  const monthWords: Record<string, number> = {
    un: 1,
    uno: 1,
    primer: 1,
    primero: 1,
    dos: 2,
    segundo: 2,
    tres: 3,
    tercer: 3,
    tercero: 3,
    cuatro: 4,
    cuarto: 4,
    cinco: 5,
    quinto: 5,
    seis: 6,
    sexto: 6,
    siete: 7,
    septimo: 7,
    ocho: 8,
    octavo: 8,
    nueve: 9,
    noveno: 9,
  };
  const match = text.match(
    /\b(?:estoy|embarazad[ao]|embarazo|gestacion|gestando|voy)\b[^.!?]{0,40}\b(?:de|en|por el|por la)?\s*(un|uno|primer|primero|dos|segundo|tres|tercer|tercero|cuatro|cuarto|cinco|quinto|seis|sexto|siete|septimo|ocho|octavo|nueve|noveno)\s+mes(?:es)?\b/,
  );
  return match?.[1] ? monthWords[match[1]] : undefined;
}

function isGestationalContextDisclosure(text: string): boolean {
  const hasGestationalContext = Boolean(
    extractPregnancyMonth(text) ??
      extractNumber(
        text,
        /\b(?:estoy|embarazad[ao]|embarazo|gestacion|gestando|voy|tengo)\b[^.!?]{0,40}\b(\d{1,2})\s*(?:semanas?|sem)\b/,
      ),
  );
  const requestsTransaction =
    /\b(?:horarios?|plazas?|disponibilidad|hay hueco|fechas?|cu[aá]ndo es|pr[oó]xima|reserv|apunt|inscrib|preinscrib|quiero ir|quiero asistir|gu[aá]rdame)\b/.test(
      text,
    );
  return hasGestationalContext && !requestsTransaction;
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
    /^(?:y\s+)?(?:en\s+)?(?:bilbao|erandio|online)[?!.\s]*$/.test(text.trim()) ||
    /^(?:(?:si|vale|perfecto)[,\s]+)?(?:(?:me\s+)?(?:quiero|gustaria|interesa)\s+)?(?:reservar|apuntar(?:me)?|inscribir(?:me)?|asistir|ir)(?:\s+(?:ya|ahora))?[.!?]*$/.test(
      text.trim(),
    )
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
    pregnancy_month: { type: ["number", "null"] },
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
    "pregnancy_month",
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
  if (
    /\ben\s+pareja\b|\b(?:somos|iremos|vamos|acudiremos|vendremos|seremos)\s+(?:los\s+)?dos\b|\b(?:dos|2)\s*(?:personas?|asistentes?)\b/.test(
      text,
    )
  ) {
    return 2;
  }

  if (
    /\b(?:una|1)\s*(?:persona|asistente)\b|\b(?:voy|ire|vengo|acudire|asistire|ira)\s+(?:yo\s+)?sol[ao]\b/.test(
      text,
    )
  ) {
    return 1;
  }

  return extractNumber(text, /\b(\d{1,2})\s*(personas|plazas|asistentes)\b/);
}

function contextualPendingPeopleCount(
  text: string,
  context: MaternalyInterpretationContext,
): number | undefined {
  if (
    context.active_stage !== "collecting_contact" ||
    !context.pending_fields?.includes("peopleCount")
  ) {
    return undefined;
  }

  const compactText = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:1|una|uno)$/.test(compactText)) {
    return 1;
  }
  if (/^(?:2|dos)$/.test(compactText)) {
    return 2;
  }
  return undefined;
}

function detectCharlaCtaTimePreference(
  text: string,
  serviceId: string | undefined,
  reservationAnswer: ReservationCtaAnswer | undefined,
) {
  if (serviceId !== "charla_embarazo_1_20" || reservationAnswer !== "yes") {
    return undefined;
  }

  const explicitTime =
    text.match(/\ba\s+las\s+(\d{1,2})(?::(\d{2}))?\b/) ??
    text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!explicitTime) {
    return undefined;
  }

  const startTime = `${explicitTime[1].padStart(2, "0")}:${explicitTime[2] ?? "00"}`;
  return MATERNALY_CHARLA_OPTIONS.find((option) => option.startTime === startTime);
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
  const pregnancyMonth = validPregnancyMonth(raw.pregnancy_month);

  return {
    service_id: service?.id,
    service_name: compact(raw.service_name) ?? service?.name,
    normalized_service_key: normalizedServiceKey,
    journey_stage: validJourneyStage(raw.journey_stage),
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
    pregnancy_month: pregnancyMonth,
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
  const pregnancyMonth = validPregnancyMonth(raw.pregnancy_month) ?? slots.pregnancy_month;
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
    pregnancy_month: pregnancyMonth,
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
    const deterministic = this.classifyWithMock(message, context);
    const isExplicitAgendaLookup = Boolean(
      deterministic.service_candidate &&
        deterministic.needs_availability_lookup &&
        ["registration_start", "availability_request", "registration_slot_selected"].includes(
          deterministic.intent,
        ),
    );

    // Las consultas inequívocas de agenda no necesitan esperar al modelo: ya
    // contienen servicio e intención transaccional y deben responder a tiempo
    // para el webhook de WhatsApp.
    if (isExplicitAgendaLookup) {
      return deterministic;
    }

    if (env.LLM_PROVIDER === "openai" && env.OPENAI_API_KEY) {
      return this.classifyWithOpenAi(message, context, env);
    }

    return deterministic;
  }

  classifyWithMock(
    message: string,
    context: MaternalyInterpretationContext = {},
  ): StructuredIntent {
    const text = normalize(message);
    const explicitService = findKnowledgeService(text) ?? findParaphrasedCharlaService(text);
    const journeyStage = detectJourneyStage({ text, explicitService, context });
    const contextualReservationAnswer = reservationCtaAnswer(text, context);
    const pendingPeopleCount = contextualPendingPeopleCount(text, context);
    const activeContextService = getKnowledgeService(
      context.active_service_id ?? context.active_normalized_service_key,
    );
    const charlaTimePreference = detectCharlaCtaTimePreference(
      text,
      (explicitService ?? activeContextService)?.id,
      contextualReservationAnswer,
    );
    const location =
      detectLocation(text) ?? (normalize(charlaTimePreference?.location ?? "") || undefined);
    const modality = detectModality(text) ?? charlaTimePreference?.modality;
    const availabilityPreferenceContinuation = isAvailabilityPreferenceContinuation(text, context);
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
    const compactSessionChoice = text.replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
    const selectedSession =
      pendingPeopleCount === undefined &&
      (/\bopci[oó]n\s*([1-9])\b/.test(text) ||
        /^[1-9]$/.test(compactSessionChoice) ||
        Boolean(extractDateLike(message)) ||
        /\b\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?\b/.test(
          text,
        ));
    const selectsActiveSession = context.active_stage === "choosing_session" && selectedSession;
    const contextualService =
      catalogModalityQuery || pureGreeting || journeyStage
        ? null
        : asksForOtherActiveService
        ? alternateActiveService(context.active_service_id)
        : contextualReservationAnswer ||
            selectsActiveSession ||
            availabilityPreferenceContinuation ||
            isContextualContinuation(text) ||
            asksForGeneralOverview(text) ||
            correctsAnAvailabilityAnswer(text) ||
            /\b(?:cu[aá]nto dura|duraci[oó]n|cu[aá]ntas horas|qu[eé] incluye|qu[eé] se ve|de qu[eé] va|contenidos?|temas?|para qui[eé]n|es para m[ií]|puedo ir|requisitos?|precio|precios|tarifa|tarifas|qu[eé] vale|cu[aá]nto sale|coste|horarios?|fechas?|plazas?|disponibilidad|d[ií]as|pr[oó]xim[ao]s?|ediciones?|beneficios?|d[oó]nde|sede|bilbao|erandio|online)\b/.test(
              text,
            )
          ? activeContextService
          : null;
    const service = catalogModalityQuery || journeyStage ? null : explicitService ?? contextualService;
    const serviceScope: MaternalyServiceScope = catalogModalityQuery || journeyStage
      ? "catalog"
      : explicitService
        ? "explicit"
        : contextualService
          ? "contextual"
          : "unknown";
    const serviceKey = detectNormalizedServiceKey(service?.id);
    const wantsAvailability =
      /(horarios?|plazas?|disponib(?:ilidad|les?)|hay hueco|hueco|fechas?|qu[eé] d[ií]as|cu[aá]ndo es|pr[oó]xima|pr[oó]ximo|siguiente)/.test(
        text,
      );
    const explicitlyWantsRegistration =
      /(reserv|apunt|inscrib|preinscrib|plaza|me interesa|quiero ir|quiero asistir|me gustar[ií]a asistir|gu[aá]rdame)/.test(
        text,
      ) || asksToBookAppointment(text);
    const selectsServiceForPendingBooking = Boolean(
      context.active_stage === "choosing_booking_service" &&
        explicitService,
    );
    const wantsRegistration =
      explicitlyWantsRegistration ||
      contextualReservationAnswer === "yes" ||
      selectsServiceForPendingBooking;
    const catalogBookingRequest =
      catalogModalityQuery &&
      (wantsRegistration || (wantsAvailability && /\bcitas?\b/.test(text)));
    const wantsBookingFocus = wantsRegistration;
    const wantsPayment = /\b(pago|pagar|link|enlace)\b/.test(text);
    const wantsInvoice = /(factura|justificante)/.test(text);
    const cancelOrReschedule =
      /(cancel|anular|darme de baja|darse de baja|\bbaja\b|cambiar(?:\s+de|\s+la)?\s+fecha|cambio(?:\s+de|\s+la)?\s+fecha|reagend|mover(?:\s+la)?\s+cita|no puedo ir|cambiar(?:\s+de|\s+la)?\s+sede)/.test(text);
    const paymentOrInvoiceHandoff = /(devolucion|devolución|factura|justificante|\bpago\b|pagar|link de pago|enlace de pago)/.test(text);
    const stopRequest = /\b(?:stop|parar|no\s+seguir|no\s+me\s+escrib|no\s+quiero\s+mensajes|baja\s+comunicaciones)\b/.test(text);
    const explicitHumanRequest =
      /\bhablar\s+con\b|\b(?:quiero|necesito|prefiero|puedo|podria)\b[^.!?]{0,55}\b(?:persona\s+humana|human[oa]|equipo|matrona|profesional|alguien)\b|\b(?:llamadme|llamame|que\s+me\s+llame|que\s+me\s+llamen)\b/.test(
        text,
      );
    const handoff =
      cancelOrReschedule ||
      paymentOrInvoiceHandoff ||
      stopRequest ||
      explicitHumanRequest;
    const reset = isMaternalyResetRequest(text);
    const privacy = /(privacidad|datos|proteccion de datos|protección de datos|rgpd|consentimiento)/.test(text);
    const asksAboutCompanionEligibility =
      /\b(?:puedo ir con|puede venir|puedo acudir con|admit[ií]s|acept[aá]is)\b.*\b(?:pareja|acompa[nñ]ante)\b/.test(
        text,
      );
    const peopleCount = asksAboutCompanionEligibility
      ? undefined
      : pendingPeopleCount ?? inferPeopleCount(text);
    const pregnancyWeek = extractNumber(text, /\b(\d{1,2})\s*(semanas|semana)\b/);
    const pregnancyMonth = extractPregnancyMonth(text);
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
    const bookingDeferredForInformation = defersBookingForInformation(text);
    const bareServiceMention = isBareServiceMention(text, explicitService);
    const shouldAnswerWithServiceInformation =
      !selectsServiceForPendingBooking &&
      (correctionTurn || explicitOverview || bareServiceMention || bookingDeferredForInformation);
    const shouldStartRegistration = Boolean(
      serviceKey &&
        !shouldAnswerWithServiceInformation &&
        (wantsAvailability || wantsRegistration || availabilityPreferenceContinuation),
    );
    const stabilizedQuestionFocus = journeyStage
      ? "general"
      : availabilityPreferenceContinuation
        ? "schedule"
        : catalogBookingRequest
          ? "booking"
          : catalogModalityQuery
            ? "locations"
            : correctionTurn ||
                explicitOverview ||
                (bookingDeferredForInformation && serviceQuestionFocus === "booking")
              ? "general"
              : serviceQuestionFocus;

    const slots: MaternalyNluSlots = {
      service_id: service?.id,
      service_name: service?.name,
      normalized_service_key: serviceKey,
      journey_stage: journeyStage,
      location,
      modality: modality ?? (contextualService ? context.modality : undefined),
      preferred_date: extractDateLike(message),
      preferred_time:
        charlaTimePreference?.startTime ??
        (text.includes("mañana") || text.includes("manana")
          ? "morning"
          : text.includes("tarde")
            ? "afternoon"
            : undefined),
      full_name: fullName,
      phone,
      email,
      people_count: peopleCount,
      partner_name: extractPartnerName(message),
      pregnancy_week: pregnancyWeek,
      pregnancy_month: pregnancyMonth,
      fpp_or_due_date: /fpp|fecha probable|parto/.test(text) ? extractDateLike(message) : undefined,
      baby_birth_date: /beb[eé]|nacimiento/.test(text) ? extractDateLike(message) : undefined,
      observations: text.includes("prueba_bot_codex_no_cliente_real")
        ? "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL"
        : undefined,
      consent:
        contextualReservationAnswer === "yes"
          ? true
          : contextualReservationAnswer === "no"
            ? false
            : undefined,
      last_question_answered:
        contextualReservationAnswer === "yes"
          ? "reservation_accepted"
          : contextualReservationAnswer === "no"
            ? "reservation_declined"
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
                : journeyStage
                  ? "service_discovery"
                : selectedSession && serviceKey
                  ? "registration_slot_selected"
                  : availabilityPreferenceContinuation && serviceKey
                    ? "availability_request"
                : contextualReservationAnswer === "yes" && shouldStartRegistration
                  ? "registration_start"
                : hasContactData
                      ? "registration_data_provided"
                      : catalogBookingRequest
                        ? wantsRegistration
                          ? "registration_start"
                          : "availability_request"
                      : wantsRegistration && !service
                        ? "registration_start"
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
      pregnancy_month: pregnancyMonth,
      people_count: peopleCount,
      needs_availability_lookup: Boolean(
        serviceKey &&
          !shouldAnswerWithServiceInformation &&
          (wantsAvailability ||
            wantsRegistration ||
            selectedSession ||
            availabilityPreferenceContinuation),
      ),
      confidence: journeyStage || contextualReservationAnswer || availabilityPreferenceContinuation
        ? 0.96
        : catalogModalityQuery
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3_500);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        signal: controller.signal,
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
    } catch {
      return this.classifyWithMock(message, context);
    } finally {
      clearTimeout(timeoutId);
    }

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
          deterministic.intent === "registration_slot_selected" ||
          (context.active_stage === "choosing_booking_service" &&
            deterministic.service_candidate !== undefined) ||
          deterministic.slots.journey_stage !== undefined ||
          asksToBookAppointment(normalizedMessage) ||
        reservationCtaAnswer(normalizedMessage, context) !== undefined ||
        contextualPendingPeopleCount(normalizedMessage, context) !== undefined ||
        isAvailabilityPreferenceContinuation(normalizedMessage, context) ||
        findParaphrasedCharlaService(normalizedMessage) !== null ||
        defersBookingForInformation(normalizedMessage) ||
        deterministic.service_scope === "catalog" ||
        correctsAnAvailabilityAnswer(normalizedMessage) ||
        isGestationalContextDisclosure(normalizedMessage) ||
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
