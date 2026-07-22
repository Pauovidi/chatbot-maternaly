import { readMaternalyRuntimeConfig } from "../config/env";
import {
  GoogleNormalizedSheetsClient,
  type NormalizedSheetsClient,
  type NormalizedServiceSheetSnapshot,
  type NormalizedTabSnapshot,
} from "./normalized-client";
import {
  listAvailableSessionsFromSnapshot,
  type NormalizedAvailableSession,
} from "./normalized-availability";
import { listLegacyCharlaSessions } from "./legacy-charla-availability";
import {
  NORMALIZED_REQUIRED_TABS,
  getCell,
  hasColumn,
  redactSheetId,
  rowsToObjects,
  type MaternalyNormalizedServiceKey,
  type NormalizedRequiredTab,
} from "./normalized-template";

export type NormalizedServiceAvailabilityReason =
  | "sessions_available"
  | "no_sessions_available"
  | "missing_sheet_id"
  | "read_error"
  | "header_not_found";

export interface NormalizedServiceAvailabilityDiagnostics {
  selectedSource: "normalized_sheets" | "legacy_charla_sheet";
  headersDetected: boolean;
  criticalTabsOk: boolean;
  sheetIdRedacted?: string;
  errorType?: string | null;
  parseErrors?: Array<{
    tab: string;
    error: string;
  }>;
  criticalParseErrors?: Array<{
    tab: string;
    error: string;
  }>;
  nonCriticalParseErrors?: Array<{
    tab: string;
    error: string;
  }>;
  nonCriticalParseErrorsCount: number;
  tabs?: Array<{
    name: string;
    headerRowNumber: number;
    rows: number;
  }>;
}

export interface NormalizedServiceAvailabilityResult {
  ok: boolean;
  serviceKey: MaternalyNormalizedServiceKey;
  reason: NormalizedServiceAvailabilityReason;
  sessions: NormalizedAvailableSession[];
  snapshot?: NormalizedServiceSheetSnapshot;
  diagnostics: NormalizedServiceAvailabilityDiagnostics;
}

export interface GetNormalizedServiceAvailabilityOptions {
  serviceKey: MaternalyNormalizedServiceKey;
  client?: NormalizedSheetsClient;
  env?: NodeJS.ProcessEnv;
}

export async function getNormalizedServiceAvailability({
  serviceKey,
  client,
  env = process.env,
}: GetNormalizedServiceAvailabilityOptions): Promise<NormalizedServiceAvailabilityResult> {
  const config = readMaternalyRuntimeConfig(env);
  const sheetId = config.normalizedSheets.serviceSheetIds[serviceKey];
  const baseDiagnostics: NormalizedServiceAvailabilityDiagnostics = {
    selectedSource: "normalized_sheets",
    headersDetected: false,
    criticalTabsOk: false,
    nonCriticalParseErrorsCount: 0,
    sheetIdRedacted: sheetId ? redactSheetId(sheetId) : undefined,
  };

  if (!sheetId) {
    return {
      ok: false,
      serviceKey,
      reason: "missing_sheet_id",
      sessions: [],
      diagnostics: {
        ...baseDiagnostics,
        errorType: "missing_sheet_id",
      },
    };
  }

  try {
    const sheetsClient = client ?? new GoogleNormalizedSheetsClient();
    const snapshot = await readNormalizedAvailabilitySnapshot({
      serviceKey,
      sheetId,
      client: sheetsClient,
    });
    const tabs = Object.values(snapshot.tabs);
    const parseErrors = tabs
      .filter((tab) => tab.parseError)
      .map((tab) => ({
        tab: tab.tab,
        error: tab.parseError ?? "parse_error",
      }));
    const criticalParseErrors = parseErrors.filter((error) => isAvailabilityBlockingTab(error.tab));
    const nonCriticalParseErrors = parseErrors.filter((error) => !isAvailabilityRelevantTab(error.tab));
    const directSeatsAvailable = hasDirectAvailableSeats(snapshot);
    const occupancyParseErrors = parseErrors.filter((error) => error.tab === "Inscripciones");
    const blockingParseErrors = [
      ...criticalParseErrors,
      ...(occupancyParseErrors.length > 0 && !directSeatsAvailable ? occupancyParseErrors : []),
    ];
    const occupancyUnavailableWithDirectSeats = occupancyParseErrors.length > 0 && directSeatsAvailable;
    const diagnostics: NormalizedServiceAvailabilityDiagnostics = {
      ...baseDiagnostics,
      headersDetected: blockingParseErrors.length === 0,
      criticalTabsOk: blockingParseErrors.length === 0,
      parseErrors,
      criticalParseErrors: blockingParseErrors,
      nonCriticalParseErrors,
      nonCriticalParseErrorsCount: nonCriticalParseErrors.length,
      errorType: occupancyUnavailableWithDirectSeats ? "occupancy_unavailable_using_direct_seats" : null,
      tabs: tabs.map((tab) => ({
        name: tab.tab,
        headerRowNumber: tab.headerRowIndex + 1,
        rows: tab.rows.length,
      })),
    };

    if (blockingParseErrors.length > 0) {
      const legacySessions = serviceKey === "charla_embarazo_1_20"
        ? await readLegacyCharlaAvailability(sheetsClient, sheetId)
        : [];
      if (legacySessions.length > 0) {
        return {
          ok: true,
          serviceKey,
          reason: "sessions_available",
          sessions: legacySessions,
          diagnostics: {
            ...diagnostics,
            selectedSource: "legacy_charla_sheet",
            headersDetected: true,
            criticalTabsOk: true,
            errorType: "legacy_charla_layout",
          },
        };
      }
      return {
        ok: false,
        serviceKey,
        reason: "header_not_found",
        sessions: [],
        snapshot,
        diagnostics: {
          ...diagnostics,
          errorType: "header_not_found",
        },
      };
    }

    const sessions = listAvailableSessionsFromSnapshot(snapshot);
    return {
      ok: sessions.length > 0,
      serviceKey,
      reason: sessions.length > 0 ? "sessions_available" : "no_sessions_available",
      sessions,
      snapshot,
      diagnostics: sessions.length > 0 ? diagnostics : { ...diagnostics, errorType: null },
    };
  } catch (error) {
    return {
      ok: false,
      serviceKey,
      reason: "read_error",
      sessions: [],
      diagnostics: {
        ...baseDiagnostics,
        criticalTabsOk: false,
        errorType: classifyAvailabilityError(error),
      },
    };
  }
}

