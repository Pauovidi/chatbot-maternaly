import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  DemoLogEntry,
  DemoReservationRecord,
  MonthOccupancySnapshot,
  ReminderJob,
} from "@/lib/hotel/integrations/types";

export interface DemoPersistenceState {
  reservations: DemoReservationRecord[];
  reminderQueue: ReminderJob[];
  logs: DemoLogEntry[];
  months: Record<string, MonthOccupancySnapshot>;
  updatedAt: string;
}

const defaultState: DemoPersistenceState = {
  reservations: [],
  reminderQueue: [],
  logs: [],
  months: {},
  updatedAt: new Date().toISOString(),
};

function getStorePath(storeName = "hotel-demo-state.json"): string {
  return path.join(process.cwd(), ".demo-state", storeName);
}

async function ensureDirectory(): Promise<void> {
  await mkdir(path.join(process.cwd(), ".demo-state"), { recursive: true });
}

export async function loadDemoState(
  storeName = "hotel-demo-state.json",
): Promise<DemoPersistenceState> {
  const filePath = getStorePath(storeName);

  try {
    const raw = await readFile(filePath, "utf8");
    return {
      ...defaultState,
      ...(JSON.parse(raw) as DemoPersistenceState),
    };
  } catch {
    return { ...defaultState };
  }
}

export async function saveDemoState(
  state: DemoPersistenceState,
  storeName = "hotel-demo-state.json",
): Promise<void> {
  await ensureDirectory();
  const filePath = getStorePath(storeName);
  const tempPath = `${filePath}.tmp`;
  const payload = JSON.stringify(
    {
      ...state,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );

  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
}

export async function appendDemoLog(
  entry: Omit<DemoLogEntry, "id" | "at">,
  storeName = "hotel-demo-state.json",
): Promise<DemoLogEntry> {
  const state = await loadDemoState(storeName);
  const logEntry: DemoLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };

  state.logs.unshift(logEntry);
  state.logs = state.logs.slice(0, 200);
  await saveDemoState(state, storeName);
  return logEntry;
}

export async function upsertReservation(
  reservation: DemoReservationRecord,
  storeName = "hotel-demo-state.json",
): Promise<DemoReservationRecord> {
  const state = await loadDemoState(storeName);
  const index = state.reservations.findIndex((item) => item.id === reservation.id);

  if (index >= 0) {
    state.reservations[index] = reservation;
  } else {
    state.reservations.unshift(reservation);
  }

  await saveDemoState(state, storeName);
  return reservation;
}

export async function upsertReminder(
  reminder: ReminderJob,
  storeName = "hotel-demo-state.json",
): Promise<ReminderJob> {
  const state = await loadDemoState(storeName);
  const index = state.reminderQueue.findIndex((item) => item.id === reminder.id);

  if (index >= 0) {
    state.reminderQueue[index] = reminder;
  } else {
    state.reminderQueue.unshift(reminder);
  }

  await saveDemoState(state, storeName);
  return reminder;
}

export async function replaceMonthSnapshot(
  snapshot: MonthOccupancySnapshot,
  storeName = "hotel-demo-state.json",
): Promise<MonthOccupancySnapshot> {
  const state = await loadDemoState(storeName);
  state.months[snapshot.monthKey] = snapshot;
  await saveDemoState(state, storeName);
  return snapshot;
}
