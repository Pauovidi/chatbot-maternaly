import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEMO_REMINDER_QUEUE,
  DEMO_RESERVATION_RECORDS,
  DEMO_SHEET_SNAPSHOTS,
} from "../mock-data";
import type { ReminderJob, ReservationRecord } from "../domain/contracts";
import type { DemoLogEntry, DemoStoreState } from "./types";

const STORE_DIRECTORY = path.join(process.cwd(), ".demo-state");
const STORE_FILE = path.join(STORE_DIRECTORY, "hotel-canino-domain.json");

const initialState: DemoStoreState = {
  reservations: DEMO_RESERVATION_RECORDS,
  reminders: DEMO_REMINDER_QUEUE,
  monthSnapshots: DEMO_SHEET_SNAPSHOTS.map((snapshot) => ({
    sheetName: snapshot.sheetName,
    monthKey: snapshot.monthKey,
    capacityPerSlot: snapshot.capacityPerSlot,
    occupied: Object.fromEntries(
      Object.entries(snapshot.occupied).map(([date, value]) => [
        date,
        {
          morning: value.morning,
          afternoon: value.afternoon,
        },
      ]),
    ),
  })),
  logs: [],
  updatedAt: new Date().toISOString(),
};

async function ensureStoreDirectory(): Promise<void> {
  await mkdir(STORE_DIRECTORY, { recursive: true });
}

async function seedIfNeeded(): Promise<void> {
  try {
    await readFile(STORE_FILE, "utf8");
  } catch {
    await saveDemoState(initialState);
  }
}

export async function loadDemoState(): Promise<DemoStoreState> {
  await ensureStoreDirectory();
  await seedIfNeeded();

  try {
    const raw = await readFile(STORE_FILE, "utf8");
    return {
      ...initialState,
      ...(JSON.parse(raw) as DemoStoreState),
    };
  } catch {
    return initialState;
  }
}

export async function saveDemoState(state: DemoStoreState): Promise<void> {
  await ensureStoreDirectory();
  const payload = JSON.stringify(
    {
      ...state,
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );
  const tempFile = `${STORE_FILE}.tmp`;

  await writeFile(tempFile, payload, "utf8");
  await rename(tempFile, STORE_FILE);
}

export async function appendLog(
  entry: Omit<DemoLogEntry, "id" | "at">,
): Promise<DemoLogEntry> {
  const state = await loadDemoState();
  const logEntry: DemoLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  };

  state.logs = [logEntry, ...state.logs].slice(0, 100);
  await saveDemoState(state);
  return logEntry;
}

export async function upsertReservation(
  reservation: ReservationRecord,
): Promise<void> {
  const state = await loadDemoState();
  state.reservations = [
    reservation,
    ...state.reservations.filter(
      (item) => item.reservationId !== reservation.reservationId,
    ),
  ];
  await saveDemoState(state);
}

export async function findReservationById(
  reservationId: string,
): Promise<ReservationRecord | null> {
  const state = await loadDemoState();
  return (
    state.reservations.find((item) => item.reservationId === reservationId) ?? null
  );
}

export async function upsertReminder(
  reminder: ReminderJob,
): Promise<void> {
  const state = await loadDemoState();
  state.reminders = [
    reminder,
    ...state.reminders.filter((item) => item.reminderId !== reminder.reminderId),
  ];
  await saveDemoState(state);
}

export async function markReminder(
  reminderId: string,
  updater: (reminder: ReminderJob) => ReminderJob,
): Promise<ReminderJob | null> {
  const state = await loadDemoState();
  const reminder = state.reminders.find((item) => item.reminderId === reminderId);

  if (!reminder) {
    return null;
  }

  const nextReminder = updater(reminder);
  state.reminders = [
    nextReminder,
    ...state.reminders.filter((item) => item.reminderId !== reminderId),
  ];
  await saveDemoState(state);
  return nextReminder;
}

export async function replaceRemindersForReservation(
  reservationId: string,
  reminders: ReminderJob[],
): Promise<void> {
  const state = await loadDemoState();
  state.reminders = [
    ...reminders,
    ...state.reminders.filter((item) => item.reservationId !== reservationId),
  ];
  await saveDemoState(state);
}
