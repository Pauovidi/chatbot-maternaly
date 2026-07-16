import {
  getKnowledgeService,
  getKnowledgeServiceByNormalizedKey,
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
  | "service_info"
  | "greeting"
  | "general";

export interface MaternalyCopyDecision {
  action: MaternalyCopyAction;
  serviceKey?: MaternalyNormalizedServiceKey;
  service?: KnowledgeService | null;
  serviceQuestionFocus?: MaternalyServiceQuestionFocus;
  locationPreference?: string;
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

export class MaternalyCopyRenderer {
  render(input: {
    decision: MaternalyCopyDecision;
    state?: MaternalyNormalizedFlowState;
    toolResult?: MaternalyCopyToolResult;
  }): string | undefined {
    const service = serviceFromDecision(input.decision, input.state);

    switch (input.decision.action) {
      case "silent_human":
        return undefined;
      case "reset":
        return "Listo, he reiniciado la conversación y seguimos poquito a poco. ¿Qué te apetece mirar ahora de Maternaly? 💛";
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
        return "¡Hola! Soy el asistente de Maternaly. Estoy aquí para ayudarte de forma cercana con información o con una solicitud para talleres y charlas. ¿Qué necesitas mirar hoy? 🫶";
      case "service_info":
        return service ? this.renderServiceInfo(service, input.decision) : this.renderGeneral();
      case "normalized_registration":
        return this.renderNormalizedRegistration(input.toolResult, service);
      case "general":
      default:
        return this.renderGeneral();
    }
  }

  renderTechnicalFallback(): string {
    return "Ahora mismo no he podido procesarlo con seguridad. Puedo orientarte sobre Maternaly o dejar tu consulta para que el equipo la revise con cuidado. ¿Me cuentas qué necesitas?";
  }

  private renderGeneral(): string {
    return "Ahora mismo puedes consultar dos servicios de Maternaly: la charla informativa gratuita para embarazo de la semana 1 a la 20, y el taller presencial BLW de alimentación complementaria autorregulada. ¿Sobre cuál te gustaría saber más? 💛";
  }

  private renderServiceInfo(service: KnowledgeService, decision?: MaternalyCopyDecision): string {
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

    return "El taller presencial BLW ayuda a empezar la alimentación complementaria autorregulada con seguridad. Incluye requisitos de inicio, introducción de alimentos, alergias y alimentación saludable; dura de 17:00 a 20:00 y cuesta 45 € por persona o 75 € por pareja. ¿Te cuento contenido, fechas o inscripción? 🥕";
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
