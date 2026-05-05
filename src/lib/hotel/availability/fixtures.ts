import type { ExistingStay } from "./types";

export const demoExistingStays: ExistingStay[] = [
  {
    id: "stay-001",
    label: "Luna",
    units: 2,
    window: {
      checkIn: { date: "2026-04-03", slot: "morning" },
      checkOut: { date: "2026-04-06", slot: "morning" },
    },
  },
  {
    id: "stay-002",
    label: "Nala",
    units: 1,
    window: {
      checkIn: { date: "2026-04-06", slot: "afternoon" },
      checkOut: { date: "2026-04-09", slot: "morning" },
    },
  },
  {
    id: "stay-003",
    label: "Bruno",
    units: 12,
    window: {
      checkIn: { date: "2026-04-04", slot: "morning" },
      checkOut: { date: "2026-04-07", slot: "afternoon" },
    },
  },
];

