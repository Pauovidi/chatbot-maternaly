import { HOTEL_FAQ_DEMO_EXAMPLES, HOTEL_FAQ_SECTIONS } from "@/lib/hotel/content/faq";
import { DEMO_SAMPLE_EMAILS } from "@/lib/hotel/parser";

export const demoFormUrl = "https://somosmuyperros.com/hotel-canino/";

export const demoOperationalBanner =
  "Operativa conectada: emails, conversaciones y registro de entrada.";

export const demoNavItems = [
  { href: "/", label: "Inicio" },
  { href: "/ops", label: "Recepción emails" },
  { href: "/admin/conversations", label: "Panel conversaciones" },
];

export const demoRoutes = [
  {
    href: "/",
    label: "Inicio",
    description: "Chatbot protagonista, respuestas rápidas y CTA directo al formulario web.",
  },
  {
    href: "/ops",
    label: "Recepción emails",
    description: "Zona secundaria con parser, disponibilidad, precio, recordatorios y admin.",
  },
  {
    href: "/admin/conversations",
    label: "Panel conversaciones",
    description: "Inbox de WhatsApp con modo bot/humano, handoff y respuesta manual.",
  },
];

export const demoFaqTopics = HOTEL_FAQ_SECTIONS.flatMap((section) =>
  section.entries.map((entry) => ({
    key: entry.id,
    label: entry.question,
    question: entry.question,
    answer: entry.answer,
  })),
);

export const demoFaqQuickPrompts = HOTEL_FAQ_DEMO_EXAMPLES.map((entry) => ({
  key: entry.intent,
  label: entry.label,
  question: entry.question,
  outputType: entry.outputType,
}));

export const demoSampleEmails = DEMO_SAMPLE_EMAILS;

export const reservationStatusLabels = {
  pendiente: "Pendiente de revisión",
  disponible: "Disponible",
  sin_disponibilidad: "Sin disponibilidad",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
} as const;

export function formatSpanishDate(value?: string): string {
  if (!value) {
    return "Pendiente";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatSpanishDateTime(value?: string): string {
  if (!value) {
    return "Pendiente";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null) {
    return "Pendiente";
  }

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatTurn(value?: string): string {
  if (!value) {
    return "Pendiente";
  }

  if (value === "manana" || value === "morning") {
    return "Mañana";
  }

  if (value === "tarde" || value === "afternoon") {
    return "Tarde";
  }

  return value;
}
