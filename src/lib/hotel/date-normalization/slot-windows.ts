import type { ReservationSlot, SlotWindow } from "./types";

export const DEFAULT_SLOT_WINDOWS: Record<ReservationSlot, SlotWindow> = {
  morning: {
    start: "08:00",
    end: "11:00",
  },
  afternoon: {
    start: "16:30",
    end: "19:30",
  },
};
