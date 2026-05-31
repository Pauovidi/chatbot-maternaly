import { DEMO_SAMPLE_EMAILS } from "@/lib/hotel/parser";
import {
  MATERNALY_CHAT_QUICK_ACTIONS,
  resolveMaternalyChatReply,
} from "@/lib/maternaly/public-chat";

export const demoFormUrl = "https://maternaly.es/";

export const demoOperationalBanner =
  "Maternaly V1: WhatsApp, LLM estructurado, Google Sheets en lectura/dry-run y panel humano.";

export const demoNavItems = [
  { href: "/", label: "Inicio" },
  { href: "/ops", label: "Operativa" },
  { href: "/admin/conversations", label: "Panel conversaciones" },
];

export const demoRoutes = [
  {
    href: "/",
    label: "Inicio",
    description: "Chatbot WhatsApp-first con respuestas seguras y derivacion humana.",
  },
  {
    href: "/ops",
    label: "Operativa",
    description: "Zona para revisar disponibilidad, escritura dry-run y estado de integraciones.",
  },
  {
    href: "/admin/conversations",
    label: "Panel conversaciones",
    description: "Inbox de WhatsApp con modo bot/humano, servicio, Sheets, pago y factura.",
  },
];

export const demoFaqTopics = MATERNALY_CHAT_QUICK_ACTIONS.map((question) => ({
  key: question,
  label: question,
  question,
  answer: resolveMaternalyChatReply(question).text,
}));

export const demoFaqQuickPrompts = MATERNALY_CHAT_QUICK_ACTIONS.map((question) => ({
  key: question,
  label: question,
  question,
  outputType: "workflow",
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
