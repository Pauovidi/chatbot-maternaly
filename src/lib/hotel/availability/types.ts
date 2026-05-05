import type { CalendarSlot, DaySlot } from "../engines/time";

export type AvailabilityStatus =
  | "available_standard"
  | "available_overflow"
  | "unavailable"
  | "invalid_window";

export interface StayWindow {
  checkIn: CalendarSlot;
  checkOut: CalendarSlot;
}

export interface CapacityConfig {
  standardUnits: number;
  overflowUnits?: number;
  overflowEnabled?: boolean;
}

export interface ExistingStay {
  id: string;
  window: StayWindow;
  units: number;
  label?: string;
}

export interface AvailabilityRequest {
  requestedWindow: StayWindow;
  requestedUnits: number;
  existingStays: ExistingStay[];
  capacity: CapacityConfig;
}

export interface SlotOccupancySnapshot {
  pointIndex: number;
  date: string;
  slot: DaySlot;
  occupiedUnits: number;
  standardCapacity: number;
  totalCapacity: number;
  remainingStandardUnits: number;
  remainingTotalUnits: number;
  requestedUnits: number;
  status: AvailabilityStatus;
}

export interface OccupancyPointSnapshot {
  pointIndex: number;
  date: string;
  slot: DaySlot;
  occupiedUnits: number;
}

export interface AvailabilityBottleneck {
  pointIndex: number;
  date: string;
  slot: DaySlot;
  occupiedUnits: number;
  requestedUnits: number;
  standardCapacity: number;
  totalCapacity: number;
  reason: "standard_full" | "overflow_full";
}

export interface AvailabilityResult {
  status: AvailabilityStatus;
  requestedUnits: number;
  standardCapacity: number;
  overflowCapacity: number;
  totalCapacity: number;
  occupiedSlotCount: number;
  slotSnapshots: SlotOccupancySnapshot[];
  bottlenecks: AvailabilityBottleneck[];
}
