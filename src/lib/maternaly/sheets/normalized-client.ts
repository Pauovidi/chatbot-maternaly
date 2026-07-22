import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import { GoogleSheetsClient, type AppendRowResult } from "@/lib/maternaly/sheets/client";
import {
  NORMALIZED_REQUIRED_TABS,
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
  profileSpreadsheet?(sheetId: string): Promise<{
    title?: string;
    tabs: Array<{ title: string }>;
  }>;
  appendRow(
    sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ): Promise<AppendRowResult>;
}

export class GoogleNormalizedSheetsClient implements NormalizedSheetsClient {
  constructor(private readonly client = new GoogleSheetsClient()) {}

  readTabRows(sheetId: string, tabTitle: string): Promise<unknown[][]> {
    return this.client.readTabRows(sheetId, tabTitle);
  }

  profileSpreadsheet(sheetId: string): Promise<{
    title?: string;
    tabs: Array<{ title: string }>;
  }> {
    return this.client.profileSpreadsheet(sheetId);
  }

  appendRow(
    sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ): Promise<AppendRowResult> {
    return this.client.appendRow(sheetId, tabTitle, values);
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
