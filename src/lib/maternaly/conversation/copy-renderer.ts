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
  return question.endsWith("🌸") ? question : `${question} 🌸`;
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
        return "Listo, he reiniciado la conversación y empezamos de nuevo con calma. ¿Qué te apetece mirar ahora de Maternaly? 🌸";
      case "handoff":
        if (input.decision.reason === "clinical_safety_requires_professional") {
          return "Siento que estés pasando por eso. Para cuidarte bien, lo más seguro es que lo revise una profesional del equipo de Maternaly. No puedo hacer diagnóstico por aquí, pero lo dejo preparado para revisión.";
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
        return "¡Hola! Soy el asistente de Maternaly. Estoy aquí para ayudarte con calma con información o con una solicitud para talleres y charlas. ¿Qué necesitas mirar hoy? 🌸";
      case "service_info":
        return service ? this.renderServiceInfo(service) : this.renderGeneral();
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
    return "Estoy aquí para ayudarte con calma. Puedo orientarte sobre charlas de embarazo, taller BLW, Pilates, AIPAP, suelo pélvico, diagnóstico prenatal, lactancia o fisioterapia pediátrica. ¿Qué te apetece mirar primero? 🌸";
  }

  private renderServiceInfo(service: KnowledgeService): string {
    if (service.id === "pilates") {
      return this.renderPilatesInfo(service);
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

  private renderPilatesInfo(service: KnowledgeService): string {
    return [
      "Pilates embarazo en Maternaly se trabaja en grupos reducidos, con atención cercana para cuidarte a ti y a tu bebé durante esta etapa.",
      "Puedes empezar a partir de la semana 14 de embarazo y continuar hasta el final de la gestación.",
      "Beneficios: ayuda a mejorar el tono muscular y la forma física, aumenta la fuerza y la resistencia, favorece la circulación de las piernas, cuida la postura y la espalda, trabaja respiración, conciencia corporal y suelo pélvico, y aporta bienestar y relajación.",
      "Bilbao: lunes 10:00-11:00, lunes 11:00-12:00, lunes 17:00-18:00 y lunes 18:15-19:15; miércoles 10:00-11:00, miércoles 17:00-18:00 y miércoles 18:15-19:15.",
      "Erandio: martes 17:30-18:30; jueves 10:00-11:00, jueves 11:00-12:00 y jueves 17:30-18:30.",
      `Precio: ${service.pricing?.join(" / ") ?? "consultar con el equipo"}.`,
      "¿Te apetece que deje tu interés preparado para que el equipo revise disponibilidad? 🌸",
    ].join("\n");
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
