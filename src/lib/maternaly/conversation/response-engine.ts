import { getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import { MaternalyConversationInterpreter } from "@/lib/maternaly/llm/interpreter";
import type { StructuredIntent } from "@/lib/maternaly/llm/interpreter";

export const MATERNALY_SAFE_FALLBACK =
  "Hola, soy el asistente de Maternaly. Puedo orientarte sobre Pilates, AIPAP Agua, AIPAP Terra, Preparación al Parto, Suelo Pélvico, Lactancia, Diagnóstico Prenatal y talleres. ¿Sobre qué servicio necesitas información?";

const LEGACY_HOTEL_PATTERNS = [
  /\bhotel(?:es)?\b/i,
  /\bperr[oa]s?\b/i,
  /\bcanin[oa]s?\b/i,
  /\bvacunas?\b/i,
  /\bcomida\b/i,
  /\bvisitas?\b/i,
  /\bresidencia\b/i,
  /\bqu[eé]\s+traer\b/i,
  /\bsomos\s+perros\b/i,
];

export function containsLegacyHotelKnowledge(text: string): boolean {
  return LEGACY_HOTEL_PATTERNS.some((pattern) => pattern.test(text));
}

export function ensureMaternalySafeReply(candidate: string): string {
  const reply = candidate.trim();
  if (!reply || containsLegacyHotelKnowledge(reply)) {
    return MATERNALY_SAFE_FALLBACK;
  }

  return reply;
}

function buildServiceReply(intent: StructuredIntent): string {
  const service = getKnowledgeService(intent.service_candidate);
  if (!service) {
    return MATERNALY_SAFE_FALLBACK;
  }

  if (service.category === "reservable") {
    return [
      `Puedo orientarte sobre ${service.name}.`,
      "Para revisar disponibilidad necesito servicio, sede o zona, fecha aproximada y número de personas.",
      "No confirmo plaza hasta validarlo con una fuente real.",
    ].join(" ");
  }

  return [
    `Puedo orientarte sobre ${service.name}.`,
    service.requiresInterview
      ? "Este servicio requiere revisión del equipo antes de avanzar."
      : "Si necesitas disponibilidad o cita, recojo los datos y lo derivamos a revisión humana si falta una fuente validada.",
  ].join(" ");
}

export function buildMaternalyReplyFromIntent(intent: StructuredIntent): string {
  switch (intent.intent) {
    case "payment_question":
      return "Puedo ayudarte a distinguir pago pendiente y pago confirmado. No confirmaré una plaza ni un pago si no existe un estado real validado.";
    case "invoice_question":
      return "Puedo ayudarte con factura o justificante. Solo indicaré que está enviado o confirmado cuando exista un evento real; si falta, lo dejo pendiente para revisión del equipo.";
    case "handoff_request":
      return "Perfecto, derivo la conversación al equipo de Maternaly para que pueda revisarlo una persona.";
    case "reservation_interest":
    case "service_question":
      return buildServiceReply(intent);
    case "greeting":
    case "unknown":
      return MATERNALY_SAFE_FALLBACK;
  }
}

export async function buildMaternalyWhatsAppReply(
  message: string,
  interpreter = new MaternalyConversationInterpreter(),
): Promise<{ reply: string; intent: StructuredIntent }> {
  const intent = await interpreter.interpret(message);
  return {
    intent,
    reply: ensureMaternalySafeReply(buildMaternalyReplyFromIntent(intent)),
  };
}
