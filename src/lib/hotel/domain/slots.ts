export const HOTEL_SLOTS = ["morning", "afternoon"] as const;

export type HotelSlot = (typeof HOTEL_SLOTS)[number];

export const HOTEL_SLOT_LABELS: Record<HotelSlot, string> = {
  morning: "Mañana",
  afternoon: "Tarde",
};

export const HOTEL_SLOT_WINDOWS: Record<HotelSlot, { start: string; end: string }> = {
  morning: {
    start: "08:00",
    end: "11:00",
  },
  afternoon: {
    start: "16:30",
    end: "19:30",
  },
};

export const HOTEL_SLOT_ORDER: HotelSlot[] = ["morning", "afternoon"];

export type ReservationFlowTurn = "manana" | "tarde";

export const RESERVATION_TURN_TO_SLOT: Record<ReservationFlowTurn, HotelSlot> = {
  manana: "morning",
  tarde: "afternoon",
};

export const SLOT_TO_RESERVATION_TURN: Record<HotelSlot, ReservationFlowTurn> = {
  morning: "manana",
  afternoon: "tarde",
};

