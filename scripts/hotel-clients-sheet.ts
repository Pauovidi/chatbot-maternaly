import { google, type sheets_v4 } from "googleapis";
import { getSheetsAdapterContextFromEnv } from "../src/lib/hotel/config";
import { CLIENTS_SHEET_HEADERS } from "../src/lib/hotel/clients";

export const CLIENTS_SHEET_NAME =
  process.env.HOTEL_CLIENTS_SHEET_NAME?.trim() || "CLIENTES";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"] as const;

export interface ClientsSheetContext {
  client: sheets_v4.Sheets;
  spreadsheetId: string;
}

export function quoteSheetRange(sheetName: string, range: string): string {
  return `'${sheetName.replace(/'/g, "''")}'!${range}`;
}

export async function createClientsSheetsContext(): Promise<ClientsSheetContext> {
  const context = getSheetsAdapterContextFromEnv("real");
  if (!context.spreadsheetId) {
    throw new Error("Falta HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID.");
  }

  if (context.accessToken?.trim()) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: context.accessToken.trim() });
    return {
      client: google.sheets({ version: "v4", auth }),
      spreadsheetId: context.spreadsheetId,
    };
  }

  const auth = new google.auth.GoogleAuth({
    credentials: context.serviceAccountJson
      ? JSON.parse(context.serviceAccountJson)
      : undefined,
    scopes: [...SCOPES],
  });

  return {
    client: google.sheets({ version: "v4", auth }),
    spreadsheetId: context.spreadsheetId,
  };
}

export async function getSheetId(
  context: ClientsSheetContext,
  sheetName: string,
): Promise<number | null> {
  const response = await context.client.spreadsheets.get({
    spreadsheetId: context.spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const match = response.data.sheets?.find(
    (sheet) => sheet.properties?.title === sheetName,
  );
  return match?.properties?.sheetId ?? null;
}

export async function ensureClientsSheet(
  context: ClientsSheetContext,
  sheetName = CLIENTS_SHEET_NAME,
): Promise<{ created: boolean; headersWritten: boolean }> {
  let sheetId = await getSheetId(context, sheetName);
  let created = false;
  if (sheetId === null) {
    const response = await context.client.spreadsheets.batchUpdate({
      spreadsheetId: context.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    });
    sheetId =
      response.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
    created = true;
  }

  const current = await context.client.spreadsheets.values.get({
    spreadsheetId: context.spreadsheetId,
    range: quoteSheetRange(sheetName, "1:1"),
    majorDimension: "ROWS",
  });
  const headerRow = current.data.values?.[0] ?? [];
  const hasHeaders = CLIENTS_SHEET_HEADERS.every((header, index) => {
    return String(headerRow[index] ?? "").trim().toLowerCase() === header;
  });

  if (!hasHeaders) {
    await context.client.spreadsheets.values.update({
      spreadsheetId: context.spreadsheetId,
      range: quoteSheetRange(sheetName, "A1:M1"),
      valueInputOption: "RAW",
      requestBody: { values: [[...CLIENTS_SHEET_HEADERS]] },
    });
  }

  return { created, headersWritten: !hasHeaders };
}

export function timestampSuffix(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function backupClientsSheet(
  context: ClientsSheetContext,
  sheetName = CLIENTS_SHEET_NAME,
): Promise<string | null> {
  const sheetId = await getSheetId(context, sheetName);
  if (sheetId === null) {
    return null;
  }

  const backupName = `${sheetName}_BACKUP_${timestampSuffix()}`;
  await context.client.spreadsheets.batchUpdate({
    spreadsheetId: context.spreadsheetId,
    requestBody: {
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: sheetId,
            newSheetName: backupName,
          },
        },
      ],
    },
  });
  return backupName;
}
