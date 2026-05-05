import { loadEnvConfig } from "@next/env";
import path from "node:path";

import {
  bootstrapHotelSpreadsheetFromExcel,
  DEFAULT_HOTEL_SHEET_BOOTSTRAP_SOURCE,
} from "../src/lib/hotel/sheets/bootstrap-excel";

loadEnvConfig(process.cwd());

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() ?? fallback?.trim();
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

async function main() {
  const contractOutputPath = path.resolve(
    process.cwd(),
    ".demo-state",
    "hotel-sheet-contract.json",
  );
  const input = {
    sourcePath:
      process.env.HOTEL_SHEET_BOOTSTRAP_SOURCE_XLSX?.trim() ??
      process.env.HOTEL_SOURCE_EXCEL_PATH?.trim() ??
      DEFAULT_HOTEL_SHEET_BOOTSTRAP_SOURCE,
    spreadsheetTitle:
      process.env.GOOGLE_SPREADSHEET_TITLE?.trim() ??
      readEnv("HOTEL_GOOGLE_SHEETS_BOOTSTRAP_TITLE", "Hotel canino - reservas"),
    shareWithEmail:
      process.env.SHEET_SHARE_WITH?.trim() ??
      process.env.GOOGLE_SHARE_WITH_EMAIL?.trim() ??
      process.env.HOTEL_GOOGLE_SHEETS_SHARE_WITH_EMAIL?.trim() ??
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
    oauthClientId: readEnv("GOOGLE_OAUTH_CLIENT_ID"),
    oauthClientSecret: readEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    oauthRedirectUri: readEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    oauthTokenPath:
      process.env.GOOGLE_OAUTH_TOKEN_PATH?.trim() ??
      path.resolve(process.cwd(), ".demo-state", "google-oauth-token.json"),
    googleProjectId: process.env.GOOGLE_PROJECT_ID?.trim(),
    contractOutputPath,
  };

  const result = await bootstrapHotelSpreadsheetFromExcel(input);

  console.log(`[hotel:sheet:init] source=${input.sourcePath}`);
  console.log(`[hotel:sheet:init] sheetCount=${result.inspection.sheetCount}`);
  console.log(`[hotel:sheet:init] monthlySheets=${result.inspection.monthlySheets.length}`);
  console.log(`[hotel:sheet:init] rejectedSheets=${result.inspection.rejectedSheets.length}`);
  console.log(`[hotel:sheet:init] spreadsheetId=${result.spreadsheetId}`);
  console.log(`[hotel:sheet:init] spreadsheetUrl=${result.spreadsheetUrl}`);
  console.log(`[hotel:sheet:init] oauthTokenPath=${input.oauthTokenPath}`);
  console.log(`[hotel:sheet:init] contractPath=${result.contractPath ?? contractOutputPath}`);
  console.log(`[hotel:sheet:init] mappedMonths=${Object.keys(result.contract.monthSheetMap ?? {}).length}`);
  if (result.sharedWithEmail) {
    console.log(`[hotel:sheet:init] sharedWith=${result.sharedWithEmail}`);
  }
  console.log(
    `[hotel:sheet:init] Guarda esta variable: HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID=${result.spreadsheetId}`,
  );
  console.log(
    `[hotel:sheet:init] Guarda esta variable: HOTEL_GOOGLE_SHEETS_CONTRACT_PATH=${result.contractPath ?? contractOutputPath}`,
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo inicializar el Google Spreadsheet del hotel.",
  );
  process.exitCode = 1;
});
