import type {
  DemoReservationRecord,
  MonthOccupancySnapshot,
  SheetWritePlan,
  SheetsAvailabilityInput,
  SheetsAvailabilityResult,
  SheetsWriteResult,
} from "@/lib/hotel/integrations/types";
import { loadDemoState, replaceMonthSnapshot, upsertReservation } from "@/lib/hotel/persistence/store";
import type { SheetAdapter } from "@/lib/hotel/sheets/types";
import {
  applyWritePlanToMatrix,
  buildAvailabilityResult,
  buildMonthSnapshotFromGrid,
  buildWritePlanForReservation,
  buildWriteResult,
  seedBlankMonthMatrix,
  validateMonthGrid,
} from "@/lib/hotel/sheets/structure";
import type { SheetAdapterContext } from "./types";

interface MockMonthState {
  values: string[][];
  snapshot: MonthOccupancySnapshot;
}

const memoryState = new Map<string, MockMonthState>();

function makeStateKey(storeName: string, monthKey: string): string {
  return `${storeName}::${monthKey}`;
}

function setCell(values: string[][], rowIndex: number, columnIndex: number, value: string): void {
  while (values.length < rowIndex) {
    values.push([]);
  }

  const row = values[rowIndex - 1];
  while (row.length < columnIndex) {
    row.push("");
  }

  row[columnIndex - 1] = value;
}

function seedDemoValues(monthKey: string, context?: Partial<SheetAdapterContext>): string[][] {
  const values = seedBlankMonthMatrix(monthKey, context);

  setCell(values, 4, 2, "DANA");
  setCell(values, 4, 3, "DANA");
  setCell(values, 4, 4, "DANA");
  setCell(values, 4, 5, "DANA");
  setCell(values, 4, 6, "DANA");
  setCell(values, 4, 7, "DANA");

  setCell(values, 5, 2, "PACO");
  setCell(values, 5, 3, "PACO");
  setCell(values, 5, 4, "PACO");
  setCell(values, 5, 5, "PACO");
  setCell(values, 5, 6, "PACO");
  setCell(values, 5, 7, "PACO");

  setCell(values, 6, 2, "PILI");
  setCell(values, 6, 3, "PILI");
  setCell(values, 6, 4, "PILI");
  setCell(values, 6, 5, "PILI");
  setCell(values, 6, 6, "PILI");
  setCell(values, 6, 7, "PILI");

  setCell(values, 8, 2, "PONGO");
  setCell(values, 8, 3, "PONGO");
  setCell(values, 8, 4, "PONGO");
  setCell(values, 8, 5, "PONGO");
  setCell(values, 8, 6, "PONGO");
  setCell(values, 8, 7, "PONGO");

  setCell(values, 10, 2, "LAGO Y CHISPA");
  setCell(values, 10, 3, "LAGO Y CHISPA");
  setCell(values, 10, 4, "LAGO Y CHISPA");
  setCell(values, 10, 5, "LAGO Y CHISPA");
  setCell(values, 10, 6, "LAGO Y CHISPA");
  setCell(values, 10, 7, "LAGO Y CHISPA");

  setCell(values, 12, 2, "FITO");
  setCell(values, 12, 3, "FITO");
  setCell(values, 12, 6, "KITSUNE");
  setCell(values, 12, 7, "KITSUNE");

  setCell(values, 14, 2, "SCOUT JOSS");
  setCell(values, 14, 3, "SCOUT JOSS");
  setCell(values, 14, 4, "SCOUT JOSS");
  setCell(values, 14, 5, "SCOUT JOSS");
  setCell(values, 14, 6, "SCOUT JOSS");
  setCell(values, 14, 7, "SCOUT JOSS");

  return values;
}

async function loadState(
  monthKey: string,
  storeName: string,
  context?: Partial<SheetAdapterContext>,
): Promise<MockMonthState> {
  const key = makeStateKey(storeName, monthKey);
  const cached = memoryState.get(key);
  if (cached) {
    return cached;
  }

  const persisted = await loadDemoState(storeName);
  const snapshot = persisted.months[monthKey];
  if (snapshot) {
    let values = seedBlankMonthMatrix(monthKey, context);
    const orderedReservations = snapshot.reservations
      .slice()
      .sort((left: DemoReservationRecord, right: DemoReservationRecord) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    for (const reservation of orderedReservations) {
      const plan = buildWritePlanForReservation(reservation, values, context);
      values = applyWritePlanToMatrix(values, plan);
    }

    const hydratedSnapshot = buildMonthSnapshotFromGrid(values, monthKey, context, snapshot.sheetName);
    const hydrated = { values, snapshot: hydratedSnapshot };
    memoryState.set(key, hydrated);
    return hydrated;
  }

  const values = seedDemoValues(monthKey, context);
  const seededSnapshot = buildMonthSnapshotFromGrid(values, monthKey, context);
  await replaceMonthSnapshot(seededSnapshot, storeName);
  const seeded = { values, snapshot: seededSnapshot };
  memoryState.set(key, seeded);
  return seeded;
}

async function persistState(
  monthKey: string,
  values: string[][],
  storeName: string,
  context?: Partial<SheetAdapterContext>,
): Promise<MonthOccupancySnapshot> {
  const snapshot = buildMonthSnapshotFromGrid(values, monthKey, context);
  await replaceMonthSnapshot(snapshot, storeName);
  return snapshot;
}

export async function buildMockSheetAdapter(
  storeName = "hotel-demo-state.json",
  context: Partial<SheetAdapterContext> = {},
): Promise<SheetAdapter> {
  async function readMonth(monthKey: string): Promise<MonthOccupancySnapshot> {
    return (await loadState(monthKey, storeName, context)).snapshot;
  }

  async function validateMonthStructure(monthKey: string) {
    const state = await loadState(monthKey, storeName, context);
    return validateMonthGrid(state.values, monthKey, context, state.snapshot.sheetName);
  }

  async function checkAvailability(
    input: SheetsAvailabilityInput,
  ): Promise<SheetsAvailabilityResult> {
    const monthKey = input.entryDate.slice(0, 7);
    const state = await loadState(monthKey, storeName, context);
    return buildAvailabilityResult(state.snapshot, input, state.values, context);
  }

  async function buildWritePlan(reservation: DemoReservationRecord): Promise<SheetWritePlan> {
    const monthKey = reservation.entryDate.slice(0, 7);
    const state = await loadState(monthKey, storeName, context);
    return buildWritePlanForReservation(reservation, state.values, context);
  }

  async function writeReservation(
    reservation: DemoReservationRecord,
  ): Promise<SheetsWriteResult> {
    const monthKey = reservation.entryDate.slice(0, 7);
    const state = await loadState(monthKey, storeName, context);
    const plan = buildWritePlanForReservation(reservation, state.values, context);
    const nextValues = applyWritePlanToMatrix(state.values, plan);
    const snapshot = await persistState(monthKey, nextValues, storeName, context);

    const key = makeStateKey(storeName, monthKey);
    memoryState.set(key, { values: nextValues, snapshot });
    await upsertReservation(reservation, storeName);

    return buildWriteResult(plan, "mock");
  }

  return {
    readMonth,
    validateMonthStructure,
    checkAvailability,
    buildWritePlan,
    writeReservation,
  };
}
