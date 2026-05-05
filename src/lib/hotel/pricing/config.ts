import { HOTEL_DEMO_CONFIG } from "../config";
import type { PricingConfig } from "./types";

const halfDaySupplement = HOTEL_DEMO_CONFIG.pricing.halfDaySupplement.amount;

export const demoPricingConfig: PricingConfig = {
  currency: "EUR",
  capDogCountAtFour: true,
  rates: {
    1: {
      dailyRate: HOTEL_DEMO_CONFIG.pricing.tiers[0].nightlyRate,
      halfDaySupplement,
    },
    2: {
      dailyRate: HOTEL_DEMO_CONFIG.pricing.tiers[1].nightlyRate,
      halfDaySupplement,
    },
    3: {
      dailyRate: HOTEL_DEMO_CONFIG.pricing.tiers[2].nightlyRate,
      halfDaySupplement,
    },
    4: {
      dailyRate: HOTEL_DEMO_CONFIG.pricing.tiers[3].nightlyRate,
      halfDaySupplement,
    },
  },
};
