import type { ReservationFlowTurn } from "../domain/slots";

type ReservationMomentContext = "entrada" | "salida";

export interface ReceptionTimeNormalization {
  originalRequestedTime: string;
  normalizedReceptionTime: string;
  wasAdjusted: boolean;
  turn: ReservationFlowTurn;
  explanation: string;
}

export interface NormalizedReservationMoment {
  raw: string;
  isoDate?: string;
  time?: string;
  originalRequestedTime?: string;
  normalizedReceptionTime?: string;
  wasTimeAdjusted: boolean;
  timeAdjustmentExplanation?: string;
  turn?: ReservationFlowTurn;
  inferredTurn: boolean;
  needsReview: boolean;
  notes: string[];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function buildIsoDate(year: number, month: number, day: number): string {
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return candidate;
  }

  return candidate;
}

export function normalizeDateValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const isoMatch = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return buildIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashMatch = trimmed.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (slashMatch) {
    return buildIsoDate(Number(slashMatch[3]), Number(slashMatch[2]), Number(slashMatch[1]));
  }

  return undefined;
}

export function normalizeTimeValue(value: string): string | undefined {
  const match =
    value.match(/\b(\d{1,2})[:.](\d{2})\b/) ??
    value.match(/\ba\s+las\s+(\d{1,2})(?:\s*h)?\b/i) ??
    value.match(/\b(\d{1,2})h\b/i);

  if (!match) {
    return undefined;
  }

  return `${pad(Number(match[1]))}:${match[2] ?? "00"}`;
}

export function resolveTurnFromText(value: string): ReservationFlowTurn | undefined {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized.includes("manana") ||
    normalized.includes("turno de manana") ||
    normalized.includes("morning")
  ) {
    return "manana";
  }

  if (
    normalized.includes("tarde") ||
    normalized.includes("turno de tarde") ||
    normalized.includes("afternoon")
  ) {
    return "tarde";
  }

  return undefined;
}

function compareTimes(left: string, right: string): number {
  return left.localeCompare(right);
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isWithinRange(time: string, start: string, end: string): boolean {
  return compareTimes(time, start) >= 0 && compareTimes(time, end) <= 0;
}

function resolveTurnFromReceptionTime(time: string): ReservationFlowTurn {
  return compareTimes(time, "16:30") >= 0 ? "tarde" : "manana";
}

export function normalizeReceptionTime(time: string): ReceptionTimeNormalization {
  const originalRequestedTime = normalizeTimeValue(time) ?? time.trim();

  if (isWithinRange(originalRequestedTime, "08:00", "11:00")) {
    return {
      originalRequestedTime,
      normalizedReceptionTime: originalRequestedTime,
      wasAdjusted: false,
      turn: "manana",
      explanation: "La hora solicitada esta dentro del horario de recepcion de manana.",
    };
  }

  if (isWithinRange(originalRequestedTime, "16:30", "19:30")) {
    return {
      originalRequestedTime,
      normalizedReceptionTime: originalRequestedTime,
      wasAdjusted: false,
      turn: "tarde",
      explanation: "La hora solicitada esta dentro del horario de recepcion de tarde.",
    };
  }

  const requestedMinutes = timeToMinutes(originalRequestedTime);
  const boundaryTimes = ["08:00", "11:00", "16:30", "19:30"];
  const normalizedReceptionTime = boundaryTimes
    .map((boundary) => ({
      boundary,
      distance: Math.abs(timeToMinutes(boundary) - requestedMinutes),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.boundary ?? "08:00";

  return {
    originalRequestedTime,
    normalizedReceptionTime,
    wasAdjusted: true,
    turn: resolveTurnFromReceptionTime(normalizedReceptionTime),
    explanation:
      `La hora solicitada (${originalRequestedTime}) esta fuera del horario operativo. ` +
      `Aplicamos la hora valida mas cercana: ${normalizedReceptionTime}. ` +
      "Horario del centro: 08:00-11:00 y 16:30-19:30.",
  };
}

export function inferTurnFromTime(
  time: string,
  context: ReservationMomentContext,
): {
  turn?: ReservationFlowTurn;
  inferred: boolean;
  invalidSlot: boolean;
  note?: string;
} {
  const normalized = normalizeReceptionTime(time);

  return {
    turn: normalized.turn,
    inferred: normalized.wasAdjusted,
    invalidSlot: false,
    note: normalized.wasAdjusted
      ? `Hora de ${context} ajustada: ${normalized.explanation}`
      : undefined,
  };
}

export function normalizeReservationMoment(
  rawValue: string | undefined,
  context: ReservationMomentContext,
): NormalizedReservationMoment {
  const raw = rawValue?.trim() ?? "";
  const isoDate = raw ? normalizeDateValue(raw) : undefined;
  const time = raw ? normalizeTimeValue(raw) : undefined;
  const textTurn = raw ? resolveTurnFromText(raw) : undefined;
  const receptionTime = time ? normalizeReceptionTime(time) : undefined;
  const notes: string[] = [];
  let turn = textTurn;
  let inferredTurn = false;
  let needsReview = false;

  if (time && !turn) {
    turn = receptionTime?.turn;
    inferredTurn = Boolean(receptionTime?.wasAdjusted);
  }

  if (receptionTime?.wasAdjusted) {
    notes.push(`Hora de ${context} ajustada: ${receptionTime.explanation}`);
  }

  if (!isoDate && raw) {
    needsReview = true;
    notes.push(`No se ha podido normalizar la fecha de ${context}.`);
  }

  return {
    raw,
    isoDate,
    time,
    originalRequestedTime: receptionTime?.originalRequestedTime,
    normalizedReceptionTime: receptionTime?.normalizedReceptionTime,
    wasTimeAdjusted: Boolean(receptionTime?.wasAdjusted),
    timeAdjustmentExplanation: receptionTime?.wasAdjusted
      ? receptionTime.explanation
      : undefined,
    turn,
    inferredTurn,
    needsReview,
    notes,
  };
}
