import type { PricingConfig } from "./types";

export const demoPricingSnapshot: PricingConfig = {
  currency: "EUR",
  capDogCountAtFour: true,
  rates: {
    1: {
      dailyRate: 28,
      halfDaySupplement: 14,
    },
    2: {
      dailyRate: 44,
      halfDaySupplement: 20,
    },
    3: {
      dailyRate: 58,
      halfDaySupplement: 26,
    },
    4: {
      dailyRate: 70,
      halfDaySupplement: 32,
    },
  },
};

