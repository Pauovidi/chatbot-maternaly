import { getStaySlotCount, isValidStayWindow } from "../engines/time";
import type { PricingBand, PricingConfig, PricingQuote, PricingRequest } from "./types";

function resolveBand(dogs: number, config: PricingConfig): PricingBand {
  if (dogs <= 1) {
    return 1;
  }

  if (dogs === 2) {
    return 2;
  }

  if (dogs === 3) {
    return 3;
  }

  if (dogs >= 4 && config.capDogCountAtFour !== false) {
    return 4;
  }

  if (dogs > 4 && config.capDogCountAtFour === false) {
    return 4;
  }

  return 4;
}

export function quoteStayPrice(request: PricingRequest, config: PricingConfig): PricingQuote {
  if (!isValidStayWindow(request.stay)) {
    throw new Error("La ventana de estancia no es valida para calcular precio");
  }

  if (request.dogs <= 0) {
    throw new Error("dogs debe ser mayor que cero");
  }

  const rateBand = resolveBand(request.dogs, config);
  const rateEntry = config.rates[rateBand];
  const slotCount = getStaySlotCount(request.stay);
  const fullDays = Math.floor(slotCount / 2);
  const halfDays = slotCount % 2;
  const baseAmount = fullDays * rateEntry.dailyRate;
  const halfDayAmount = halfDays * rateEntry.halfDaySupplement;

  return {
    currency: config.currency,
    dogs: request.dogs,
    rateBand,
    slotCount,
    fullDays,
    halfDays,
    dailyRate: rateEntry.dailyRate,
    halfDaySupplement: rateEntry.halfDaySupplement,
    baseAmount,
    halfDayAmount,
    total: baseAmount + halfDayAmount,
  };
}

