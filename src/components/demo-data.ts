import { HOTEL_FAQ_DEMO_EXAMPLES, HOTEL_FAQ_SECTIONS } from "@/lib/hotel/content/faq";
import { DEMO_SAMPLE_EMAILS } from "@/lib/hotel/parser";

export const demoFormUrl = "https://somosmuyperros.com/hotel-canino/";

export const demoOperationalBanner =
  "Demo con FAQ comercial, procesamiento de emails, disponibilidad por turnos y recordatorios 48 h.";

export const demoNavItems = [
  { href: "/", label: "Demo pública" },
  { href: "/ops", label: "Ops" },
];

export const demoRoutes = [
  {
    href: "/",
    label: "Demo pública",
    description: "Chatbot protagonista, quick replies y CTA directo al formulario real.",
  },
  {
    href: "/ops",
    label: "Ops",
    description: "Zona secundaria con parser, disponibilidad, precio, recordatorios y admin.",
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
