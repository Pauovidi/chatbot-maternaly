import type { DemoPersistenceState } from "@/lib/hotel/persistence/store";

export function createEmptyDemoState(): DemoPersistenceState {
  return {
    reservations: [],
    reminderQueue: [],
    logs: [],
    months: {},
    updatedAt: new Date().toISOString(),
  };
}
