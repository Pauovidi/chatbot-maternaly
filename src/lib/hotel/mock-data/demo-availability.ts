import { HOTEL_DEMO_CONFIG } from "../config";
import type { AvailabilityDaySnapshot, AvailabilityResult } from "../domain/contracts";

export const DEMO_AVAILABILITY_DAY_SNAPSHOTS: AvailabilityDaySnapshot[] = [
  {
    date: "2026-08-17",
    morningOccupied: 12,
    afternoonOccupied: 10,
    morningCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    afternoonCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  },
  {
    date: "2026-08-18",
    morningOccupied: 13,
    afternoonOccupied: 11,
    morningCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    afternoonCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  },
  {
    date: "2026-09-10",
    morningOccupied: 18,
    afternoonOccupied: 18,
    morningCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
    afternoonCapacity: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  },
];

export const DEMO_AVAILABILITY_RESULT_OK: AvailabilityResult = {
  isAvailable: true,
  requiresReview: false,
  capacityPerSlot: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  overflowUsed: false,
  blockingDates: [],
  snapshot: DEMO_AVAILABILITY_DAY_SNAPSHOTS.slice(0, 2),
};

export const DEMO_AVAILABILITY_RESULT_FULL: AvailabilityResult = {
  isAvailable: false,
  requiresReview: false,
  capacityPerSlot: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  overflowUsed: false,
  blockingDates: ["2026-09-10"],
  snapshot: [DEMO_AVAILABILITY_DAY_SNAPSHOTS[2]],
};

export const DEMO_AVAILABILITY_RESULT_REVIEW: AvailabilityResult = {
  isAvailable: true,
  requiresReview: true,
  capacityPerSlot: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  overflowUsed: false,
  blockingDates: [],
  snapshot: DEMO_AVAILABILITY_DAY_SNAPSHOTS.slice(0, 2),
};

