import {
  expandStayWindow,
  fromPointIndex,
  getStaySlotCount,
  isValidStayWindow,
  toPointIndex,
} from "../engines/time";
import type {
  AvailabilityBottleneck,
  AvailabilityRequest,
  AvailabilityResult,
  AvailabilityStatus,
  CapacityConfig,
  ExistingStay,
  OccupancyPointSnapshot,
  SlotOccupancySnapshot,
} from "./types";

function resolveTotalCapacity(capacity: CapacityConfig): number {
  return capacity.standardUnits + (capacity.overflowEnabled ? capacity.overflowUnits ?? 0 : 0);
}

function buildOccupancyMap(existingStays: ExistingStay[]): Map<number, number> {
  const occupancy = new Map<number, number>();

  for (const stay of existingStays) {
    if (stay.units <= 0) {
      throw new Error(`Cada reserva existente debe ocupar al menos 1 unidad: ${stay.id}`);
    }

    if (!isValidStayWindow(stay.window)) {
      throw new Error(`Ventana invalida en reserva existente: ${stay.id}`);
    }

    for (const slot of expandStayWindow(stay.window)) {
      const point = toPointIndex(slot);
      occupancy.set(point, (occupancy.get(point) ?? 0) + stay.units);
    }
  }

  return occupancy;
}

export function summarizeOccupancy(existingStays: ExistingStay[]): OccupancyPointSnapshot[] {
  const occupancy = buildOccupancyMap(existingStays);

  return Array.from(occupancy.entries())
    .sort(([left], [right]) => left - right)
    .map(([pointIndex, occupiedUnits]) => {
      const slot = fromPointIndex(pointIndex);

      return {
        pointIndex,
        date: slot.date,
        slot: slot.slot,
        occupiedUnits,
      };
    });
}

export function evaluateAvailability(request: AvailabilityRequest): AvailabilityResult {
  if (request.requestedUnits <= 0) {
    throw new Error("requestedUnits debe ser mayor que cero");
  }

  if (!isValidStayWindow(request.requestedWindow)) {
    return {
      status: "invalid_window",
      requestedUnits: request.requestedUnits,
      standardCapacity: request.capacity.standardUnits,
      overflowCapacity: request.capacity.overflowEnabled ? request.capacity.overflowUnits ?? 0 : 0,
      totalCapacity: resolveTotalCapacity(request.capacity),
      occupiedSlotCount: 0,
      slotSnapshots: [],
      bottlenecks: [],
    };
  }

  const standardCapacity = request.capacity.standardUnits;
  const overflowCapacity = request.capacity.overflowEnabled ? request.capacity.overflowUnits ?? 0 : 0;
  const totalCapacity = standardCapacity + overflowCapacity;
  const occupancy = buildOccupancyMap(request.existingStays);
  const requestedSlots = expandStayWindow(request.requestedWindow);
  const snapshots: SlotOccupancySnapshot[] = [];
  const bottlenecks: AvailabilityBottleneck[] = [];
  let overallStatus: AvailabilityStatus = "available_standard";

  for (const slot of requestedSlots) {
    const pointIndex = toPointIndex(slot);
    const occupiedUnits = occupancy.get(pointIndex) ?? 0;
    const afterRequestedUnits = occupiedUnits + request.requestedUnits;
    const standardRemaining = Math.max(0, standardCapacity - occupiedUnits);
    const totalRemaining = Math.max(0, totalCapacity - occupiedUnits);

    let slotStatus: AvailabilityStatus;
    if (afterRequestedUnits <= standardCapacity) {
      slotStatus = "available_standard";
    } else if (request.capacity.overflowEnabled && afterRequestedUnits <= totalCapacity) {
      slotStatus = "available_overflow";
    } else {
      slotStatus = "unavailable";
    }

    snapshots.push({
      pointIndex,
      date: slot.date,
      slot: slot.slot,
      occupiedUnits,
      standardCapacity,
      totalCapacity,
      remainingStandardUnits: standardRemaining,
      remainingTotalUnits: totalRemaining,
      requestedUnits: request.requestedUnits,
      status: slotStatus,
    });

    if (slotStatus === "unavailable") {
      overallStatus = "unavailable";
      bottlenecks.push({
        pointIndex,
        date: slot.date,
        slot: slot.slot,
        occupiedUnits,
        requestedUnits: request.requestedUnits,
        standardCapacity,
        totalCapacity,
        reason: request.capacity.overflowEnabled ? "overflow_full" : "standard_full",
      });
    } else if (slotStatus === "available_overflow" && overallStatus !== "unavailable") {
      overallStatus = "available_overflow";
      bottlenecks.push({
        pointIndex,
        date: slot.date,
        slot: slot.slot,
        occupiedUnits,
        requestedUnits: request.requestedUnits,
        standardCapacity,
        totalCapacity,
        reason: "standard_full",
      });
    }
  }

  return {
    status: overallStatus,
    requestedUnits: request.requestedUnits,
    standardCapacity,
    overflowCapacity,
    totalCapacity,
    occupiedSlotCount: getStaySlotCount(request.requestedWindow),
    slotSnapshots: snapshots,
    bottlenecks,
  };
}

export function canFitAvailability(request: AvailabilityRequest): boolean {
  const result = evaluateAvailability(request);
  return result.status !== "unavailable" && result.status !== "invalid_window";
}
