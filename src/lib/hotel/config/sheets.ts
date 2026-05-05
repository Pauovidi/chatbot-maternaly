import { getSheetNameFromDate, hotelDemoConfig } from "@/lib/hotel/integrations/config";
import type { HotelColorMapping, HotelDemoConfig } from "@/lib/hotel/integrations/types";
import type { SheetAdapterContext } from "@/lib/hotel/sheets/types";

import {
  CLIENT_WORKBOOK_MONTH_SHEET_MAP,
  CLIENT_WORKBOOK_SHEETS_CONFIG,
} from "./sheets-contract";

export type SheetsSheetNaming =
  | HotelDemoConfig["sheetNaming"]
  | "client-workbook-map";

export interface SheetsMonthlyLayout {
  sheetNaming: SheetsSheetNaming;
  titleRowIndex: number;
  titleRequired: boolean;
  dayHeaderRowIndex: number;
  firstDataRowIndex: number;
  lastDataRowIndex: number;
  overflowRowStartIndex: number;
  overflowRowEndIndex: number;
  summaryRowStartIndex: number;
  summaryRowEndIndex: number;
  labelColumnIndex: number;
  firstDayColumnIndex: number;
  lastDayColumnIndex: number;
  lastRelevantColumnIndex: number;
  dayCount: number;
  occupancyMode: "mirror-daily-counts" | "slot-grid";
  sheetNameMap: Record<string, string>;
  searchRowRanges?: Array<{ startRowIndex: number; endRowIndex: number }>;
}

export interface SheetsColorPalette {
  pending: string;
  available: string;
  noAvailability: string;
  confirmed: string;
  reminder: string;
  review: string;
  header: string;
  overflow: string;
}

export interface SheetsConfig {
  monthlyLayout: SheetsMonthlyLayout;
  colorPalette: SheetsColorPalette;
}

export interface WorkbookDerivedSheetsContract {
  sourceWorkbookFileName?: string;
  monthSheetMap?: Record<string, string>;
  layout?: Partial<SheetsMonthlyLayout>;
  colorPalette?: Partial<SheetsColorPalette>;
  legend?: Array<{
    label: string;
    color: string;
    sampleCell: string;
  }>;
  roomLabels?: Array<{
    rowIndex: number;
    label: string;
  }>;
  sheetSummaries?: Array<{
    title: string;
    kind: string;
    monthKey?: string | null;
    usefulRange?: string | null;
  }>;
}

export const HOTEL_SHEETS_CONFIG: SheetsConfig = {
  monthlyLayout: {
    sheetNaming: "client-workbook-map",
    titleRowIndex: 1,
    titleRequired: false,
    dayHeaderRowIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.dayHeaderRowIndex,
    firstDataRowIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.firstDataRowIndex,
    lastDataRowIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.lastDataRowIndex,
    overflowRowStartIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.overflowRowStartIndex,
    overflowRowEndIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.overflowRowEndIndex,
    summaryRowStartIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.summaryRowStartIndex,
    summaryRowEndIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.summaryRowEndIndex,
    labelColumnIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.labelColumnIndex,
    firstDayColumnIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.firstDayColumnIndex,
    lastDayColumnIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.lastDayColumnIndex,
    lastRelevantColumnIndex: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.lastRelevantColumnIndex,
    dayCount: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.dayCount,
    occupancyMode: CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.occupancyMode,
    sheetNameMap: { ...CLIENT_WORKBOOK_MONTH_SHEET_MAP },
    searchRowRanges: [...CLIENT_WORKBOOK_SHEETS_CONFIG.monthlyLayout.searchRowRanges],
  },
  colorPalette: {
    ...CLIENT_WORKBOOK_SHEETS_CONFIG.colorPalette,
  },
};

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

function readStringEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readNumberEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const value = process.env[name];
    if (value === undefined) {
      continue;
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readBooleanEnv(names: string[], fallback: boolean): boolean {
  for (const name of names) {
    const value = process.env[name];
    if (value === undefined) {
      continue;
    }

    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  return fallback;
}

function readColumnEnv(names: string[], fallback: number): number {
  const raw = readStringEnv(names);
  if (!raw) {
    return fallback;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const normalized = raw.toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    return fallback;
  }

  return normalized.split("").reduce(
    (value, char) => value * 26 + (char.charCodeAt(0) - 64),
    0,
  );
}

function parseMonthSheetMap(
  value: string | undefined,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return undefined;
  }
}

function parseJsonEnv<T>(
  value: string | undefined,
): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function readWorkbookContractFromEnv():
  | WorkbookDerivedSheetsContract
  | undefined {
  return parseJsonEnv<WorkbookDerivedSheetsContract>(
    readStringEnv(["HOTEL_GOOGLE_SHEETS_CONTRACT_JSON"]),
  );
}

export function getSheetNameForMonthKey(
  monthKey: string,
  naming: SheetsSheetNaming = HOTEL_SHEETS_CONFIG.monthlyLayout.sheetNaming,
  sheetNameMap: Record<string, string> = HOTEL_SHEETS_CONFIG.monthlyLayout.sheetNameMap,
): string {
  if (naming === "client-workbook-map") {
    const fallbackDate = new Date(`${monthKey}-01T00:00:00`);
    const fallbackTitle = new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
      timeZone: hotelDemoConfig.defaultTimezone,
    })
      .format(fallbackDate)
      .replace(" de ", " ")
      .toUpperCase();

    return sheetNameMap[monthKey] ?? fallbackTitle;
  }

  return getSheetNameFromDate(new Date(`${monthKey}-01T00:00:00`), naming);
}

export function mergeSheetsLayout(
  overrides: Partial<SheetsMonthlyLayout> | undefined,
): SheetsMonthlyLayout {
  return {
    ...HOTEL_SHEETS_CONFIG.monthlyLayout,
    ...overrides,
    sheetNameMap: {
      ...HOTEL_SHEETS_CONFIG.monthlyLayout.sheetNameMap,
      ...overrides?.sheetNameMap,
    },
    searchRowRanges:
      overrides?.searchRowRanges ??
      HOTEL_SHEETS_CONFIG.monthlyLayout.searchRowRanges,
  };
}

export function mergeSheetsColorPalette(
  overrides: Partial<SheetsColorPalette> | undefined,
): SheetsColorPalette {
  return {
    ...HOTEL_SHEETS_CONFIG.colorPalette,
    ...overrides,
  };
}

