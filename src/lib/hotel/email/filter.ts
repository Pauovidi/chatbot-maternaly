import type { EmailSourceMessage, NormalizedEmailContent } from "./types";

const SUBJECT_MARKERS = [
  "reserva",
  "reservas",
  "solicitud",
  "hotel",
  "perro",
  "perros",
  "gespet",
];

const BODY_MARKERS = [
  "cliente:",
  "fecha entrada",
  "fecha salida",
  "animales:",
  "whatsapp:",
  "teléfono:",
  "telefono:",
  "entrada:",
  "salida:",
  "quiero dejar",
  "quiero reservar",
  "dejar a",
  "por la mañana",
  "por la tarde",
  "perro",
  "perros",
];

const NEGATIVE_MARKERS = [
  "newsletter",
  "marketing",
  "unsubscribe",
  "promo",
  "spam",
];

export interface EmailRelevanceResult {
  relevant: boolean;
  score: number;
  reasons: string[];
}

export function evaluateEmailRelevance(
  message: Pick<EmailSourceMessage, "subject" | "from">,
  normalized: Pick<NormalizedEmailContent, "normalizedText">,
): EmailRelevanceResult {
  const subject = `${message.subject ?? ""}`.toLowerCase();
  const from = `${message.from ?? ""}`.toLowerCase();
  const body = normalized.normalizedText.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  for (const marker of SUBJECT_MARKERS) {
    if (subject.includes(marker)) {
      score += 2;
      reasons.push(`subject:${marker}`);
    }
  }

  for (const marker of BODY_MARKERS) {
    if (body.includes(marker)) {
      score += 2;
      reasons.push(`body:${marker}`);
    }
  }

  if (from.includes("somosmuyperros") || from.includes("gespet")) {
    score += 3;
    reasons.push("trusted_sender");
  }

  if (body.includes("reserva de hotel") || body.includes("nueva solicitud de reserva")) {
    score += 4;
    reasons.push("structured_reservation");
  }

  if (NEGATIVE_MARKERS.some((marker) => subject.includes(marker) || body.includes(marker))) {
    score -= 4;
    reasons.push("negative_signal");
  }

  const relevant = score >= 3;
  if (!relevant) {
    reasons.push("below_threshold");
  }

  return {
    relevant,
    score,
    reasons,
  };
}
