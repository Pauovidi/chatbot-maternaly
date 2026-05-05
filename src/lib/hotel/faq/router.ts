import { HOTEL_DEMO_CONFIG } from "../config";
import { classifyFaqIntent } from "./classifier";
import { getFaqEntry } from "./catalog";
import type {
  FaqAction,
  FaqActionPreset,
  FaqIntentId,
  FaqResolution,
  FaqRuntimeLinks,
} from "./types";

const DEFAULT_RUNTIME_LINKS: FaqRuntimeLinks = {
  bookingFormUrl: HOTEL_DEMO_CONFIG.bookingFormUrl,
  lodgingInfoUrl: HOTEL_DEMO_CONFIG.bookingFormUrl,
  reservationsDemoUrl: "/reservas-demo",
  whatsappUrl: HOTEL_DEMO_CONFIG.whatsappUrl,
  contactPageUrl: "https://somosmuyperros.com/contacto/",
  contactEmail: "info@somosmuyperros.com",
  contactPhone: HOTEL_DEMO_CONFIG.whatsappPhone,
};

function extractPetCount(text: string) {
  const match = text.match(/\b([1-4])\s*perros?\b/);
  return match ? Number(match[1]) : null;
}

function formatHotelPriceReply(text: string) {
  const petCount = extractPetCount(text);
  const suffix =
    " Una reserva de 1 día incluye entrada y salida por la mañana; si no se recoge por la mañana en la franja marcada, se cobra suplemento equivalente a medio día.";
  if (petCount === 1) {
    return `La tarifa publicada para 2026 es 30 € por noche para 1 perro.${suffix}`;
  }
  if (petCount === 2) {
    return `La tarifa publicada para 2026 es 45 € por noche para 2 perros.${suffix}`;
  }
  if (petCount === 3) {
    return `La tarifa publicada para 2026 es 50 € por noche para 3 perros.${suffix}`;
  }
  if (petCount === 4) {
    return `La tarifa publicada para 2026 es 55 € por noche para 4 perros.${suffix}`;
  }

  return `Las tarifas publicadas para 2026 son 30 € por noche para 1 perro, 45 € para 2, 50 € para 3 y 55 € para 4.${suffix}`;
}

function buildActionFromPreset(
  preset: FaqActionPreset,
  runtime: FaqRuntimeLinks,
): FaqAction | null {
  if (preset === "lodging_info" && runtime.lodgingInfoUrl) {
    return {
      label: "Cómo funciona el alojamiento",
      url: runtime.lodgingInfoUrl,
    };
  }

  if (preset === "booking_form") {
    return {
      label: "Ir al formulario de reserva",
      url: runtime.bookingFormUrl,
    };
  }

  if (preset === "reservations_demo" && runtime.reservationsDemoUrl) {
    return {
      label: "Ver reservas demo",
      url: runtime.reservationsDemoUrl,
    };
  }

  if (preset === "whatsapp_contact" && runtime.whatsappUrl) {
    return {
      label: "Abrir WhatsApp",
      url: runtime.whatsappUrl,
    };
  }

  if (preset === "contact_page" && runtime.contactPageUrl) {
    return {
      label: "Ver contacto",
      url: runtime.contactPageUrl,
    };
  }

  return null;
}

function buildActions(intent: FaqIntentId, runtime: FaqRuntimeLinks) {
  const entry = getFaqEntry(intent);
  if (!entry?.actionPresets) {
    return [];
  }

  return entry.actionPresets
    .map((preset) => buildActionFromPreset(preset, runtime))
    .filter((action): action is FaqAction => action !== null);
}

function buildReply(intent: FaqIntentId, text: string) {
  const entry = getFaqEntry(intent);
  if (!entry) {
    return "Ese caso prefiero que lo revise una persona del equipo para no darte una respuesta incorrecta.";
  }

  if (intent === "faq_precio_hotel") {
    return formatHotelPriceReply(text);
  }

  if (intent === "workflow_disponibilidad") {
    return "Para comprobar disponibilidad real usamos el flujo operativo existente con fechas y turnos. En producción entra por el formulario del hotel canino; cuando se revisa, confirmamos disponibilidad y coste por el canal adecuado.";
  }

  if (intent === "workflow_reserva") {
    return "Si ya quieres tramitar una reserva, pásala por el formulario. Así revisamos disponibilidad, calculamos el precio correcto y te confirmamos por WhatsApp.";
  }

  if (intent === "handoff_humano") {
    return "Ese caso prefiero que lo revise una persona del equipo antes de darte una respuesta cerrada. Escríbenos o llámanos y te orientamos contigo en detalle.";
  }

  return entry.answer;
}

export function resolveFaqQuery(
  text: string,
  runtimeOverrides: Partial<FaqRuntimeLinks> = {},
): FaqResolution {
  const runtime: FaqRuntimeLinks = {
    ...DEFAULT_RUNTIME_LINKS,
    ...runtimeOverrides,
  };
  const classification = classifyFaqIntent(text);
  const entry = getFaqEntry(classification.intent);

  if (!entry) {
    throw new Error(`No existe una entrada FAQ para el intent ${classification.intent}`);
  }

  return {
    intent: classification.intent,
    category: classification.category,
    outputType: classification.outputType,
    label: entry.label,
    reply: buildReply(classification.intent, text),
    actions: buildActions(classification.intent, runtime),
    score: classification.score,
    matchedSignals: classification.matchedSignals,
    usedFallback: classification.usedFallback,
  };
}