async function readLegacyCharlaAvailability(
  client: NormalizedSheetsClient,
  sheetId: string,
): Promise<NormalizedAvailableSession[]> {
  if (!client.profileSpreadsheet) {
    return [];
  }
  try {
    const profile = await client.profileSpreadsheet(sheetId);
    const tabs = await Promise.all(
      profile.tabs.map(async (tab) => ({
        title: tab.title,
        rows: await client.readTabRows(sheetId, tab.title),
      })),
    );
    return listLegacyCharlaSessions({
      spreadsheetTitle: profile.title,
      tabs,
    });
  } catch {
    return [];
  }
}

async function readNormalizedAvailabilitySnapshot(input: {
  serviceKey: MaternalyNormalizedServiceKey;
  sheetId: string;
  client: NormalizedSheetsClient;
}): Promise<NormalizedServiceSheetSnapshot> {
  const tabEntries = await Promise.all(
    NORMALIZED_REQUIRED_TABS.map(async (tab) => [
      tab,
      await readAvailabilityTab(input.client, input.sheetId, tab),
    ] as const),
  );

  return {
    serviceKey: input.serviceKey,
    sheetId: input.sheetId,
    tabs: Object.fromEntries(tabEntries) as Record<NormalizedRequiredTab, NormalizedTabSnapshot>,
  };
}

async function readAvailabilityTab(
  client: NormalizedSheetsClient,
  sheetId: string,
  tab: NormalizedRequiredTab,
): Promise<NormalizedTabSnapshot> {
  try {
    return {
      tab,
      ...rowsToObjects(await client.readTabRows(sheetId, tab), { tab }),
    };
  } catch (error) {
    return emptyTabSnapshot(tab, classifyAvailabilityError(error));
  }
}

function emptyTabSnapshot(tab: NormalizedRequiredTab, parseError: string): NormalizedTabSnapshot {
  return {
    tab,
    headers: [],
    normalizedHeaders: [],
    headerRowIndex: -1,
    rows: [],
    parseError,
  };
}

function isAvailabilityBlockingTab(tab: string): boolean {
  return tab === "Grupos_Ediciones" || tab === "Sesiones";
}

function isAvailabilityRelevantTab(tab: string): boolean {
  return isAvailabilityBlockingTab(tab) || tab === "Inscripciones";
}

function hasDirectAvailableSeats(snapshot: NormalizedServiceSheetSnapshot): boolean {
  const sessions = snapshot.tabs.Sesiones;
  return (
    !sessions.parseError &&
    hasColumn(sessions.headers, "availableSeats") &&
    sessions.rows.some((row) => getCell(row, "availableSeats"))
  );
}

function classifyAvailabilityError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("auth") || message.includes("credential") || message.includes("permission")) {
    return "auth_error";
  }
  if (message.includes("not found") || message.includes("404")) {
    return "sheet_not_found";
  }
  if (message.includes("quota") || message.includes("rate")) {
    return "quota_or_rate_limit";
  }
  return "read_error";
}
