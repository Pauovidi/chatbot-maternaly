import {
  getKnowledgeService,
  getKnowledgeServiceByNormalizedKey,
  MATERNALY_KNOWLEDGE_SERVICES,
  type KnowledgeService,
} from "@/lib/maternaly/knowledge/catalog";
import { answerDialogueQuestions } from "@/lib/maternaly/dialogue/answer";
import type { MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";
import type { LookupNormalizedRegistrationResult } from "@/lib/maternaly/sheets/normalized-registration-management";
import {
  MATERNALY_NORMALIZED_SERVICES,
  registrationStatusDomain,
  type MaternalyNormalizedServiceKey,
} from "@/lib/maternaly/sheets/normalized-template";
import type {
  MaternalyServiceQuestionFocus,
  StructuredIntent,
} from "@/lib/maternaly/llm/interpreter";
import {
  MATERNALY_CHARLA_CTA,
  MATERNALY_CHARLA_FACTS,
  MATERNALY_CONTACT,
  MATERNALY_JOURNEY_STAGE_OPTIONS,
  MATERNALY_PREGNANCY_SERVICE_MENU,
  resolveCharlaOption,
  type MaternalyJourneyStage,
} from "@/lib/maternaly/knowledge/charla-informativa-contract";
import {
  MaternalyGroundedCopyGenerator,
  type MaternalyGroundedCopyResult,
  type MaternalyGroundedCopyTurn,
} from "@/lib/maternaly/conversation/grounded-copy-generator";

export type MaternalyCopyAction =
  | "dialogue_response"
  | "silent_human"
  | "reset"
  | "handoff"
  | "cancel_registration"
  | "reservation_status"
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

export interface MaternalyCopyDecision {
  action: MaternalyCopyAction;
  serviceKey?: MaternalyNormalizedServiceKey;
  service?: KnowledgeService | null;
  serviceQuestionFocus?: MaternalyServiceQuestionFocus;
  locationPreference?: string;
  modalityPreference?: "presencial" | "online";
  journeyStage?: MaternalyJourneyStage;
  reason?: string;
}

export interface MaternalyCopyToolResult {
  status:
    | "not_configured"
    | "read_error"
    | "sessions_available"
    | "collecting_fields"
    | "manual_validation_required"
    | "write_result";
  serviceKey: MaternalyNormalizedServiceKey;
  sessions: NormalizedAvailableSession[];
  calendarSessions?: NormalizedAvailableSession[];
  selectedSession?: NormalizedAvailableSession;
  missingFields: string[];
  plan?: {
    blocked: boolean;
    blockedReasons: string[];
    existingRegistrationSheetStatus?: string;
  };
  writeResult?: {
    ok: boolean;
    mode: "dry_run" | "live";
    applied: boolean;
    registrationPersisted?: boolean;
    registrationStatus?: "preinscrita" | "confirmada";
  };
  eligibilityFilter?: {
    applied: boolean;
    excludedSessions: number;
  };
  error?: string;
}

function isConfirmedLiveCharlaWrite(result: MaternalyCopyToolResult): boolean {
  const writeResult = result.writeResult;
  if (!writeResult?.ok || writeResult.mode !== "live") {
    return false;
  }

  const persisted = writeResult.registrationPersisted ?? writeResult.applied;
  const status = writeResult.registrationStatus ?? (writeResult.applied ? "confirmada" : undefined);
  return result.serviceKey === "charla_embarazo_1_20" && persisted && status === "confirmada";
}

export interface MaternalyCopyRenderInput {
  dialogue?: StructuredIntent["dialogue"];
  dialogueUnavailable?: boolean;
  decision: MaternalyCopyDecision;
  state?: MaternalyNormalizedFlowState;
  toolResult?: MaternalyCopyToolResult;
  cancellationResult?: {
    status: "cancelled" | "not_found" | "ambiguous" | "read_error" | "write_unavailable";
  };
  registrationLookupResult?: LookupNormalizedRegistrationResult;
  reminderCancellationStatus?: "cancelled" | "skipped" | "not_pending" | "failed";
  message?: string;
}

export interface MaternalyGroundedCopyRenderInput extends MaternalyCopyRenderInput {
  intent: StructuredIntent;
  recentTurns?: MaternalyGroundedCopyTurn[];
}

function serviceFromDecision(
  decision: MaternalyCopyDecision,
  state?: MaternalyNormalizedFlowState,
) {
  return (
    decision.service ??
    getKnowledgeServiceByNormalizedKey(decision.serviceKey ?? state?.serviceKey) ??
    getKnowledgeService(state?.serviceKey)
  );
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    fullName: "nombre y apellidos",
    phone: "teléfono",
    email: "email",
    peopleCount: "si vienes tú sola o en pareja",
    partnerName: "nombre de la pareja o acompañante",
    fppOrDueDate: "fecha probable de parto",
    babyBirthDate: "fecha de nacimiento del bebé",
  };
  return labels[field] ?? field;
}

function warmNextQuestion(question: string): string {
  return /[🌸💛😊🤰✅🫶]$/.test(question) ? question : `${question} 😊`;
}

function normalizeLocation(value: string | undefined): "bilbao" | "erandio" | undefined {
  const normalized = value?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized?.includes("bilbao")) {
    return "bilbao";
  }

  if (normalized?.includes("erandio")) {
    return "erandio";
  }

  return undefined;
}

