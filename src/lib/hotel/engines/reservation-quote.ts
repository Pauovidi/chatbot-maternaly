import { evaluateAvailability } from "../availability/engine";
import type {
  AvailabilityResult,
  CapacityConfig,
  ExistingStay,
  StayWindow,
} from "../availability/types";
import { quoteStayPrice } from "../pricing/engine";
import type { PricingConfig, PricingQuote } from "../pricing/types";

export interface ReservationQuoteRequest {
  stay: StayWindow;
  dogs: number;
  unitsRequired?: number;
  existingStays?: ExistingStay[];
  capacity: CapacityConfig;
  pricing: PricingConfig;
}

export interface ReservationQuoteResult {
  availability: AvailabilityResult;
  pricing: PricingQuote;
  unitsRequired: number;
}

export function quoteReservation(request: ReservationQuoteRequest): ReservationQuoteResult {
  const unitsRequired = request.unitsRequired ?? Math.max(1, request.dogs);
  const availability = evaluateAvailability({
    requestedWindow: request.stay,
    requestedUnits: unitsRequired,
    existingStays: request.existingStays ?? [],
    capacity: request.capacity,
  });
  const pricing = quoteStayPrice(
    {
      stay: request.stay,
      dogs: request.dogs,
    },
    request.pricing,
  );

  return {
    availability,
    pricing,
    unitsRequired,
  };
}

