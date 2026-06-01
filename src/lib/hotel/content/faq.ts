import {
  FAQ_CATEGORY_DEFINITIONS,
  FAQ_DEMO_PROMPTS,
  FAQ_KNOWLEDGE_ENTRIES,
  getFaqCategory,
} from "../faq/catalog";
import type {
  FaqCategoryId,
  FaqIntentId,
  FaqOutputType,
} from "../faq/types";
import { uniqueFaqStrings } from "../faq/text";
import { HOTEL_DEMO_CONFIG } from "../config";

export interface FaqEntry {
  id: string;
  intent: FaqIntentId;
  categoryId: FaqCategoryId;
  outputType: FaqOutputType;
  question: string;
  answer: string;
  ctaLabel?: string;
  ctaUrl?: string;
  keywords: string[];
}

export interface FaqSection {
  id: FaqCategoryId;
  title: string;
  summary: string;
  entries: FaqEntry[];
}

function inferCta(entry: (typeof FAQ_KNOWLEDGE_ENTRIES)[number]) {
  if (!entry.actionPresets?.length) {
    return {};
  }

  if (entry.actionPresets.includes("lodging_info")) {
    return {
      ctaLabel: "Cómo funciona el alojamiento",
      ctaUrl: HOTEL_DEMO_CONFIG.bookingFormUrl,
    };
  }

  if (entry.actionPresets.includes("booking_form")) {
    return {
      ctaLabel: "Ir al formulario de reserva",
      ctaUrl: HOTEL_DEMO_CONFIG.bookingFormUrl,
    };
  }

  if (entry.actionPresets.includes("whatsapp_contact")) {
    return {
      ctaLabel: "Abrir WhatsApp",
      ctaUrl: HOTEL_DEMO_CONFIG.whatsappUrl,
    };
  }

  if (entry.actionPresets.includes("contact_page")) {
    return {
      ctaLabel: "Ver contacto",
      ctaUrl: "https://somosmuyperros.com/contacto/",
    };
  }

  if (entry.actionPresets.includes("reservations_demo")) {
    return {
      ctaLabel: "Ver flujo interno",
      ctaUrl: "/admin/conversations",
    };
  }

  return {};
}

export const HOTEL_FAQ_ENTRIES: FaqEntry[] = FAQ_KNOWLEDGE_ENTRIES.map((entry) => ({
  id: entry.intent,
  intent: entry.intent,
  categoryId: entry.category,
  outputType: entry.outputType,
  question: entry.question,
  answer: entry.answer,
  keywords: uniqueFaqStrings([
    entry.question,
    ...entry.examples,
    ...entry.synonyms,
  ]),
  ...inferCta(entry),
}));

export const HOTEL_FAQ_SECTIONS: FaqSection[] = FAQ_CATEGORY_DEFINITIONS.map((category) => ({
  id: category.id,
  title: category.title,
  summary: category.summary,
  entries: HOTEL_FAQ_ENTRIES.filter((entry) => entry.categoryId === category.id),
}));

export const HOTEL_FAQ_DEMO_EXAMPLES = FAQ_DEMO_PROMPTS;

export function findFaqEntriesByKeyword(term: string): FaqEntry[] {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return HOTEL_FAQ_ENTRIES.filter((entry) =>
    entry.keywords.some((keyword) => {
      const haystack = keyword.toLowerCase();
      return haystack.includes(normalized) || normalized.includes(haystack);
    }),
  );
}

export function getFaqSectionById(categoryId: FaqCategoryId) {
  return getFaqCategory(categoryId);
}