function normalizeCopy(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function formatSpanishDate(value: string | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value ?? "fecha pendiente";
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function safeOnlineJoinUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isCorrectionTurn(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    /\b(?:me has dado|me diste|me has enviado|me has mandado)\b.*\b(?:plazas|fechas|horarios|opciones)\b/.test(
      normalized,
    ) ||
    /\b(?:no te pedi|no te pedia|cuando te pedi|info en general|informacion en general)\b/.test(
      normalized,
    )
  );
}

function capitalizeFirst(value: string): string {
  return value ? `${value.charAt(0).toLocaleUpperCase("es")}${value.slice(1)}` : value;
}

function rephraseRepeatedSentence(sentence: string): string {
  const rewritten = sentence
    .replace(/^El taller BLW cuesta\s+/i, "Para el taller BLW, el precio es de ")
    .replace(/^El taller BLW dura\s+/i, "La duración del taller BLW es de ")
    .replace(/^El taller BLW es presencial/i, "El taller BLW se realiza de forma presencial")
    .replace(/^Los talleres BLW son de\s+/i, "El horario de los talleres BLW es de ")
    .replace(/^En el taller BLW se trabajan\s+/i, "El contenido del taller BLW incluye ")
    .replace(
      /^La charla informativa de embarazo es gratuita/i,
      "La charla informativa de embarazo no tiene coste",
    )
    .replace(/^La charla está pensada para\s+/i, "Esta charla va dirigida a ")
    .replace(
      /^La plaza queda confirmada únicamente después de la reserva y el pago validados/i,
      "La plaza solo se confirma cuando la reserva y el pago han sido validados",
    )
    .replace(
      /^Ahora mismo no veo sesiones disponibles/i,
      "En este momento no aparecen sesiones disponibles",
    )
    .replace(/^Claro[,.]?\s*/i, "")
    .replace(/^Perfecto[,.]?\s*/i, "");

  if (rewritten !== sentence) {
    return capitalizeFirst(rewritten);
  }

  if (/^¿.*\?(?:\s*[^\p{L}\p{N}\s]+)?$/u.test(sentence.trim())) {
    const question = sentence
      .replace(/^¿Quieres\s+/i, "Dime si quieres ")
      .replace(/^¿Te interesa\s+/i, "Cuéntame si te interesa ")
      .replace(/^¿Te apetece\s+/i, "Dime si te apetece ")
      .replace(/\?(\s*[^\p{L}\p{N}\s]+)?$/u, ".$1");
    if (question !== sentence) {
      return question;
    }
  }

  return sentence;
}

function contentPreservingAlternatives(reply: string): string[] {
  const sentences = reply
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const reframed = (sentences.length > 0 ? sentences : [reply]).map(rephraseRepeatedSentence);
  const questions = reframed.filter((item) => /\?$/.test(item));
  const facts = reframed.filter((item) => !/\?$/.test(item));
  const ordered = [...facts, ...questions];
  const reframedText = reframed.join(" ");
  const reorderedText = ordered.join(" ");

  return [reframedText, reorderedText].filter(
    (item, index, alternatives) =>
      item.trim() && alternatives.findIndex((candidate) => normalizeCopy(candidate) === normalizeCopy(item)) === index,
  );
}

export function ensureDistinctMaternalyReply(input: {
  reply: string;
  recentAssistantReplies: string[];
  action: MaternalyCopyAction;
  preferredAlternatives?: string[];
}): { reply: string; changed: boolean; duplicateCount: number } {
  const previous = new Set(input.recentAssistantReplies.map(normalizeCopy));
  const normalizedReply = normalizeCopy(input.reply);
  const duplicateCount = input.recentAssistantReplies.filter(
    (item) => normalizeCopy(item) === normalizedReply,
  ).length;

  const repeatableTechnicalActions: MaternalyCopyAction[] = [
    "reset",
    "handoff",
    "cancel_registration",
    "silent_human",
    "privacy",
    "payment",
    "invoice",
  ];
  if (!previous.has(normalizedReply) || repeatableTechnicalActions.includes(input.action)) {
    return { reply: input.reply, changed: false, duplicateCount };
  }

  if (input.action === "greeting") {
    const greetingVariants = [
      "¡Hola de nuevo! Soy Ane, la asistente virtual de Maternaly 😊 Para orientarte bien, dime en qué etapa estás: EMBARAZO, POSTPARTO u OTROS.",
      "¡Aquí estoy! Soy Ane 💛 Puedo informarte y ayudarte a reservar; si algo necesita atención personal, Macarena podrá contactar contigo. ¿Estás en EMBARAZO, POSTPARTO u OTROS?",
      "¡Buenas! Soy Ane, la asistente virtual de Maternaly. Empezamos por tu momento actual: EMBARAZO, POSTPARTO u OTROS. ¿Cuál eliges?",
    ];
    const candidate = greetingVariants.find((item) => !previous.has(normalizeCopy(item)));
    if (candidate) {
      return { reply: candidate, changed: true, duplicateCount };
    }
  }

  for (const candidate of input.preferredAlternatives ?? []) {
    if (!previous.has(normalizeCopy(candidate))) {
      return { reply: candidate, changed: true, duplicateCount };
    }
  }

  for (const candidate of contentPreservingAlternatives(input.reply)) {
    if (!previous.has(normalizeCopy(candidate))) {
      return { reply: candidate, changed: true, duplicateCount };
    }
  }

  // Si ya se han usado también las redacciones alternativas, repetir la
  // respuesta concreta conserva mejor el contexto que sustituirla por un
  // comodín genérico que obligue a la usuaria a explicar de nuevo qué quería.
  return { reply: input.reply, changed: false, duplicateCount };
}

export class MaternalyCopyRenderer {
  constructor(
    private readonly groundedCopyGenerator = new MaternalyGroundedCopyGenerator(),
  ) {}

  async renderGrounded(
    input: MaternalyGroundedCopyRenderInput,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<MaternalyGroundedCopyResult | undefined> {
    if ((input.intent.dialogue || input.intent.dialogueUnavailable) && !["silent_human", "reset", "handoff", "cancel_registration", "reservation_status"].includes(input.decision.action)) {
      return this.renderDialogue(input, env);
    }
    const service = serviceFromDecision(input.decision, input.state);
    const sharesPregnancyContext =
      (input.decision.action === "general" || input.decision.action === "service_info") &&
      Boolean(input.intent.slots.pregnancy_month || input.intent.slots.pregnancy_week) &&
      !input.intent.needs_availability_lookup;
    const safeDraft = sharesPregnancyContext
      ? this.renderPregnancyContext(service)
      : this.render(input);
    if (!safeDraft) {
      return undefined;
    }

    const mustStayDeterministic =
      input.decision.action === "catalog_info" ||
      input.decision.action === "booking_service_selection" ||
      input.decision.action === "cancel_registration" ||
      input.decision.action === "reservation_status" ||
      service?.category === "sensitive" ||
      input.decision.serviceQuestionFocus === "clinical_risk";

    return this.groundedCopyGenerator.generate(
      {
        // The complete catalog stays deterministic so no canonical service can
        // disappear during a stylistic rewrite. Sensitive services stay on the
        // reviewed renderer copy as well.
        action: mustStayDeterministic
          ? `deterministic_${input.decision.action}`
          : input.decision.action,
        safeDraft,
        authorizedFacts: this.buildGroundedFacts(service, input.intent),
        redactedContext: this.buildGroundedContext(service, input.intent),
        recentTurns: input.recentTurns,
      },
      env,
    );
  }

  render(input: MaternalyCopyRenderInput): string | undefined {
    const service = serviceFromDecision(input.decision, input.state);

    switch (input.decision.action) {
      case "silent_human":
        return undefined;
      case "reset":
        return "Listo, conversación reiniciada. Empezamos desde cero. ¿En qué puedo ayudarte?";
      case "cancel_registration":
        if (input.cancellationResult?.status === "cancelled") {
          if (input.reminderCancellationStatus === "not_pending") {
            return "He cancelado tu inscripción y la plaza vuelve a quedar disponible. El recordatorio ya no estaba pendiente y podría encontrarse en proceso de envío, así que es posible que aún recibas ese aviso. El equipo de Maternaly lo revisará.";
          }
          if (input.reminderCancellationStatus === "failed") {
            return "He cancelado tu inscripción y la plaza vuelve a quedar disponible. No he podido verificar la anulación del recordatorio, así que el equipo de Maternaly lo revisará para evitar un aviso incorrecto.";
          }
          return "He cancelado tu inscripción correctamente y la plaza vuelve a quedar disponible. Si quieres elegir otra fecha, dímelo y te ayudo.";
        }
        if (input.cancellationResult?.status === "ambiguous") {
          return "Veo más de una inscripción activa asociada a tu teléfono y no quiero cancelar la equivocada. El equipo de Maternaly lo revisará contigo para identificar la sesión correcta.";
        }
        if (input.cancellationResult?.status === "not_found") {
          return "No he encontrado una inscripción activa que pueda cancelar con seguridad. Te paso con el equipo de Maternaly para que lo compruebe sin tocar una reserva equivocada.";
        }
        return "No he podido completar la cancelación de forma segura en la agenda. Te paso con el equipo de Maternaly para que la gestione contigo.";
      case "reservation_status":
        return this.renderReservationStatus(input.registrationLookupResult);
      case "handoff":
        if (input.decision.reason === "clinical_safety_requires_professional") {
          return "Siento que estés pasando por eso. Por seguridad, esto debe revisarlo una profesional cuanto antes. No puedo hacer diagnóstico por WhatsApp, así que te paso con el equipo de Maternaly para que lo miren contigo. Si el sangrado, el dolor o cualquier síntoma importante empeora, mi recomendación es que contactes lo antes posible con tu médico o acudas a urgencias.";
        }
        if (input.decision.reason === "cancel_or_reschedule_requires_human") {
          return "Para cambios de fecha o cancelaciones, lo revisa directamente el equipo de Maternaly para hacerlo con seguridad. Te paso con una persona.";
        }
        if (input.decision.reason === "payment_or_invoice_requires_human") {
          return "Para pagos, facturas o justificantes, lo revisa directamente el equipo de Maternaly con el pago validado. Te paso con una persona.";
        }
        return "Perfecto, dejo la conversación para que la revise el equipo de Maternaly con cuidado. Cuéntame en una frase qué necesitas y lo verán con contexto.";
      case "privacy":
        return "Usamos los datos que nos das solo para gestionar tu consulta o solicitud de plaza con el equipo de Maternaly. Si quieres ejercer derechos de privacidad o borrar datos, lo dejo anotado para que el equipo lo revise.";
      case "payment":
        return "Puedo orientarte sobre pagos, pero no doy una plaza por confirmada sin validación real del pago. Si te parece, dejo tu consulta preparada para que la revise el equipo.";
      case "invoice":
        return "Puedo dejar anotada la solicitud de factura o justificante. El equipo la revisará con el pago validado antes de emitir nada.";
      case "booking_declined":
        return "Claro, no reservo nada 😊 Cuando quieras, puedo ayudarte a explorar otros servicios de embarazo o resolver cualquier otra duda. ¿Qué te apetece mirar?";
      case "booking_service_selection":
        return this.renderBookingServiceSelection(
          input.decision.journeyStage ?? input.state?.journeyStage,
          input.state?.pregnancyMonth,
          input.state?.pregnancyWeek,
        );
      case "greeting":
        return this.renderGreeting(input.message, input.state);
      case "catalog_info":
        return this.renderCatalogInfo(
          input.decision.journeyStage ?? input.state?.journeyStage,
          input.decision.modalityPreference,
          input.message,
          input.state?.pregnancyMonth,
          input.state?.pregnancyWeek,
        );
      case "service_info":
        return service
          ? this.renderServiceInfo(service, input.decision, input.message)
          : this.renderGeneral(input.state);
      case "normalized_registration":
        return this.renderNormalizedRegistration(input.toolResult, service, input.state);
      case "general":
      case "dialogue_response":
      default:
        return this.renderGeneral(input.state);
    }
  }

  renderAlternatives(input: MaternalyCopyRenderInput): string[] {
    const service = serviceFromDecision(input.decision, input.state);
    if (input.decision.action === "booking_service_selection") {
      return [
        "Entendido, seguimos con la cita. Dime qué servicio necesitas. Si eliges la Charla Informativa o el Taller BLW, consultaré directamente su agenda vinculada y te mostraré sus fechas y plazas reales.",
      ];
    }

    if (input.decision.action === "catalog_info") {
      if (input.decision.modalityPreference === "online") {
        return [
          "La alternativa online confirmada en Maternaly es la charla informativa gratuita para las primeras 20 semanas de embarazo. La imparten matronas y aborda cuidados, alimentación, ejercicio, revisiones, medicación segura y dudas habituales. Si buscabas un taller práctico online de otra temática, dime cuál y compruebo contigo qué formato tiene. 💛",
          "Online, la convocatoria que consta ahora mismo es la charla gratuita de embarazo de la semana 1 a la 20. Puedes asistir desde casa y resolver en directo con matronas dudas físicas, emocionales y de autocuidado. Cuéntame si quieres ver su contenido o sus próximas fechas.",
        ];
      }

      if (input.decision.modalityPreference === "presencial") {
        return [
          "De forma presencial tengo confirmadas la charla informativa de embarazo, el taller BLW y los grupos de Pilates embarazo. Hay opciones en Bilbao y Erandio, con sedes y horarios distintos. Dime qué tema te interesa y qué ubicación te viene mejor, y te las comparo una por una. 😊",
        ];
      }
    }

    if (input.decision.action !== "service_info" || !service) {
      return [];
    }

    const focus = input.decision.serviceQuestionFocus ?? "general";
    if (service.id === "taller_blw") {
      if (focus === "pricing") {
        return [
          "Para acudir una persona, el taller BLW tiene un precio de 45 €; si venís en pareja, son 75 € en total. La plaza solo se considera confirmada cuando la reserva y el pago han sido validados. ¿Qué sede os vendría mejor, Bilbao o Erandio?",
          "El precio depende de si vienes sola o acompañada: 45 € por persona o 75 € por pareja. Antes de dar la plaza por cerrada, Maternaly valida tanto la reserva como el pago. Si quieres, después miramos la convocatoria que mejor os encaje.",
        ];
      }

      if (focus === "duration" || focus === "schedule") {
        return [
          "Cada taller BLW ocupa tres horas, de 17:00 a 20:00, y se realiza presencialmente. Las convocatorias van alternando entre Bilbao y Erandio, así que puedo enseñarte las próximas cuando quieras. 😊",
        ];
      }

      if (focus === "locations") {
        return [
          "El BLW se trabaja de manera presencial en las sedes de Maternaly Bilbao y Maternaly Erandio; no consta una edición online. Si buscas algo a distancia, la charla informativa de embarazo sí tiene convocatorias online. 💛",
        ];
      }

      if (focus === "contents" || focus === "benefits") {
        return [
          "El taller está pensado para empezar la alimentación complementaria con seguridad y sin forzar al bebé. Se revisan las señales para saber si está preparado, los cortes y alimentos adecuados, la autorregulación, las alergias y cómo construir hábitos familiares saludables. 🥕",
        ];
      }

      return [
        "El BLW es una forma de iniciar la alimentación complementaria dejando que el bebé participe y marque el ritmo, siempre dentro de unas pautas claras de seguridad. En el taller aprenderéis a reconocer si ya está preparado, ofrecer alimentos y cortes adecuados, acompañar sin forzar y manejar dudas sobre alergias y alimentación familiar. Es presencial, dura de 17:00 a 20:00 y cuesta 45 € para una persona o 75 € por pareja. Podemos profundizar en seguridad, contenidos, edad recomendada o próximas convocatorias, como prefieras. 🥕",
        "La idea central del Baby-Led Weaning no es simplemente «dar comida en trozos», sino acompañar al bebé para que explore y se autorregule de forma segura. Durante tres horas se ven requisitos de inicio, alimentos, cortes, alergias y hábitos saludables; el taller se hace en Bilbao o Erandio y podéis venir una persona por 45 € o en pareja por 75 €. ¿Qué parte te genera más dudas?",
      ];
    }

    if (service.id === "charla_embarazo_1_20") {
      return [
        this.renderCharlaInfo("general"),
      ];
    }

    if (service.id === "pilates") {
      return [
        `Pilates embarazo se realiza en grupos reducidos desde la semana 14 y trabaja fuerza, postura, respiración y suelo pélvico. Se ofrece en Bilbao y Erandio; las tarifas son ${service.pricing?.join(" o ") ?? "las indicadas por el equipo"}. Si me dices sede y franja horaria, te oriento mejor. 😊`,
      ];
    }

    return [
      `${service.name} puede encajarte si buscas esto: ${service.summary} ${service.details.slice(0, 2).join(" ")} ${service.pricing?.length ? `Las tarifas disponibles son ${service.pricing.join(" / ")}.` : ""} ${warmNextQuestion(service.nextQuestion)}`,
    ];
  }

  renderTechnicalFallback(): string {
    return "Ahora mismo no he podido procesarlo con seguridad. Puedo orientarte sobre Maternaly o dejar tu consulta para que el equipo la revise con cuidado. ¿Me cuentas qué necesitas?";
  }

  private renderPregnancyContext(service: KnowledgeService | null): string {
    if (service?.id === "taller_blw") {
      return "Gracias por contármelo; eso me ayuda a situar mejor la consulta. Durante el embarazo, el taller BLW puede servirte para preparar una etapa posterior: está pensado para cuando el bebé se acerque al inicio de la alimentación complementaria. Si te apetece, seguimos viendo BLW con calma para más adelante o te oriento ahora entre los servicios de embarazo de Maternaly. 💛";
    }

    if (service) {
      return `Gracias por contarme en qué etapa estás; lo tendré en cuenta para orientarte mejor. Podemos seguir con ${service.name} y ver cómo encaja contigo, o comparar con calma otras opciones de Maternaly pensadas para el embarazo. ¿Qué te ayudaría más ahora? 💛`;
    }

    return "Gracias por contarme en qué etapa estás; eso me ayuda a orientarte mejor. Puedo comparar contigo los servicios de Maternaly pensados para el embarazo y explicarte cuáles pueden tener más sentido ahora, sin lanzarte fechas ni reservas que no has pedido. ¿Prefieres que empecemos por movimiento y bienestar, preparación o una charla informativa? 💛";
  }

  private buildGroundedFacts(
    service: KnowledgeService | null,
    intent: StructuredIntent,
  ): string[] {
    // The safe draft is already the complete factual authority for this turn.
    // Give the style model only the current service identity and genuinely
    // turn-specific context; a full service or catalog dump lets it introduce
    // true-but-unasked facts and silently change the answer's scope.
    const serviceFacts = service
      ? [`El servicio actual de este turno es ${service.name}; no cambies de servicio.`]
      : [];
    const contextualFacts =
      intent.slots.pregnancy_month || intent.slots.pregnancy_week
        ? [
            "La usuaria acaba de compartir su etapa de embarazo; debe reconocerse ese contexto sin convertirlo en una petición de fechas, plazas o reserva.",
            ...(service?.id === "taller_blw"
              ? [
                  "El Taller BLW corresponde al momento en que el bebé vaya a iniciar la alimentación complementaria; durante el embarazo puede explicarse como preparación para más adelante.",
                ]
              : []),
          ]
        : [];

    return Array.from(new Set([...serviceFacts, ...contextualFacts]));
  }

  private buildGroundedContext(
    service: KnowledgeService | null,
    intent: StructuredIntent,
  ): string {
    const parts = [
      `Movimiento del turno: ${
        intent.slots.pregnancy_month || intent.slots.pregnancy_week
          ? "la usuaria comparte contexto personal y espera que la respuesta se adapte"
          : "consulta informativa"
      }.`,
      service ? `Tema actual: ${service.name}.` : "Tema actual: orientación general de Maternaly.",
      `Foco: ${intent.service_question_focus}.`,
      intent.needs_availability_lookup
        ? "La policy ya ha autorizado disponibilidad."
        : "No se han pedido fechas, plazas ni una reserva.",
    ];

    return parts.join(" ");
  }

  private renderGeneral(state?: MaternalyNormalizedFlowState): string {
    if (state?.journeyStage === "embarazo") {
      const detail = state.pregnancyMonth
        ? `de ${state.pregnancyMonth} meses`
        : state.pregnancyWeek
          ? `de ${state.pregnancyWeek} semanas`
          : "";
      return `Te sigo 😊 Ya tengo en cuenta que estás embarazada${detail ? ` ${detail}` : ""}. Dime qué quieres resolver ahora: elegir un servicio, consultar su agenda o continuar con una cita.`;
    }
    if (state?.journeyStage === "postparto") {
      return "Te sigo 😊 Ya tengo en cuenta que estás en el posparto. Dime qué necesitas ahora y continuamos desde ese contexto.";
    }
    if (state?.journeyStage === "otros") {
      return "Te sigo 😊 Ya tengo en cuenta que tu consulta no es de embarazo ni posparto. Cuéntame qué necesitas y seguimos desde ahí.";
    }
    return "Soy Ane, la asistente virtual de Maternaly. Puedo darte información precisa sobre nuestros servicios y ayudarte a preparar una reserva. Para orientarte sin dar nada por supuesto, dime primero en qué etapa estás: EMBARAZO, POSTPARTO u OTROS. 💛";
  }

  private async renderDialogue(input: MaternalyGroundedCopyRenderInput, env: NodeJS.ProcessEnv): Promise<MaternalyGroundedCopyResult> {
    const d = input.intent.dialogue;
    const parts: string[] = [];
    let attempted = false;
    let latencyMs = 0;
    let generated = false;
    if (input.intent.dialogueUnavailable || !d) {
      parts.push("No he podido interpretar bien este mensaje. Conservo lo que ya habíamos hablado y no he realizado ninguna reserva ni cambio. ¿Puedes aclararme qué quieres corregir o resolver?");
    } else {
      if (d.updates.length) {
        const labels: Record<string, string> = { full_name: "nombre y apellidos", partner_name: "acompañante", people_count: "número de asistentes", fpp_or_due_date: "fecha probable de parto", baby_birth_date: "fecha de nacimiento", pregnancy_week: "semana de embarazo", pregnancy_month: "mes de embarazo", journey_stage: "etapa", location: "sede", modality: "modalidad" };
        parts.push(`${d.updates.some((u) => u.correction) ? "He actualizado" : "He recogido"}: ${d.updates.map((u) => labels[u.field]).join(", ")}.`);
      }
      const pendingDataQuestion = d.questions.some((q) => q.focus === "booking" && /(?:qué|que).*(?:falta|dato)|datos.*(?:falta|necesita)/i.test(q.text));
      const questions = d.questions.filter((q) => !(q.focus === "schedule" && input.toolResult) &&
        !(input.decision.action === "catalog_info" && !q.serviceId) &&
        !(pendingDataQuestion && q.focus === "booking"));
      if (questions.length) {
        const answer = await answerDialogueQuestions({ ...d, questions }, env);
        attempted = true; latencyMs = answer.latencyMs; generated = !!answer.text;
        parts.push(answer.text ?? "No tengo información verificada suficiente para responder a esa consulta con seguridad. El equipo de Maternaly puede aclarar esa condición; mantengo tu solicitud sin confirmar ninguna plaza.");
      }
      if (d.ambiguities.length) {
        const field = d.ambiguities[0].field;
        const labels: Record<string, string> = { full_name: "el nombre y los apellidos de la titular", partner_name: "el nombre del acompañante", fpp_or_due_date: "la fecha probable de parto, con día, mes y año", baby_birth_date: "la fecha de nacimiento del bebé", service: "el servicio que te interesa", session: "la fecha o el número de la sesión", people_count: "cuántas personas acudiréis" };
        parts.push(field === "booking_consent" ? "¿Quieres que continúe con la solicitud de reserva?" : `Para no dar nada por supuesto, ¿puedes aclararme ${labels[field] ?? "ese dato"}?`);
      } else if (input.toolResult || input.decision.action === "catalog_info" || input.decision.action === "booking_service_selection") {
        const trusted = this.render(input);
        if (trusted) parts.push(trusted);
      } else if (d.goal === "decline") {
        parts.push(input.state?.stage === "confirmed"
          ? "De acuerdo, no he realizado cambios ni he cancelado tu inscripción. Si quieres consultar algo sobre ella, seguimos desde aquí."
          : "De acuerdo, no continúo con la reserva. Podemos seguir con tus dudas cuando quieras.");
      } else if (input.state?.stage === "collecting_contact" && (d.updates.length || !questions.length || pendingDataQuestion)) {
        const missing = input.state.pendingFields ?? [];
        parts.push(missing.length ? `Conservo la sesión elegida. Solo me falta: ${missing.map(fieldLabel).join(", ")}.` : "Conservo los datos y la sesión elegida. ¿Quieres que continúe con la solicitud de reserva?");
      } else if (!parts.length) {
        parts.push(this.render(input) ?? "¿Qué te gustaría saber de Maternaly?");
      }
    }
    return { text: parts.join("\n\n"), source: generated ? "grounded_generator" : "safe_draft", mode: generated ? "generated" : "fallback", reason: generated ? "accepted" : "no_safe_candidate", attempted, latencyMs, candidateAudits: [] };
  }

  private renderReservationStatus(
    result: LookupNormalizedRegistrationResult | undefined,
  ): string {
    if (result?.status === "found") {
      const status = result.registration.status ?? "";
      if (normalizeCopy(status) === "lista espera") {
        return "Acabo de comprobar la agenda vinculada: tu inscripción figura en lista de espera. No he creado ni modificado ninguna reserva al consultarlo.";
      }
      const confirmed = registrationStatusDomain(status) === "confirmed";
      return confirmed
        ? "Sí. Acabo de comprobar la agenda vinculada y tu inscripción figura activa y confirmada. No he creado ni modificado ninguna reserva al consultarlo."
        : "Acabo de comprobar la agenda vinculada: tu inscripción figura activa, pero todavía pendiente de confirmación. No he creado ni modificado ninguna reserva al consultarlo.";
    }
    if (result?.status === "not_found") {
      return "No encuentro una inscripción activa asociada a esta conversación en la agenda vinculada. No voy a crear otra automáticamente: lo dejo para que el equipo compruebe qué ha ocurrido.";
    }
    if (result?.status === "ambiguous") {
      return "Veo más de una inscripción activa y no quiero darte el estado de la equivocada. El equipo de Maternaly lo revisará contigo sin modificar ninguna reserva.";
    }
    return "Ahora mismo no he podido comprobar el estado de tu inscripción con seguridad. No he creado ni modificado ninguna reserva y el equipo de Maternaly lo revisará.";
  }

  private renderBookingServiceSelection(
    journeyStage?: MaternalyJourneyStage,
    pregnancyMonth?: number,
    pregnancyWeek?: number,
  ): string {
    const pregnancyContext = pregnancyMonth
      ? `Ya tengo en cuenta que estás embarazada de ${pregnancyMonth} meses. `
      : pregnancyWeek
        ? `Ya tengo en cuenta que estás de ${pregnancyWeek} semanas. `
        : journeyStage === "embarazo"
          ? "Ya tengo en cuenta que estás embarazada. "
          : "";
    return `Claro, seguimos con la cita. ${pregnancyContext}Dime qué servicio quieres agendar. Si es la Charla Informativa o el Taller BLW, consultaré directamente su agenda vinculada y te mostraré fechas y plazas reales.`;
  }

  private renderCatalogOverview(): string {
    const serviceNames = MATERNALY_KNOWLEDGE_SERVICES.map((service) => `• ${service.name}`).join("\n");
    return `Claro 😊 En Maternaly acompañamos distintas etapas del embarazo, el posparto y los primeros meses del bebé. Estos son los servicios sobre los que puedo orientarte ahora mismo:\n\n${serviceNames}\n\nNo hace falta que sepas cuál elegir: si me cuentas en qué momento estás o qué te preocupa, te ayudo a comparar los que mejor encajen contigo.`;
  }

  private renderGreeting(message?: string, state?: MaternalyNormalizedFlowState): string {
    const normalized = normalizeCopy(message ?? "");
    const salutation = normalized.includes("buenos dias")
      ? "¡Buenos días!"
      : normalized.includes("buenas noches")
        ? "¡Buenas noches!"
        : normalized.includes("buenas tardes")
          ? "¡Buenas tardes!"
          : "¡Hola!";
    if (state?.journeyStage) {
      const context = state.journeyStage === "embarazo"
        ? state.pregnancyMonth
          ? `que estás embarazada de ${state.pregnancyMonth} meses`
          : state.pregnancyWeek
            ? `que estás de ${state.pregnancyWeek} semanas`
            : "que estás embarazada"
        : state.journeyStage === "postparto"
          ? "que estás en el posparto"
          : "el contexto que ya me has contado";
      return `${salutation} 😊 Sí, te sigo; ya tengo en cuenta ${context}. ¿Qué necesitas ahora?`;
    }
    const options = MATERNALY_JOURNEY_STAGE_OPTIONS.map((option) => `• ${option.label}`).join("\n");
    return `${salutation} 😊 Soy Ane, la asistente virtual de Maternaly. Estoy aquí para darte información precisa sobre nuestros servicios y ayudarte a reservar. Si alguna cuestión no queda resuelta, Macarena podrá contactar contigo personalmente.\n\nPara empezar, ¿en qué momento o etapa estás?\n${options}`;
  }

  private renderCatalogInfo(
    journeyStage?: MaternalyJourneyStage,
    modalityPreference?: "presencial" | "online",
    message?: string,
    pregnancyMonth?: number,
    pregnancyWeek?: number,
  ): string {
    if (journeyStage === "embarazo") {
      const services = MATERNALY_PREGNANCY_SERVICE_MENU.filter((item) => item.group === "servicio")
        .map((item) => `• ${item.label}`)
        .join("\n");
      const activities = MATERNALY_PREGNANCY_SERVICE_MENU.filter((item) => item.group === "actividad")
        .map((item) => `• ${item.label}`)
        .join("\n");
      const units = MATERNALY_PREGNANCY_SERVICE_MENU.filter((item) => item.group === "unidad")
        .map((item) => `• ${item.label}`)
        .join("\n");
      const context = pregnancyMonth
        ? `Como estás embarazada de ${pregnancyMonth} meses, no hace falta que me repitas la etapa. `
        : pregnancyWeek
          ? `Como estás de ${pregnancyWeek} semanas, no hace falta que me repitas la etapa. `
          : "";
      return `Perfecto 😊 ${context}Estos son los servicios de Maternaly para el embarazo:\n\n${services}\n\nActividades físicas durante el embarazo:\n${activities}\n\n${units}\n\nDime cuál te interesa y seguimos desde ahí.`;
    }

    if (modalityPreference === "presencial") {
      const presencialNames = MATERNALY_KNOWLEDGE_SERVICES.filter((service) =>
        service.sessions?.some((session) => session.modality === "presencial"),
      ).map((service) => service.name);
      const lastName = presencialNames.at(-1);
      const formattedNames =
        presencialNames.length > 1
          ? `${presencialNames.slice(0, -1).join(", ")} y ${lastName}`
          : lastName ?? "ninguna opción";
      return `Sí. Las opciones presenciales que tengo confirmadas son ${formattedNames}. La charla tiene ediciones en Bilbao y Erandio; el taller BLW se imparte en ambas sedes según convocatoria; y Pilates tiene grupos presenciales con varios horarios. Si me dices qué temática buscas o qué sede te viene mejor, te ayudo a compararlas con detalle. 💛`;
    }

    if (modalityPreference !== "online") {
      return this.renderCatalogOverview();
    }

    const onlineServices = MATERNALY_KNOWLEDGE_SERVICES.filter((service) =>
      service.sessions?.some((session) => session.modality === "online"),
    );
    const asksForWorkshop = /\btaller(?:es)?\b/.test(normalizeCopy(message ?? ""));
    const onlineWorkshops = onlineServices.filter((service) =>
      [service.name, ...service.aliases].some((value) => /\btaller(?:es)?\b/.test(normalizeCopy(value))),
    );

    if (onlineServices.length === 0) {
      return "Ahora mismo no tengo ninguna modalidad online confirmada en la información disponible. Si me dices qué tipo de ayuda buscas, puedo orientarte entre los servicios de Maternaly o dejar la consulta preparada para el equipo.";
    }

    const onlineNames = onlineServices
      .map((service) => service.name.replace(/^./, (letter) => letter.toLocaleLowerCase("es")))
      .join(" y ");
    if (asksForWorkshop && onlineWorkshops.length === 0) {
      return `Como taller online, ahora mismo no tengo ninguno confirmado. La opción online que sí tengo confirmada es la ${onlineNames}: la imparten matronas y está pensada para resolver dudas de las primeras 20 semanas del embarazo. Si buscabas otra temática, como Pilates, AIPAP o Yoga Prenatal, dime cuál y te confirmo su formato. 💛`;
    }

    return `Sí: la opción online que tengo confirmada ahora mismo es la ${onlineNames}. La imparten matronas y trata cambios del embarazo, autocuidados, alimentación, actividad física, revisiones, medicación segura y dudas frecuentes. Si quieres, te cuento en qué consiste o miro las próximas ediciones online. 💛`;
  }

  private renderServiceInfo(
    service: KnowledgeService,
    decision?: MaternalyCopyDecision,
    message?: string,
  ): string {
    if (service.id === "charla_embarazo_1_20") {
      return this.renderCharlaInfo(
        decision?.serviceQuestionFocus ?? "general",
        decision?.locationPreference,
      );
    }

    if (service.id === "taller_blw") {
      return this.renderBlwInfo(
        decision?.serviceQuestionFocus ?? "general",
        decision?.locationPreference,
        decision?.modalityPreference,
        message,
      );
    }

    if (service.id === "pilates") {
      return this.renderPilatesInfo(
        service,
        decision?.serviceQuestionFocus ?? "general",
        decision?.locationPreference,
      );
    }

    if (decision?.serviceQuestionFocus === "booking") {
      return `${service.name} no tiene una agenda de plazas vinculada al bot. Como ya me has dicho que quieres pedir cita, no te lo volveré a preguntar: dime qué sede, fecha o franja prefieres y dejaré esa solicitud concreta para que el equipo compruebe la disponibilidad.`;
    }

    const parts = [
      `${service.name}: ${service.summary}`,
      service.details.slice(0, 2).join(" "),
      service.pricing?.length ? `Precio: ${service.pricing.join(" / ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `${parts} ${warmNextQuestion(service.nextQuestion)}`;
  }

  private renderCharlaInfo(
    focus: MaternalyServiceQuestionFocus,
    locationPreference?: string,
  ): string {
    const location = normalizeLocation(locationPreference);
    const fullExplanation = [
      `${MATERNALY_CHARLA_FACTS.name} está pensada para acompañarte desde el comienzo del embarazo. La imparten matronas y es completamente gratuita.`,
      "En la charla hablamos de los cambios que se producen en tu cuerpo durante el embarazo y de cómo cuidarte en esta etapa: autocuidados, alimentación, actividad física, pruebas y exámenes que irás realizando, y qué medicación se considera segura para ti y para el bebé. También tratamos la sexualidad y los cambios emocionales, para que puedas plantear tus dudas con confianza.",
      "Puedes asistir de forma presencial o conectarte online en directo, y puedes venir sola o acompañada por tu pareja o acompañante.",
      MATERNALY_CHARLA_CTA,
    ].join("\n\n");

    if (["general", "contents", "eligibility", "start_week", "benefits"].includes(focus)) {
      return fullExplanation;
    }

    if (focus === "pricing") {
      return `La charla informativa no tiene ningún coste: es gratuita. La imparten matronas y puedes acudir sola o con acompañante. ${MATERNALY_CHARLA_CTA}`;
    }

    if (focus === "duration") {
      return "La ficha disponible indica la hora de inicio de cada edición, pero no fija una duración única. Antes de reservar puedo mostrarte la fecha, modalidad y hora exactas para que elijas con toda la información.";
    }

    if (focus === "locations") {
      return "Puedes elegir entre tres opciones claras: Erandio presencial a las 18:30, Bilbao presencial a las 17:00 u online en directo a las 19:00. ¿Quieres reservar tu plaza?";
    }

    if (focus === "schedule") {
      const preference = location ? ` Si prefieres ${location === "bilbao" ? "Bilbao" : "Erandio"}, puedo enseñarte primero sus fechas.` : "";
      return `Los horarios establecidos son: Erandio presencial a las 18:30, Bilbao presencial a las 17:00 y online en directo a las 19:00.${preference} ${MATERNALY_CHARLA_CTA}`;
    }

    if (focus === "booking") {
      return "Puedo comprobar las próximas ediciones y preparar tu solicitud de plaza. Necesitaremos tus datos básicos, si vienes sola o acompañada y tu fecha probable de parto; la plaza solo se dará por registrada cuando el proceso real lo valide.";
    }

    return fullExplanation;
  }

  private renderBlwInfo(
    focus: MaternalyServiceQuestionFocus,
    locationPreference?: string,
    modalityPreference?: "presencial" | "online",
    message?: string,
  ): string {
    const location = normalizeLocation(locationPreference);

    if (focus === "contents") {
      return "En el taller BLW se trabajan el concepto de autorregulación, los requisitos para empezar, cómo introducir alimentos de forma segura, qué alimentos ofrecer, alergias alimentarias en la infancia y bases de alimentación saludable. ¿Quieres que te cuente también duración o precios? 🥕";
    }

    if (focus === "eligibility" || focus === "start_week") {
      return "Está pensado para familias cuyo bebé va a comenzar la alimentación complementaria y quieren saber cuándo y cómo empezar con seguridad. En el taller se revisan precisamente los requisitos de inicio; puedes venir sola o en pareja.";
    }

    if (focus === "duration") {
      return "El taller BLW dura 3 horas, de 17:00 a 20:00. Es presencial y se organiza en Bilbao o Erandio según la convocatoria. ¿Quieres que miremos próximas fechas? 😊";
    }

    if (focus === "pricing") {
      return "El taller BLW cuesta 45 €/persona o 75 €/pareja. La plaza queda confirmada únicamente después de la reserva y el pago validados. ¿Te interesa Bilbao o Erandio?";
    }

    if (focus === "locations") {
      if (modalityPreference === "online") {
        return "El taller BLW no tiene modalidad online: es un taller práctico y presencial, con convocatorias en Maternaly Bilbao y Maternaly Erandio. La charla informativa de embarazo sí puede tener ediciones online, por si era ese el servicio que tenías en mente. Si quieres, te cuento cómo es el BLW presencial o dejamos aparcadas las fechas hasta que tú me las pidas. 💛";
      }

      return "El taller BLW es presencial y se organiza en Maternaly Bilbao y Maternaly Erandio. Si me dices qué sede prefieres, puedo consultar las próximas opciones. 💛";
    }

    if (focus === "schedule") {
      const preference = location ? ` de ${location === "bilbao" ? "Bilbao" : "Erandio"}` : "";
      return `Los talleres BLW son de 17:00 a 20:00 y las fechas dependen de la convocatoria${preference}. Puedo consultar las próximas sesiones reales y sus plazas antes de que elijas.`;
    }

    if (focus === "benefits") {
      return "El taller busca que la familia empiece la alimentación complementaria con más seguridad y criterio: se revisan requisitos, cortes e introducción de alimentos, autorregulación, alergias y alimentación saludable. 🥦";
    }

    if (focus === "booking") {
      return "Puedo comprobar próximas sesiones y preparar una preinscripción. Necesitaremos tus datos, si vienes sola o en pareja y la fecha de nacimiento del bebé; la plaza solo se confirma tras la reserva y el pago reales.";
    }

    const acknowledgement = isCorrectionTurn(message)
      ? "Tienes razón: me he adelantado con las plazas cuando tú querías primero una explicación general. Vamos a empezar por ahí. "
      : "Claro, te cuento el taller con calma antes de hablar de fechas o reservas. ";
    return `${acknowledgement}El BLW —Baby-Led Weaning o alimentación complementaria autorregulada— propone que el bebé participe activamente cuando llega el momento de empezar con otros alimentos, siempre respetando sus señales y los requisitos de seguridad. En el taller se explica cómo saber si está preparado, cómo ofrecer los alimentos y hacer cortes seguros, cómo acompañar sin forzar, qué tener en cuenta con las alergias y cómo construir una alimentación familiar saludable. Es presencial, dura tres horas (de 17:00 a 20:00) y podéis venir una persona por 45 € o en pareja por 75 €. La idea no es darte una lista de fechas nada más nombrarlo, sino que entiendas bien en qué consiste y después decidamos juntas qué quieres mirar. ¿Te apetece que profundice en la parte de seguridad, en los contenidos o en si encaja con la edad de tu bebé? 🥕`;
  }

  private renderPilatesInfo(
    service: KnowledgeService,
    focus: MaternalyServiceQuestionFocus,
    locationPreference?: string,
  ): string {
    const location = normalizeLocation(locationPreference);

    if (focus === "benefits") {
      return "Pilates embarazo puede ayudarte a sentirte más fuerte y acompañada en esta etapa: mejora tono muscular, postura, respiración, circulación y suelo pélvico, y aporta bienestar. Se trabaja en grupos reducidos para cuidaros bien a ti y a tu bebé. ¿Te cuento también horarios o precios? 💛";
    }

    if (focus === "schedule") {
      if (location === "bilbao") {
        return "En Maternaly Bilbao, Pilates embarazo está disponible los lunes 10:00-11:00, lunes 11:00-12:00, lunes 17:00-18:00 y lunes 18:15-19:15; y los miércoles 10:00-11:00, miércoles 17:00-18:00 y miércoles 18:15-19:15. ¿Te cuento también precios? 😊";
      }

      if (location === "erandio") {
        return "En Maternaly Erandio, Pilates embarazo está disponible los martes 17:30-18:30; y los jueves 10:00-11:00, jueves 11:00-12:00 y jueves 17:30-18:30. ¿Te cuento también precios? 😊";
      }

      return "Pilates embarazo se realiza en Maternaly Bilbao y Erandio. Bilbao: lunes 10:00-11:00, 11:00-12:00, 17:00-18:00 y 18:15-19:15; miércoles 10:00-11:00, 17:00-18:00 y 18:15-19:15. Erandio: martes 17:30-18:30; jueves 10:00-11:00, 11:00-12:00 y 17:30-18:30. ¿Te apetece que miremos una sede concreta? 😊";
    }

    if (focus === "start_week") {
      return "Puedes empezar Pilates embarazo a partir de la semana 14 y continuar hasta el final de la gestación, siempre que no haya una indicación clínica que recomiende otra cosa. Si tienes alguna duda personal, mejor que lo revise el equipo o tu profesional sanitario. 🤰";
    }

    if (focus === "pricing") {
      return `Pilates embarazo cuesta ${service.pricing?.[0] ?? "59 €/mes 1 clase/semana"} o ${service.pricing?.[1] ?? "99 €/mes 2 clases/semana"}. ¿Te cuento horarios de Bilbao o Erandio? ✅`;
    }

    if (focus === "booking") {
      return "Pilates embarazo todavía no está conectado aquí a una agenda automática de plazas. No te confirmo plaza por WhatsApp, pero puedo dejar tu interés preparado para que el equipo de Maternaly revise disponibilidad y te acompañe con la opción que mejor encaje. ¿Te va bien que lo dejemos para revisión?";
    }

    if (focus === "locations") {
      return "Pilates embarazo se puede realizar en Maternaly Bilbao y Maternaly Erandio, en grupos reducidos. Si quieres, lo vemos por sede y horario. 💛";
    }

    if (focus === "clinical_risk") {
      return this.render({
        decision: { action: "handoff", reason: "clinical_safety_requires_professional" },
      }) ?? this.renderTechnicalFallback();
    }

    return "Pilates embarazo en Maternaly se trabaja en grupos reducidos desde la semana 14 para cuidar postura, respiración, fuerza y suelo pélvico durante la gestación. Se ofrece en Bilbao y Erandio. ¿Te cuento beneficios, horarios o precios? 🌸";
  }

  private renderNormalizedRegistration(
    result: MaternalyCopyToolResult | undefined,
    service: KnowledgeService | null,
    state?: MaternalyNormalizedFlowState,
  ): string {
    if (!result) {
      return service ? this.renderServiceInfo(service) : this.renderGeneral();
    }

    if (
      (result.calendarSessions ?? result.sessions).length > 0 &&
      ["not_configured", "read_error", "sessions_available"].includes(result.status)
    ) {
      return this.renderSessions(
        { ...result, sessions: result.calendarSessions ?? result.sessions },
        service,
        state,
      );
    }

    if (result.status === "not_configured" || result.status === "read_error") {
      const serviceName = service?.name ?? MATERNALY_NORMALIZED_SERVICES[result.serviceKey].label;
      return `Puedo ayudarte con ${serviceName}, pero ahora mismo no puedo comprobar la disponibilidad con seguridad. Si me dejas nombre, teléfono y preferencia de fecha o sede, lo dejo preparado para que el equipo lo revise con cuidado.`;
    }

    if (result.status === "sessions_available") {
      return this.renderSessions(
        { ...result, sessions: result.calendarSessions ?? result.sessions },
        service,
        state,
      );
    }

    if (result.status === "collecting_fields") {
      if (result.error === "dialogue_read_only") return "La sesión sigue publicada. No he realizado una reserva: si quieres que continúe con la solicitud, dímelo.";
      if (result.error === "charla_due_date_requires_clarification") {
        const otherMissing = result.missingFields.filter((field) => field !== "fppOrDueDate");
        return `La fecha probable de parto que has enviado parece pasada o no es válida. ¿Puedes confirmarla con día, mes y año? Conservo los demás datos y la sesión elegida; todavía no he reservado ninguna plaza.${otherMissing.length ? ` También me falta: ${otherMissing.map(fieldLabel).join(", ")}.` : ""}`;
      }
      if (result.serviceKey === "charla_embarazo_1_20" && result.missingFields.includes("peopleCount")) {
        return "Perfecto. Antes de continuar, ¿acudiréis una o dos personas?";
      }
      const missing = result.missingFields.map(fieldLabel).join(", ");
      const selected = this.formatSession(result.selectedSession);
      const serviceName = service?.name ?? MATERNALY_NORMALIZED_SERVICES[result.serviceKey].label;
      return `Perfecto 🌸 Preparo la solicitud con cuidado para ${serviceName}, ${selected}; me faltan estos datos: ${missing}. Puedes enviármelos juntos en un solo mensaje.`;
    }

    if (
      result.status === "manual_validation_required" &&
      result.error === "charla_outside_week_1_20" &&
      result.eligibilityFilter?.applied &&
      !result.selectedSession
    ) {
      return [
        "Con la fecha probable de parto que me has dado, ninguna de las sesiones publicadas permite que estés entre las semanas 1 y 20 en la fecha de la charla.",
        "No he reservado ninguna plaza ni voy a ofrecerte una fecha que después no pueda tramitar. El equipo de Maternaly puede orientarte personalmente hacia la opción adecuada.",
      ].join("\n\n");
    }

    if (result.status === "manual_validation_required" && result.selectedSession) {
      if (result.error === "charla_outside_week_1_20") {
        return "Esta charla está dirigida a embarazadas que estarán entre las semanas 1 y 20 en la fecha de la sesión. Con los datos que me has dado, esa fecha queda fuera de ese tramo, así que no he reservado ninguna plaza. El equipo de Maternaly puede orientarte personalmente hacia la opción adecuada.";
      }
      if (result.error === "charla_invalid_pregnancy_dates") {
        return "No he podido comprobar de forma segura que la fecha encaje en el tramo de semanas 1 a 20 de la charla, así que no he reservado ninguna plaza. El equipo de Maternaly revisará contigo la fecha probable de parto antes de continuar.";
      }
      const option = resolveCharlaOption(result.selectedSession);
      const preference = [
        option?.location ?? result.selectedSession.location,
        formatSpanishDate(result.selectedSession.date),
        result.selectedSession.startTime,
      ].filter(Boolean).join(", ");
      return [
        `Gracias, ya tengo tus datos y tu preferencia: ${preference}.`,
        "No he podido confirmar la inscripción en la agenda ahora mismo, así que no voy a decirte que la plaza está reservada.",
        `La solicitud queda pendiente de revisión por el equipo. Si quieres contactar directamente, puedes escribir o llamar al ${MATERNALY_CONTACT.phone}, o escribir a ${MATERNALY_CONTACT.email}.`,
      ].join("\n\n");
    }

    const writeResult = result.writeResult;
    const blocked = result.plan?.blocked || !writeResult?.ok;
    if (blocked) {
      if (result.selectedSession?.full || result.plan?.blockedReasons.includes("session_full")) {
        return "Ahora mismo esa sesión aparece sin plazas libres. Puedo mostrarte otras fechas disponibles; si ninguna encaja, el equipo puede revisar contigo otra opción.";
      }

      return "Ahora mismo no puedo dejar la solicitud cerrada con seguridad. La dejo pendiente para que el equipo de Maternaly la revise con cuidado.";
    }

    if (normalizeCopy(result.plan?.existingRegistrationSheetStatus ?? "") === "lista espera") {
      return "Ya encuentro tu inscripción en la lista de espera de esa sesión. No he creado una segunda reserva ni te he confirmado una plaza; el equipo de Maternaly te avisará si puede incorporarte.";
    }

    if (
      writeResult?.mode === "live" &&
      writeResult.registrationPersisted &&
      writeResult.registrationStatus === "confirmada"
    ) {
      if (result.serviceKey === "charla_embarazo_1_20" && result.selectedSession) {
        return this.renderCharlaRegistrationResult(result);
      }
      return "Tu inscripción ya figura activa y confirmada en la agenda. No he creado una segunda reserva.";
    }

    if (result.serviceKey === "charla_embarazo_1_20" && result.selectedSession) {
      return this.renderCharlaRegistrationResult(result);
    }

    if (writeResult?.mode === "live" && writeResult.applied) {
      return "Perfecto, dejo tu preinscripción registrada y pendiente de validación del equipo. La plaza no queda cerrada hasta que el pago o la revisión real estén validados.";
    }

    return "Perfecto, dejo tu solicitud preparada para que el equipo la revise. La plaza no queda cerrada hasta que el pago o la revisión real estén validados.";
  }

  private renderSessions(
    result: MaternalyCopyToolResult,
    service: KnowledgeService | null,
    state?: MaternalyNormalizedFlowState,
  ): string {
    if (
      result.serviceKey === "charla_embarazo_1_20" &&
      result.eligibilityFilter?.applied
    ) {
      return this.renderCharlaSessions(result.sessions, state, true);
    }

    if (result.sessions.length === 0) {
      return "Ahora mismo no veo sesiones disponibles para ese servicio. Puedo recoger tus datos y dejarlo preparado para que lo revise el equipo.";
    }

    if (result.serviceKey === "charla_embarazo_1_20") {
      return this.renderCharlaSessions(result.sessions, state);
    }

    if (result.sessions.every((session) => session.full)) {
      return "Ahora mismo las sesiones publicadas de ese servicio aparecen sin plazas libres. No puedo darte de alta en lista de espera automáticamente desde este chat; el equipo puede revisar contigo otra opción.";
    }

    const serviceName = service?.name ?? MATERNALY_NORMALIZED_SERVICES[result.serviceKey].label;
    const intro =
      result.serviceKey === "taller_blw"
        ? "Claro. El taller BLW es presencial, dura de 17:00 a 20:00 y cuesta 45 €/persona o 75 €/pareja."
        : "Sí, tenemos una charla gratuita para embarazadas de la semana 1 a la 20, presencial u online.";
    const options = result.sessions.slice(0, 4).map((session, index) => {
      const capacity =
        session.availabilityStatus === "unlimited"
          ? undefined
          : session.availableSeats === undefined
            ? "disponibilidad a validar"
            : session.full
              ? "sin plazas libres"
              : `${session.availableSeats} plaza${session.availableSeats === 1 ? "" : "s"} disponible${session.availableSeats === 1 ? "" : "s"}`;
      return `${index + 1}. ${this.formatSession(session)}${capacity ? ` (${capacity})` : ""}`;
    });

    return [
      intro,
      `Opciones para ${serviceName}:`,
      ...options,
      "Dime cuál prefieres y preparo la solicitud con cuidado.",
    ].join("\n");
  }

  private formatSession(session: NormalizedAvailableSession | undefined): string {
    if (!session) {
      return "la sesión elegida";
    }

    return [session.date, session.startTime, session.location ?? session.groupName]
      .filter(Boolean)
      .join(" ") || session.sessionName;
  }

  private renderCharlaSessions(
    sessions: NormalizedAvailableSession[],
    state?: MaternalyNormalizedFlowState,
    eligibilityFilterApplied = false,
  ): string {
    const preferredLocation = normalizeCopy(state?.location ?? "");
    const preferredModality = normalizeCopy(state?.modality ?? "");
    const hasPreference = Boolean(preferredLocation || preferredModality);
    const visibleSessions = sessions
      .filter((session) => {
        const sessionLocation = normalizeCopy(
          [session.location, session.groupName, session.sessionName].filter(Boolean).join(" "),
        );
        const sessionModality = normalizeCopy(session.modality ?? "");
        return (
          (!preferredLocation || sessionLocation.includes(preferredLocation)) &&
          (!preferredModality || sessionModality === preferredModality)
        );
      })
      .sort((left, right) =>
        `${left.date ?? "9999-12-31"} ${left.startTime ?? "99:99"}`.localeCompare(
          `${right.date ?? "9999-12-31"} ${right.startTime ?? "99:99"}`,
        ),
      );
    if (eligibilityFilterApplied && visibleSessions.length === 0) {
      return sessions.length === 0
        ? [
            "Con la fecha probable de parto que me has dado, ninguna de las sesiones publicadas permite que estés entre las semanas 1 y 20 en la fecha de la charla.",
            "No voy a ofrecerte una fecha que después no pueda tramitar. El equipo de Maternaly puede orientarte personalmente hacia la opción adecuada.",
          ].join("\n\n")
        : [
            "Con la fecha probable de parto que me has dado, no hay sesiones publicadas que encajen a la vez con tu preferencia y con las semanas 1 a 20 de embarazo.",
            "Puedo mostrarte las fechas compatibles de otras sedes o modalidades.",
          ].join("\n\n");
    }
    if (hasPreference && visibleSessions.length === 0) {
      return [
        "No encuentro sesiones publicadas que coincidan con esa preferencia.",
        "Puedo mostrarte todas las fechas de la agenda o puedes decirme otra sede, modalidad o fecha.",
      ].join("\n\n");
    }
    const options = visibleSessions.slice(0, 8).map((session, index) => {
      const where = session.location ?? session.groupName;
      const modality =
        session.modality && normalizeCopy(where ?? "") !== normalizeCopy(session.modality)
          ? ` — ${session.modality}`
          : "";
      const availability =
        session.availabilityStatus === "unlimited"
          ? undefined
          : session.availableSeats === undefined
            ? "disponibilidad por confirmar"
            : session.full
              ? "sin plazas libres"
              : `${session.availableSeats} plaza${session.availableSeats === 1 ? "" : "s"} disponible${session.availableSeats === 1 ? "" : "s"}`;
      return `${index + 1}. ${formatSpanishDate(session.date)}, ${session.startTime ?? "hora por confirmar"} — ${where}${modality}${availability ? ` (${availability})` : ""}`;
    });

    const intro = eligibilityFilterApplied
      ? hasPreference
        ? "Perfecto. Estas son las sesiones publicadas que encajan con tu preferencia y permiten que estés entre las semanas 1 y 20:"
        : "Estas son las sesiones publicadas que permiten que estés entre las semanas 1 y 20:"
      : hasPreference
        ? "Perfecto. Estas son las sesiones publicadas que encajan con tu preferencia:"
        : "Claro. Estas son las sesiones publicadas para la Charla Informativa:";

    return [
      intro,
      ...options,
      ...(!eligibilityFilterApplied ? ["Cuando me indiques la fecha probable de parto, comprobaré que la sesión encaje entre las semanas 1 y 20 de embarazo."] : []),
      "Dime el número o la fecha que prefieres y continúo con la solicitud.",
    ].join("\n\n");
  }

  private renderCharlaRegistrationResult(result: MaternalyCopyToolResult): string {
    const session = result.selectedSession!;
    const option = resolveCharlaOption(session);
    const dateAndTime = `${formatSpanishDate(session.date)} a las ${session.startTime ?? option?.startTime ?? "hora indicada"}`;
    const liveConfirmed = isConfirmedLiveCharlaWrite(result);
    const opening = liveConfirmed
      ? "Perfecto, tu reserva ha quedado confirmada."
      : "Perfecto, solicitud preparada para que el equipo la revise y valide.";
    const contact = `Si necesitas cualquier cosa, puedes contactar con Maternaly por teléfono o WhatsApp en el ${MATERNALY_CONTACT.phone}, o escribir a ${MATERNALY_CONTACT.email}.`;

    if (option?.id === "erandio") {
      return `${opening}\n\nCharla informativa presencial en Erandio: ${dateAndTime}.\nDirección: ${option.address}\n\n${contact}`;
    }
    if (option?.id === "bilbao") {
      return `${opening}\n\nCharla informativa presencial en Bilbao: ${dateAndTime}.\nDirección: ${option.address}\n\n${contact}`;
    }
    if (option?.id === "online") {
      const joinUrl = safeOnlineJoinUrl(session.onlineJoinUrl);
      const accessCode = session.onlineAccessCode?.trim();
      const accessLines = [
        joinUrl ? `Enlace de acceso: ${joinUrl}` : undefined,
        accessCode ? `Clave de acceso: ${accessCode}` : undefined,
      ].filter((line): line is string => Boolean(line));
      const pendingAccessCopy = !joinUrl && !accessCode
        ? "El equipo te enviará las claves de acceso (enlace y clave) antes del inicio."
        : !joinUrl
          ? "El equipo te enviará el enlace de acceso pendiente antes del inicio."
          : !accessCode
            ? "El equipo te enviará la clave de acceso pendiente antes del inicio."
            : undefined;
      const accessCopy = [...accessLines, pendingAccessCopy]
        .filter((line): line is string => Boolean(line))
        .join("\n");
      return `${opening}\n\nCharla informativa online en directo por Zoom: ${dateAndTime}.\n${accessCopy}\n\n${contact}`;
    }

    return `${opening}\n\nCharla informativa: ${dateAndTime}.\n\n${contact}`;
  }
}
