import { HOTEL_DEMO_CONFIG } from "../config";
import type { CapacityConfig } from "./types";

export const demoAvailabilityConfig: CapacityConfig = {
  standardUnits: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  overflowUnits: HOTEL_DEMO_CONFIG.capacity.overflowRoomsPerSlot,
  overflowEnabled: HOTEL_DEMO_CONFIG.capacity.allowOverflow,
};

export const conservativeAvailabilityConfig: CapacityConfig = {
  standardUnits: HOTEL_DEMO_CONFIG.capacity.standardRoomsPerSlot,
  overflowUnits: 0,
  overflowEnabled: false,
};
