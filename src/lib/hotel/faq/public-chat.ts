import { HOTEL_DEMO_CONFIG } from "../config";
import { resolveFaqQuery } from "./router";
import type { FaqResolution, FaqRuntimeLinks } from "./types";

export const PUBLIC_CHAT_QUICK_ACTIONS = [
  "Quiero reservar una plaza",
  "¿Cuál es vuestro horario?",
  "¿Cuánto cuesta?",
  "¿Es recomendable dejar a mi perro en una residencia?",
  "¿Qué vacunas pedís?",
] as const;

export interface PublicChatReply {
  text: string;
  actions: FaqResolution["actions"];
  resolution: FaqResolution;
}

const DEFAULT_RUNTIME_LINKS: FaqRuntimeLinks = {
  bookingFormUrl: HOTEL_DEMO_CONFIG.bookingFormUrl,
  lodgingInfoUrl: HOTEL_DEMO_CONFIG.bookingFormUrl,
  whatsappUrl: HOTEL_DEMO_CONFIG.whatsappUrl,
  contactPageUrl: "https://somosmuyperros.com/contacto/",
  contactEmail: "info@somosmuyperros.com",
  contactPhone: HOTEL_DEMO_CONFIG.whatsappPhone,
};

export function getPublicChatWelcomeMessage() {
  return "Hola, soy el chat web del hotel canino. Puedo resolver preguntas frecuentes y, si quieres reservar, te llevaré al formulario oficial para que el equipo confirme disponibilidad y precio.";
}

export function resolvePublicChatReply(
  message: string,
  runtimeOverrides: Partial<FaqRuntimeLinks> = {},
): PublicChatReply {
  const resolution = resolveFaqQuery(message, {
    ...DEFAULT_RUNTIME_LINKS,
    ...runtimeOverrides,
  });

  return {
    text:
      resolution.intent === "workflow_disponibilidad"
        ? "Para comprobar disponibilidad real necesitamos que nos envíes la solicitud por el formulario con fechas y turnos. Cuando la revisemos, te confirmamos si hay hueco y el precio."
        : resolution.intent === "workflow_reserva"
          ? "Si ya quieres reservar una plaza, hazlo desde el formulario. En cuanto nos llegue, revisamos la solicitud y te confirmamos disponibilidad y precio."
          : resolution.reply,
    actions: resolution.actions.filter(
      (action) =>
        !action.url.startsWith("/ops") &&
        !action.url.startsWith("/reservas-demo"),
    ),
    resolution,
  };
}
