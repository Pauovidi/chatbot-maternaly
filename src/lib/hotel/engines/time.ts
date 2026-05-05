export type DaySlot = "morning" | "afternoon";

export interface CalendarSlot {
  date: string;
  slot: DaySlot;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SLOT_INDEX: Record<DaySlot, 0 | 1> = {
  morning: 0,
  afternoon: 1,
};

export function normalizeDaySlot(value: string): DaySlot | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized === "morning" ||
    normalized === "manana" ||
    normalized === "matinal" ||
    normalized === "am"
  ) {
    return "morning";
  }

  if (
    normalized === "afternoon" ||
    normalized === "tarde" ||
    normalized === "pm"
  ) {
    return "afternoon";
  }

  return null;
}

export function isDaySlot(value: unknown): value is DaySlot {
  return value === "morning" || value === "afternoon";
}

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Fecha ISO no valida: ${value}`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Fecha ISO no valida: ${value}`);
  }

  return parsed;
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const parsed = parseDateOnly(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDateOnly(parsed);
}

export function toEpochDay(date: string): number {
  return Math.floor(parseDateOnly(date).getTime() / MS_PER_DAY);
}

export function fromEpochDay(day: number): string {
  return formatDateOnly(new Date(day * MS_PER_DAY));
}

export function toPointIndex(slot: CalendarSlot): number {
  return toEpochDay(slot.date) * 2 + SLOT_INDEX[slot.slot];
}

export function fromPointIndex(index: number): CalendarSlot {
  const day = Math.floor(index / 2);
  const slotIndex = index % 2;

  return {
    date: fromEpochDay(day),
    slot: slotIndex === 0 ? "morning" : "afternoon",
  };
}

export function compareCalendarSlots(left: CalendarSlot, right: CalendarSlot): number {
  return toPointIndex(left) - toPointIndex(right);
}

export function getStayStartPoint(window: { checkIn: CalendarSlot }): number {
  return toPointIndex(window.checkIn);
}

export function getStayFreePoint(window: { checkOut: CalendarSlot }): number {
  return toPointIndex(window.checkOut) + 1;
}

export function getStaySlotCount(window: {
  checkIn: CalendarSlot;
  checkOut: CalendarSlot;
}): number {
  return getStayFreePoint(window) - getStayStartPoint(window);
}

export function isValidStayWindow(window: {
  checkIn: CalendarSlot;
  checkOut: CalendarSlot;
}): boolean {
  return getStayFreePoint(window) > getStayStartPoint(window);
}

export function expandStayWindow(window: {
  checkIn: CalendarSlot;
  checkOut: CalendarSlot;
}): CalendarSlot[] {
  if (!isValidStayWindow(window)) {
    return [];
  }

  const start = getStayStartPoint(window);
  const end = getStayFreePoint(window);
  const slots: CalendarSlot[] = [];

  for (let point = start; point < end; point += 1) {
    slots.push(fromPointIndex(point));
  }

  return slots;
}

