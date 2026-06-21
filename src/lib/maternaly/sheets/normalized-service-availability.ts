import { readMaternalyRuntimeConfig } from "../config/env";
import {
  GoogleNormalizedSheetsClient,
  readNormalizedServiceSheet,
  type NormalizedSheetsClient,
  type NormalizedServiceSheetSnapshot,
} from "./normalized-client";
import {
  listAvailableSessionsFromSnapshot,
  type NormalizedAvailableSession,
} from "./normalized-availability";
import { redactSheetId, type MaternalyNormalizedServiceKey } from "./normalized-template";

export type NormalizedServiceAvailabilityReason =
  | "sessions_available"
  | "no_sessions_available"
  | "missing_sheet_id"
  | "read_error"
  | "header_not_found";

export interface NormalizedServiceAvailabilityDiagnostics {
  selectedSource: "normalized_sheets";
  headersDetected: boolean;
  sheetIdRedacted?: string;
  errorType?: string;
  parseErrors?: Array<{
    tab: string;
    error: string;
  }>;
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
    const snapshot = await readNormalizedServiceSheet(serviceKey, sheetsClient, env);
    const tabs = Object.values(snapshot.tabs);
    const parseErrors = tabs
      .filter((tab) => tab.parseError)
      .map((tab) => ({
        tab: tab.tab,
        error: tab.parseError ?? "parse_error",
      }));
    const diagnostics: NormalizedServiceAvailabilityDiagnostics = {
      ...baseDiagnostics,
      headersDetected: tabs.every((tab) => tab.headerRowIndex >= 0),
      parseErrors,
      tabs: tabs.map((tab) => ({
        name: tab.tab,
        headerRowNumber: tab.headerRowIndex + 1,
        rows: tab.rows.length,
      })),
    };

    if (parseErrors.length > 0) {
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
      diagnostics,
    };
  } catch (error) {
    return {
      ok: false,
      serviceKey,
      reason: "read_error",
      sessions: [],
      diagnostics: {
        ...baseDiagnostics,
        errorType: classifyAvailabilityError(error),
      },
    };
  }
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
