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
import type { MaternalyServiceQuestionFocus } from "@/lib/maternaly/llm/interpreter";

export type MaternalyCopyAction =
  | "silent_human"
  | "reset"
  | "handoff"
  | "privacy"
  | "payment"
  | "invoice"
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
  reason?: string;
}

export interface MaternalyCopyToolResult {
  status:
    | "not_configured"
    | "read_error"
    | "sessions_available"
    | "collecting_fields"
    | "write_result";
  serviceKey: MaternalyNormalizedServiceKey;
  sessions: NormalizedAvailableSession[];
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

interface MaternalyCopyRenderInput {
  decision: MaternalyCopyDecision;
  state?: MaternalyNormalizedFlowState;
  toolResult?: MaternalyCopyToolResult;
  message?: string;
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
      "¡Hola de nuevo! 😊 Encantada de leerte. Cuéntame, ¿qué necesitas hoy?",
      "¡Aquí estoy! Dime qué te gustaría consultar y lo vemos juntas. 💛",
      "¡Buenas! 😊 ¿En qué puedo echarte una mano ahora?",
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
      case "greeting":
        return this.renderGreeting(input.message);
      case "catalog_info":
        return this.renderCatalogInfo(input.decision.modalityPreference, input.message);
      case "service_info":
        return service
          ? this.renderServiceInfo(service, input.decision, input.message)
          : this.renderGeneral();
      case "normalized_registration":
        return this.renderNormalizedRegistration(input.toolResult, service);
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
        "Esta charla gratuita acompaña las primeras 20 semanas del embarazo con información práctica de matronas: cambios físicos y emocionales, cuidados, alimentación, actividad, revisiones, medicación segura y sexualidad. Puedes conectarte online o acudir a Bilbao o Erandio, sola o con acompañante. Dime qué aspecto quieres mirar con más detalle. 💛",
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

  private renderGeneral(): string {
    return "Puedo orientarte sobre las charlas y talleres de Maternaly, Pilates para el embarazo, AIPAP en tierra o en agua, Yoga Prenatal, Método 5P, diagnóstico prenatal, fisioterapia y suelo pélvico, lactancia y fisioterapia pediátrica. Cuéntame qué estás buscando o en qué etapa te encuentras y te ayudo a encontrar la opción que mejor encaja. 💛";
  }

  private renderGreeting(message?: string): string {
    const normalized = normalizeCopy(message ?? "");
    if (normalized.includes("buenos dias")) {
      return "¡Buenos días! 😊 Soy el asistente de Maternaly. Encantada de leerte. Cuéntame, ¿qué te gustaría saber o qué necesitas hoy?";
    }

    if (normalized.includes("buenas noches")) {
      return "¡Buenas noches! 😊 Soy el asistente de Maternaly y estoy aquí para ayudarte. Cuéntame, ¿qué necesitas?";
    }

    if (normalized.includes("buenas tardes")) {
      return "¡Buenas tardes! 😊 Soy el asistente de Maternaly. Encantada de leerte; cuéntame, ¿qué necesitas hoy?";
    }

    return "¡Hola! 😊 Soy el asistente de Maternaly y estoy aquí para ayudarte con información o con lo que necesites. Cuéntame, ¿qué necesitas hoy?";
  }

