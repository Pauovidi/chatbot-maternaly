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
    peopleCount: "si vienes tú sola o en pareja",
    partnerName: "nombre de la pareja o acompañante",
    fppOrDueDate: "fecha probable de parto",
    babyBirthDate: "fecha de nacimiento del bebé",
  };
  return labels[field] ?? field;
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
        return "Listo, he reiniciado la conversación. ¿Quieres información sobre algún servicio de Maternaly o prefieres que te ayude con una inscripción?";
      case "handoff":
        return "Perfecto, dejo la conversación para que la revise el equipo de Maternaly. Cuéntame en una frase qué necesitas y lo verán con contexto.";
      case "privacy":
        return "Usamos los datos que nos das solo para gestionar tu consulta o solicitud de plaza con el equipo de Maternaly. Si quieres ejercer derechos de privacidad o borrar datos, lo derivo al equipo. ¿Quieres que lo deje anotado?";
      case "payment":
        return "Puedo orientarte sobre pagos, pero no doy una plaza por confirmada sin validación real del pago. Si quieres, dejo tu consulta de pago para que la revise el equipo.";
      case "invoice":
        return "Puedo dejar anotada la solicitud de factura o justificante. El equipo la revisará con el pago validado antes de emitir nada.";
      case "greeting":
        return "¡Hola! Soy el asistente de Maternaly. Puedo ayudarte con información o preparar tu solicitud para talleres y charlas. ¿Buscas algún servicio en concreto?";
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
    return "Ahora mismo no he podido procesarlo bien. Puedo ayudarte con información de Maternaly o dejar tu solicitud para que la revise el equipo. ¿Qué necesitas?";
  }

  private renderGeneral(): string {
    return "Puedo ayudarte con charlas de embarazo, taller BLW, Pilates, AIPAP, suelo pélvico, diagnóstico prenatal, lactancia o fisioterapia pediátrica. ¿Sobre qué servicio quieres información?";
  }

  private renderServiceInfo(service: KnowledgeService): string {
    const parts = [`${service.name}: ${service.summary}`, service.details[0], service.pricing?.[0] ? `Precio: ${service.pricing[0]}.` : ""]
      .filter(Boolean)
      .join(" ");
    return `${parts} ${service.nextQuestion}`;
  }

  private renderNormalizedRegistration(
    result: MaternalyCopyToolResult | undefined,
    service: KnowledgeService | null,
  ): string {
    if (!result) {
      return service ? this.renderServiceInfo(service) : this.renderGeneral();
    }

    if (result.status === "not_configured" || result.status === "read_error") {
      const serviceName = service?.name ?? MATERNALY_NORMALIZED_SERVICES[result.serviceKey].label;
      return `Puedo ayudarte con ${serviceName}, pero ahora no puedo validar disponibilidad automáticamente. Si me dejas nombre, teléfono y preferencia de fecha o sede, lo paso al equipo para revisión.`;
    }

    if (result.status === "sessions_available") {
      return this.renderSessions(result, service);
    }

    if (result.status === "collecting_fields") {
      const missing = result.missingFields.map(fieldLabel).join(", ");
      const selected = this.formatSession(result.selectedSession);
      return `Perfecto, preparo la solicitud para ${selected}. Para dejarla lista necesito: ${missing}.`;
    }

    const writeResult = result.writeResult;
    const blocked = result.plan?.blocked || !writeResult?.ok;
    if (blocked) {
      if (result.selectedSession?.full || result.plan?.blockedReasons.includes("session_full")) {
        return "Ahora mismo esa sesión aparece sin plazas libres. Puedo dejarte en lista de espera o pasar la solicitud al equipo para revisar otra opción.";
      }

      return "No puedo cerrar la solicitud automáticamente con los datos actuales. La dejo pendiente de revisión del equipo de Maternaly.";
    }

    if (writeResult?.mode === "live" && writeResult.applied) {
      return "Perfecto, dejo tu preinscripción registrada y pendiente de validación del equipo. La plaza no queda cerrada hasta que el pago o la revisión real estén validados.";
    }

    return "Perfecto, dejo tu solicitud preparada para revisión del equipo. La plaza no queda cerrada hasta que el pago o la revisión real estén validados.";
  }

  private renderSessions(result: MaternalyCopyToolResult, service: KnowledgeService | null): string {
    if (result.sessions.length === 0) {
      return "Ahora mismo no veo sesiones disponibles para ese servicio. Puedo recoger tus datos y dejarlo para que lo revise el equipo.";
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
      "Dime cuál prefieres y preparo la solicitud.",
    ].join("\n");
  }

  private formatSession(session: NormalizedAvailableSession | undefined): string {
    if (!session) {
      return "la sesión elegida";
    }

    return [session.date, session.startTime, session.groupName].filter(Boolean).join(" ") || session.sessionName;
  }
}
