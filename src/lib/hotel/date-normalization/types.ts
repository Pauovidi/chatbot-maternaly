import type { HotelSlot } from "../domain/slots";

export type ReservationSlot = HotelSlot;

export interface SlotWindow {
  start: string;
  end: string;
}

export interface DateNormalizationOptions {
  referenceDate?: Date;
  slotWindows?: Record<ReservationSlot, SlotWindow>;
  defaultTimeZone?: string;
}

export type DateNormalizationFlag =
  | "missing_date"
  | "missing_time"
  | "invalid_date"
  | "unrecognized_date_format"
  | "ambiguous_slot"
  | "outside_business_window"
  | "slot_conflict";

export interface DateNormalizationResult {
  original: string;
  normalizedDate: string | null;
  normalizedTime: string | null;
  slot: ReservationSlot | null;
  slotSource: "explicit" | "inferred" | "unknown";
  flags: DateNormalizationFlag[];
  confidence: number;
}