export function getSheetsAdapterContextFromEnv(
  mode: SheetAdapterContext["mode"] = "mock",
): SheetAdapterContext {
  const workbookContract = readWorkbookContractFromEnv();
  const contractLayout = workbookContract?.layout ?? {};
  const credentialsJson =
    readStringEnv([
      "HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON",
      "GOOGLE_SERVICE_ACCOUNT_JSON",
    ]) ??
    ((process.env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ||
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) &&
    (process.env.HOTEL_GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY)
      ? JSON.stringify({
          project_id:
            process.env.GOOGLE_PROJECT_ID ??
            process.env.HOTEL_GOOGLE_PROJECT_ID,
          client_email:
            process.env.HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ??
            process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: normalizePrivateKey(
            process.env.HOTEL_GOOGLE_SHEETS_PRIVATE_KEY ??
              process.env.GOOGLE_PRIVATE_KEY ??
              "",
          ),
        })
      : undefined);

  const sheetTitleByMonthKey =
    parseMonthSheetMap(readStringEnv(["HOTEL_GOOGLE_SHEETS_MONTH_MAP_JSON"])) ??
    workbookContract?.monthSheetMap ??
    HOTEL_SHEETS_CONFIG.monthlyLayout.sheetNameMap;

  return {
    mode,
    spreadsheetId: readStringEnv(["HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID"]),
    accessToken: readStringEnv(["HOTEL_GOOGLE_SHEETS_ACCESS_TOKEN"]),
    serviceAccountJson: credentialsJson,
    sheetTitleByMonthKey,
    layout: {
      sheetNaming:
        (readStringEnv(["HOTEL_GOOGLE_SHEETS_SHEET_NAMING"]) as SheetsMonthlyLayout["sheetNaming"] | undefined) ??
        contractLayout.sheetNaming ??
        HOTEL_SHEETS_CONFIG.monthlyLayout.sheetNaming,
      titleRowIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_TITLE_ROW"], contractLayout.titleRowIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.titleRowIndex),
      titleRequired: readBooleanEnv(["HOTEL_GOOGLE_SHEETS_TITLE_REQUIRED"], contractLayout.titleRequired ?? HOTEL_SHEETS_CONFIG.monthlyLayout.titleRequired),
      dayHeaderRowIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_DAY_HEADER_ROW"], contractLayout.dayHeaderRowIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.dayHeaderRowIndex),
      firstDataRowIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_FIRST_DATA_ROW"], contractLayout.firstDataRowIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.firstDataRowIndex),
      lastDataRowIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_LAST_DATA_ROW"], contractLayout.lastDataRowIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.lastDataRowIndex),
      overflowRowStartIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_OVERFLOW_START_ROW"], contractLayout.overflowRowStartIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.overflowRowStartIndex),
      overflowRowEndIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_OVERFLOW_END_ROW"], contractLayout.overflowRowEndIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.overflowRowEndIndex),
      summaryRowStartIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_SUMMARY_START_ROW"], contractLayout.summaryRowStartIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.summaryRowStartIndex),
      summaryRowEndIndex: readNumberEnv(["HOTEL_GOOGLE_SHEETS_SUMMARY_END_ROW"], contractLayout.summaryRowEndIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.summaryRowEndIndex),
      labelColumnIndex: readColumnEnv(["HOTEL_GOOGLE_SHEETS_LABEL_COLUMN"], contractLayout.labelColumnIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.labelColumnIndex),
      firstDayColumnIndex: readColumnEnv(["HOTEL_GOOGLE_SHEETS_FIRST_DAY_COLUMN"], contractLayout.firstDayColumnIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.firstDayColumnIndex),
      lastDayColumnIndex: readColumnEnv(["HOTEL_GOOGLE_SHEETS_LAST_DAY_COLUMN"], contractLayout.lastDayColumnIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.lastDayColumnIndex),
      lastRelevantColumnIndex: readColumnEnv(["HOTEL_GOOGLE_SHEETS_LAST_RELEVANT_COLUMN"], contractLayout.lastRelevantColumnIndex ?? HOTEL_SHEETS_CONFIG.monthlyLayout.lastRelevantColumnIndex),
      dayCount: readNumberEnv(["HOTEL_GOOGLE_SHEETS_DAY_COUNT"], contractLayout.dayCount ?? HOTEL_SHEETS_CONFIG.monthlyLayout.dayCount),
      occupancyMode:
        (readStringEnv(["HOTEL_GOOGLE_SHEETS_OCCUPANCY_MODE"]) as SheetsMonthlyLayout["occupancyMode"] | undefined) ??
        contractLayout.occupancyMode ??
        HOTEL_SHEETS_CONFIG.monthlyLayout.occupancyMode,
      sheetNameMap: sheetTitleByMonthKey,
      searchRowRanges:
        parseJsonEnv<Array<{ startRowIndex: number; endRowIndex: number }>>(
          readStringEnv(["HOTEL_GOOGLE_SHEETS_SEARCH_ROW_RANGES_JSON"]),
        ) ??
        contractLayout.searchRowRanges ??
        HOTEL_SHEETS_CONFIG.monthlyLayout.searchRowRanges,
    },
    colorPalette: {
      pending: readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_PENDING"]) ?? workbookContract?.colorPalette?.pending ?? HOTEL_SHEETS_CONFIG.colorPalette.pending,
      available: readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_AVAILABLE"]) ?? workbookContract?.colorPalette?.available ?? HOTEL_SHEETS_CONFIG.colorPalette.available,
      noAvailability:
        readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_NO_AVAILABILITY"]) ??
        workbookContract?.colorPalette?.noAvailability ??
        HOTEL_SHEETS_CONFIG.colorPalette.noAvailability,
      confirmed: readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_CONFIRMED"]) ?? workbookContract?.colorPalette?.confirmed ?? HOTEL_SHEETS_CONFIG.colorPalette.confirmed,
      reminder: readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_REMINDER"]) ?? workbookContract?.colorPalette?.reminder ?? HOTEL_SHEETS_CONFIG.colorPalette.reminder,
      review: readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_REVIEW"]) ?? workbookContract?.colorPalette?.review ?? HOTEL_SHEETS_CONFIG.colorPalette.review,
      header: readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_HEADER"]) ?? workbookContract?.colorPalette?.header ?? HOTEL_SHEETS_CONFIG.colorPalette.header,
      overflow: readStringEnv(["HOTEL_GOOGLE_SHEETS_COLOR_OVERFLOW"]) ?? workbookContract?.colorPalette?.overflow ?? HOTEL_SHEETS_CONFIG.colorPalette.overflow,
    },
  };
}

export type { HotelColorMapping };
