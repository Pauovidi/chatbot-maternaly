import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import { GoogleSheetsClient, type AppendRowResult } from "@/lib/maternaly/sheets/client";
import {
  NORMALIZED_REQUIRED_TABS,
  getCell,
  humanNormalize,
  normalizeSheetText,
  type MaternalyNormalizedServiceKey,
  type NormalizedRequiredTab,
  rowsToObjects,
} from "@/lib/maternaly/sheets/normalized-template";
import type { NormalizedRow } from "@/lib/maternaly/sheets/normalized-template";

export interface NormalizedTabSnapshot {
  tab: NormalizedRequiredTab;
  headers: string[];
  normalizedHeaders: string[];
  headerRowIndex: number;
  headerRowNumber?: number;
  rows: NormalizedRow[];
  parseError?: string;
}

export interface NormalizedServiceSheetSnapshot {
  serviceKey: MaternalyNormalizedServiceKey;
  sheetId: string;
  tabs: Record<NormalizedRequiredTab, NormalizedTabSnapshot>;
}

export interface NormalizedSheetsClient {
  readTabRows(sheetId: string, tabTitle: string): Promise<unknown[][]>;
  appendRow(
    sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ): Promise<AppendRowResult>;
  appendRegistrationRowIfCapacityAllows?(
    sheetId: string,
    tabTitle: "Inscripciones",
    values: Array<string | number | undefined>,
    guard: {
      sessionId: string;
      groupId: string;
      capacityTotal: number;
      peopleCount: number;
    },
  ): Promise<{ applied: boolean; reason?: string; result?: AppendRowResult }>;
  updateCell?(
    sheetId: string,
    tabTitle: string,
    rowNumber: number,
    columnIndex: number,
    value: string | number,
  ): Promise<void>;
  updateCellIfRowMatches?(
    sheetId: string,
    tabTitle: string,
    rowNumber: number,
    columnIndex: number,
    value: string | number,
    expectedCells: Array<{ columnIndex: number; value: string | number }>,
  ): Promise<boolean>;
}

function getConfiguredServiceId(row: NormalizedRow): string {
  const directServiceId = getCell(row, "serviceId");
  if (directServiceId) {
    return directServiceId;
  }

  const field = normalizeSheetText(row.campo ?? row.clave ?? row.field ?? "");
  if (!["servicio_id", "service_id", "id_servicio"].includes(field)) {
    return "";
  }

  return String(row.valor ?? row.value ?? "").trim();
}

export function getNormalizedWorkbookServiceId(
  snapshot: NormalizedServiceSheetSnapshot,
): string {
  return (
    snapshot.tabs.Servicio_Config.rows
      .map(getConfiguredServiceId)
      .find(Boolean) ?? snapshot.serviceKey
  );
}

export function serviceIdBelongsToNormalizedWorkbook(
  snapshot: NormalizedServiceSheetSnapshot,
  serviceId: string | undefined,
): boolean {
  if (!serviceId?.trim()) {
    return true;
  }

  const acceptedIds = new Set([
    humanNormalize(snapshot.serviceKey),
    ...snapshot.tabs.Servicio_Config.rows
      .map((row) => humanNormalize(getConfiguredServiceId(row)))
      .filter(Boolean),
  ]);

  return acceptedIds.has(humanNormalize(serviceId));
}

export class GoogleNormalizedSheetsClient implements NormalizedSheetsClient {
  constructor(private readonly client = new GoogleSheetsClient()) {}

  readTabRows(sheetId: string, tabTitle: string): Promise<unknown[][]> {
    return this.client.readTabRows(sheetId, tabTitle);
  }

  appendRow(
    sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ): Promise<AppendRowResult> {
    return this.client.appendRow(sheetId, tabTitle, values);
  }

  updateCell(
    sheetId: string,
    tabTitle: string,
    rowNumber: number,
    columnIndex: number,
    value: string | number,
  ): Promise<void> {
    return this.client.updateCell(sheetId, tabTitle, rowNumber, columnIndex, value);
  }
}

export function getNormalizedSheetIdForService(
  serviceKey: MaternalyNormalizedServiceKey,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return readMaternalyRuntimeConfig(env).normalizedSheets.serviceSheetIds[serviceKey];
}

export async function readNormalizedServiceSheet(
  serviceKey: MaternalyNormalizedServiceKey,
  client: NormalizedSheetsClient = new GoogleNormalizedSheetsClient(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<NormalizedServiceSheetSnapshot> {
  const sheetId = getNormalizedSheetIdForService(serviceKey, env);
  if (!sheetId) {
    throw new Error(`missing_sheet_id:${serviceKey}`);
  }

  const tabEntries = await Promise.all(
    NORMALIZED_REQUIRED_TABS.map(async (tab) => {
      const parsed = rowsToObjects(await client.readTabRows(sheetId, tab), { tab });
      return [
        tab,
        {
          tab,
          ...parsed,
        },
      ] as const;
    }),
  );

  return {
    serviceKey,
    sheetId,
    tabs: Object.fromEntries(tabEntries) as Record<NormalizedRequiredTab, NormalizedTabSnapshot>,
  };
}
