import {
  getKnowledgeService,
  getKnowledgeServiceByNormalizedKey,
  MATERNALY_KNOWLEDGE_SERVICES,
  type KnowledgeService,
} from "@/lib/maternaly/knowledge/catalog";
import type { MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";
import {
  MATERNALY_NORMALIZED_SERVICES,
  type MaternalyNormalizedServiceKey,
} from "@/lib/maternaly/sheets/normalized-template";
import type {
  MaternalyServiceQuestionFocus,
  StructuredIntent,
} from "@/lib/maternaly/llm/interpreter";
import {
  MATERNALY_CHARLA_CTA,
  MATERNALY_CHARLA_FACTS,
  MATERNALY_CHARLA_OPTIONS,
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
  | "silent_human"
  | "reset"
  | "handoff"
  | "privacy"
  | "payment"
  | "invoice"
  | "booking_declined"
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
  };
  writeResult?: {
    ok: boolean;
    mode: "dry_run" | "live";
    applied: boolean;
  };
}

export interface MaternalyCopyRenderInput {
  decision: MaternalyCopyDecision;
  state?: MaternalyNormalizedFlowState;
  toolResult?: MaternalyCopyToolResult;
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

function rephraseRepeatedSentence(sentence: string, index: number): string {
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

  const connectors = [
    "En concreto,",
    "Además,",
    "También conviene saber que",
    "Por otro lado,",
    "Para terminar,",
  ];
  const connector = connectors[index % connectors.length];
  return `${connector} ${sentence.charAt(0).toLocaleLowerCase("es")}${sentence.slice(1)}`;
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

  return [
    `Puntos clave:\n\n${ordered.map((item) => `• ${item}`).join("\n")}`,
    `${questions.join(" ")}${questions.length ? "\n\n" : ""}${[...facts].reverse().join(" ")}`,
    `Datos concretos:\n\n${ordered.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
  ].filter((item) => item.trim());
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

  const focusOptions = ["el contenido", "la duración", "el precio", "la modalidad", "las sedes", "las fechas"];
  const focus = focusOptions[duplicateCount % focusOptions.length];
  const candidate = `Dime qué necesitas resolver ahora y voy directa a ello. Si te ayuda, podemos empezar por ${focus} y después vemos el resto con calma.`;
  return { reply: candidate, changed: true, duplicateCount };
}

export class MaternalyCopyRenderer {
  constructor(
    private readonly groundedCopyGenerator = new MaternalyGroundedCopyGenerator(),
  ) {}

  async renderGrounded(
    input: MaternalyGroundedCopyRenderInput,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<MaternalyGroundedCopyResult | undefined> {
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
      case "greeting":
        return this.renderGreeting(input.message);
      case "catalog_info":
        return this.renderCatalogInfo(
          input.decision.journeyStage ?? input.state?.journeyStage,
          input.decision.modalityPreference,
          input.message,
        );
      case "service_info":
        return service
          ? this.renderServiceInfo(service, input.decision, input.message)
          : this.renderGeneral();
      case "normalized_registration":
        return this.renderNormalizedRegistration(input.toolResult, service, input.state);
      case "general":
      default:
        return this.renderGeneral();
    }
  }

  renderAlternatives(input: MaternalyCopyRenderInput): string[] {
    const service = serviceFromDecision(input.decision, input.state);
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

  private renderGeneral(): string {
    return "Soy Ane, la asistente virtual de Maternaly. Puedo darte información precisa sobre nuestros servicios y ayudarte a preparar una reserva. Para orientarte sin dar nada por supuesto, dime primero en qué etapa estás: EMBARAZO, POSTPARTO u OTROS. 💛";
  }

  private renderCatalogOverview(): string {
    const serviceNames = MATERNALY_KNOWLEDGE_SERVICES.map((service) => `• ${service.name}`).join("\n");
    return `Claro 😊 En Maternaly acompañamos distintas etapas del embarazo, el posparto y los primeros meses del bebé. Estos son los servicios sobre los que puedo orientarte ahora mismo:\n\n${serviceNames}\n\nNo hace falta que sepas cuál elegir: si me cuentas en qué momento estás o qué te preocupa, te ayudo a comparar los que mejor encajen contigo.`;
  }

  private renderGreeting(message?: string): string {
    const normalized = normalizeCopy(message ?? "");
    const salutation = normalized.includes("buenos dias")
      ? "¡Buenos días!"
      : normalized.includes("buenas noches")
        ? "¡Buenas noches!"
        : normalized.includes("buenas tardes")
          ? "¡Buenas tardes!"
          : "¡Hola!";
    const options = MATERNALY_JOURNEY_STAGE_OPTIONS.map((option) => `• ${option.label}`).join("\n");
    return `${salutation} 😊 Soy Ane, la asistente virtual de Maternaly. Estoy aquí para darte información precisa sobre nuestros servicios y ayudarte a reservar. Si alguna cuestión no queda resuelta, Macarena podrá contactar contigo personalmente.\n\nPara empezar, ¿en qué momento o etapa estás?\n${options}`;
  }

  private renderCatalogInfo(
    journeyStage?: MaternalyJourneyStage,
    modalityPreference?: "presencial" | "online",
    message?: string,
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
      return `Perfecto 😊 Estos son los servicios de Maternaly para el embarazo:\n\n${services}\n\nActividades físicas durante el embarazo:\n${activities}\n\n${units}\n\nDime cuál te interesa y te lo cuento de uno en uno, con calma.`;
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
      if (result.serviceKey === "charla_embarazo_1_20" && result.missingFields.includes("peopleCount")) {
        return "Perfecto. Antes de continuar, ¿acudiréis una o dos personas?";
      }
      const missing = result.missingFields.map(fieldLabel).join(", ");
      const selected = this.formatSession(result.selectedSession);
      const serviceName = service?.name ?? MATERNALY_NORMALIZED_SERVICES[result.serviceKey].label;
      return `Perfecto 🌸 Preparo la solicitud con cuidado para ${serviceName}, ${selected}; me faltan estos datos: ${missing}. Puedes enviármelos juntos en un solo mensaje.`;
    }

    if (result.status === "manual_validation_required" && result.selectedSession) {
      const option = resolveCharlaOption(result.selectedSession);
      const preference = [
        option?.location ?? result.selectedSession.location,
        formatSpanishDate(result.selectedSession.date),
        result.selectedSession.startTime,
      ].filter(Boolean).join(", ");
      return [
        `Gracias, ya tengo tus datos y tu preferencia: ${preference}.`,
        "Esa convocatoria figura en el calendario de Maternaly, pero aún no tiene una sesión operativa vinculada en la agenda. No he hecho una inscripción automática para evitar asignarte otra sede o fecha por error.",
        `La solicitud queda pendiente de validación manual por el equipo. Si quieres contactar directamente, puedes escribir o llamar al ${MATERNALY_CONTACT.phone}, o escribir a ${MATERNALY_CONTACT.email}.`,
      ].join("\n\n");
    }

    const writeResult = result.writeResult;
    const blocked = result.plan?.blocked || !writeResult?.ok;
    if (blocked) {
      if (result.selectedSession?.full || result.plan?.blockedReasons.includes("session_full")) {
        return "Ahora mismo esa sesión aparece sin plazas libres. Puedo dejarte en lista de espera o pasar la solicitud al equipo para revisar otra opción.";
      }

      return "Ahora mismo no puedo dejar la solicitud cerrada con seguridad. La dejo pendiente para que el equipo de Maternaly la revise con cuidado.";
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
    if (result.sessions.length === 0) {
      return "Ahora mismo no veo sesiones disponibles para ese servicio. Puedo recoger tus datos y dejarlo preparado para que lo revise el equipo.";
    }

    if (result.serviceKey === "charla_embarazo_1_20") {
      return this.renderCharlaSessions(result.sessions, state);
    }

    if (result.sessions.every((session) => session.full)) {
      return "Ahora mismo las sesiones de ese servicio aparecen sin plazas libres. Puedo dejarte en lista de espera o pasar la solicitud al equipo para revisar otra opción.";
    }

    const serviceName = service?.name ?? MATERNALY_NORMALIZED_SERVICES[result.serviceKey].label;
    const intro =
      result.serviceKey === "taller_blw"
        ? "Claro. El taller BLW es presencial, dura de 17:00 a 20:00 y cuesta 45 €/persona o 75 €/pareja."
        : "Sí, tenemos una charla gratuita para embarazadas de la semana 1 a la 20, presencial u online.";
    const options = result.sessions.slice(0, 4).map((session, index) => {
      const capacity =
        session.availableSeats === undefined
          ? "disponibilidad a validar"
          : session.full
            ? "sin plazas libres"
            : `${session.availableSeats} plaza${session.availableSeats === 1 ? "" : "s"} disponible${session.availableSeats === 1 ? "" : "s"}`;
      return `${index + 1}. ${this.formatSession(session)} (${capacity})`;
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
  ): string {
    const preferred = normalizeCopy([state?.location, state?.modality].filter(Boolean).join(" "));
    let ordinal = 0;
    const sections = MATERNALY_CHARLA_OPTIONS.map((option) => {
      const matching = sessions.filter((session) => resolveCharlaOption(session)?.id === option.id);
      const heading = `${option.location} — ${option.modality === "online" ? "online en directo" : "presencial"} — ${option.startTime}`;
      const dates = matching.length
        ? matching.map((session) => {
            ordinal += 1;
            const availability = session.source === "contract_pending_validation"
              ? " (pendiente de validación manual)"
              : session.full
                ? " (sin plazas libres)"
                : "";
            return `${ordinal}. ${formatSpanishDate(session.date)}, ${session.startTime ?? option.startTime}${availability}`;
          })
        : ["Sin fecha publicada en la agenda en este momento."];
      const marker = preferred && normalizeCopy(`${option.location} ${option.modality}`).includes(preferred)
        ? " (tu preferencia)"
        : "";
      return `${heading}${marker}\n${dates.map((date) => `   ${date}`).join("\n")}`;
    });

    return [
      "Claro. Opciones para Charla Informativa gratuita (las tres modalidades):",
      ...sections,
      "Dime si te encaja mejor Erandio, Bilbao u online y, si ya lo sabes, qué fecha prefieres.",
    ].join("\n\n");
  }

  private renderCharlaRegistrationResult(result: MaternalyCopyToolResult): string {
    const session = result.selectedSession!;
    const option = resolveCharlaOption(session);
    const dateAndTime = `${formatSpanishDate(session.date)} a las ${session.startTime ?? option?.startTime ?? "hora indicada"}`;
    const liveApplied = result.writeResult?.mode === "live" && result.writeResult.applied;
    const opening = liveApplied
      ? "Perfecto, tu preinscripción ha quedado registrada y pendiente de validación por el equipo."
      : "Perfecto, solicitud preparada para que el equipo la revise y valide.";
    const contact = `Si necesitas cualquier cosa, puedes contactar con Maternaly por teléfono o WhatsApp en el ${MATERNALY_CONTACT.phone}, o escribir a ${MATERNALY_CONTACT.email}.`;

    if (option?.id === "erandio") {
      return `${opening}\n\nCharla informativa presencial en Erandio: ${dateAndTime}.\nDirección: ${option.address}\n\n${contact}`;
    }
    if (option?.id === "bilbao") {
      return `${opening}\n\nCharla informativa presencial en Bilbao: ${dateAndTime}.\nDirección: ${option.address}\n\n${contact}`;
    }
    if (option?.id === "online") {
      return `${opening}\n\nCharla informativa online en directo por Zoom: ${dateAndTime}. Recibirás las claves para conectarte antes del inicio.\n\n${contact}`;
    }

    return `${opening}\n\nCharla informativa: ${dateAndTime}.\n\n${contact}`;
  }
}
