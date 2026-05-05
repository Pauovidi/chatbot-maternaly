import type { StayWindow } from "../availability/types";

export type PricingBand = 1 | 2 | 3 | 4;

export interface PricingEntry {
  dailyRate: number;
  halfDaySupplement: number;
}

export interface PricingConfig {
  currency: "EUR";
  rates: Record<PricingBand, PricingEntry>;
  capDogCountAtFour?: boolean;
}

export interface PricingRequest {
  stay: StayWindow;
  dogs: number;
}

export interface PricingQuote {
  currency: "EUR";
  dogs: number;
  rateBand: PricingBand;
  slotCount: number;
  fullDays: number;
  halfDays: number;
  dailyRate: number;
  halfDaySupplement: number;
  baseAmount: number;
  halfDayAmount: number;
  total: number;
}

