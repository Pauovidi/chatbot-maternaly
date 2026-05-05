import type { HotelDemoConfig } from "@/lib/hotel/integrations/types";

export const hotelDemoConfig: HotelDemoConfig = {
  bookingFormUrl: "https://somosmuyperros.com/hotel-canino/",
  defaultTimezone: "Europe/Madrid",
  defaultCapacityPerMonth: 18,
  overflowCapacityPerMonth: 0,
  sheetNaming: "yyyy-mm",
  slotLabels: {
    morning: "08:00-11:00",
    afternoon: "16:30-19:30",
  },
  pricingBands: [
    { dogs: 1, baseRate: 32, halfDaySupplement: 8 },
    { dogs: 2, baseRate: 58, halfDaySupplement: 10 },
    { dogs: 3, baseRate: 84, halfDaySupplement: 12 },
    { dogs: 4, baseRate: 108, halfDaySupplement: 14 },
  ],
  colorMapping: {
    pending: "#FFC000",
    available: "#92D050",
    noAvailability: "#FF0000",
    confirmed: "#00B0F0",
    reminder: "#FFFF00",
    review: "#7030A0",
    header: "#FF0000",
  },
};

export function getSheetNameFromDate(
  date: Date,
  naming: HotelDemoConfig["sheetNaming"] = hotelDemoConfig.sheetNaming,
): string {
  if (naming === "spanish-month") {
    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
      timeZone: hotelDemoConfig.defaultTimezone,
    })
      .format(date)
      .replace(" de ", "-")
      .replace(/\s+/g, "-")
      .toLowerCase();
  }

  if (naming === "uppercase-spanish-month-year") {
    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
      timeZone: hotelDemoConfig.defaultTimezone,
    })
      .format(date)
      .replace(" de ", " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getSlotLabel(slot: keyof HotelDemoConfig["slotLabels"]): string {
  return hotelDemoConfig.slotLabels[slot];
}