  private renderCatalogInfo(
    modalityPreference?: "presencial" | "online",
    message?: string,
  ): string {
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
      return this.renderGeneral();
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

    if (focus === "contents") {
      return "En la charla se explican los cambios del cuerpo durante el embarazo, autocuidados, alimentación, actividad física, pruebas y revisiones, medicación segura, sexualidad y cambios emocionales. La idea es que puedas resolver dudas con las matronas desde el principio. ¿Quieres que miremos una fecha presencial u online? 💛";
    }

    if (focus === "eligibility" || focus === "start_week") {
      return "La charla está pensada para embarazadas entre la semana 1 y la 20. Puedes acudir sola o con tu pareja o acompañante. ¿Te viene mejor Bilbao, Erandio u online? 😊";
    }

    if (focus === "pricing") {
      return "La charla informativa de embarazo es gratuita. Se ofrece de forma presencial en Bilbao y Erandio, y también online según la edición. ¿Quieres que comprobemos las próximas opciones?";
    }

    if (focus === "duration") {
      return "La ficha disponible indica la hora de inicio de cada edición, pero no fija una duración única. Antes de reservar puedo mostrarte la fecha, modalidad y hora exactas para que elijas con toda la información.";
    }

    if (focus === "locations") {
      return "La charla puede hacerse presencialmente en Maternaly Bilbao o Maternaly Erandio, y también hay ediciones online en directo. ¿Qué modalidad te encaja mejor? 💛";
    }

    if (focus === "schedule") {
      const preference = location ? ` en ${location === "bilbao" ? "Bilbao" : "Erandio"}` : "";
      return `Hay ediciones presenciales${preference || " en Bilbao y Erandio"} y ediciones online. Las fechas cambian por convocatoria, así que puedo consultar las próximas opciones reales antes de que elijas.`;
    }

    if (focus === "benefits") {
      return "La charla te ayuda a entender qué cambios puedes esperar en las primeras 20 semanas y a resolver con matronas dudas sobre cuidados, alimentación, ejercicio, revisiones, medicación, sexualidad y emociones. Es un espacio informativo y gratuito para empezar el embarazo con más claridad. 🌸";
    }

    if (focus === "booking") {
      return "Puedo comprobar las próximas ediciones y preparar tu solicitud de plaza. Necesitaremos tus datos básicos, si vienes sola o acompañada y tu fecha probable de parto; la plaza solo se dará por registrada cuando el proceso real lo valide.";
    }

    return "La charla informativa gratuita está dirigida a embarazadas entre la semana 1 y la 20. Las matronas abordan cambios físicos y emocionales, cuidados, alimentación, ejercicio, revisiones, medicación segura y sexualidad. Puedes asistir sola o acompañada, en Bilbao, Erandio u online según convocatoria. ¿Qué te gustaría saber: contenido, fechas o inscripción? 💛";
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
  ): string {
    if (!result) {
      return service ? this.renderServiceInfo(service) : this.renderGeneral();
    }

    if (
      result.sessions.length > 0 &&
      ["not_configured", "read_error", "sessions_available"].includes(result.status)
    ) {
      return this.renderSessions(result, service);
    }

    if (result.status === "not_configured" || result.status === "read_error") {
      const serviceName = service?.name ?? MATERNALY_NORMALIZED_SERVICES[result.serviceKey].label;
      return `Puedo ayudarte con ${serviceName}, pero ahora mismo no puedo comprobar la disponibilidad con seguridad. Si me dejas nombre, teléfono y preferencia de fecha o sede, lo dejo preparado para que el equipo lo revise con cuidado.`;
    }

    if (result.status === "sessions_available") {
      return this.renderSessions(result, service);
    }

    if (result.status === "collecting_fields") {
      const missing = result.missingFields.map(fieldLabel).join(", ");
      const selected = this.formatSession(result.selectedSession);
      return `Perfecto 🌸 Preparo la solicitud para ${selected} con cuidado; me faltan: ${missing}.`;
    }

    const writeResult = result.writeResult;
    const blocked = result.plan?.blocked || !writeResult?.ok;
    if (blocked) {
      if (result.selectedSession?.full || result.plan?.blockedReasons.includes("session_full")) {
        return "Ahora mismo esa sesión aparece sin plazas libres. Puedo dejarte en lista de espera o pasar la solicitud al equipo para revisar otra opción.";
      }

      return "Ahora mismo no puedo dejar la solicitud cerrada con seguridad. La dejo pendiente para que el equipo de Maternaly la revise con cuidado.";
    }

    if (writeResult?.mode === "live" && writeResult.applied) {
      return "Perfecto, dejo tu preinscripción registrada y pendiente de validación del equipo. La plaza no queda cerrada hasta que el pago o la revisión real estén validados.";
    }

    return "Perfecto, dejo tu solicitud preparada para que el equipo la revise. La plaza no queda cerrada hasta que el pago o la revisión real estén validados.";
  }

  private renderSessions(result: MaternalyCopyToolResult, service: KnowledgeService | null): string {
    if (result.sessions.length === 0) {
      return "Ahora mismo no veo sesiones disponibles para ese servicio. Puedo recoger tus datos y dejarlo preparado para que lo revise el equipo.";
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

    return [session.date, session.startTime, session.groupName].filter(Boolean).join(" ") || session.sessionName;
  }
}
