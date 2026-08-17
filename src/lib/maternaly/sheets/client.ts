import { google, type sheets_v4 } from "googleapis";
import { getGoogleServiceAccountJson } from "@/lib/maternaly/config/env";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export interface SheetTabProfile {
  title: string;
  gid?: number;
  rowCount?: number;
  columnCount?: number;
}

export interface SpreadsheetProfile {
  spreadsheetId: string;
  title?: string;
  tabs: SheetTabProfile[];
  readMethod: "service_account" | "public_csv";
}

export interface AppendRowResult {
  updatedRange?: string;
  updatedRows?: number;
  formattedRange?: string;
  formatApplied?: boolean;
  formatWarning?: string;
}

interface ParsedA1Range {
  sheetTitle: string;
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

function columnToIndex(column: string): number {
  return column
    .toUpperCase()
    .split("")
    .reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function indexToColumn(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("invalid_column_index");
  }

  let current = index + 1;
  let column = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }
  return column;
}

export function parseUpdatedA1Range(updatedRange: string): ParsedA1Range {
  const match = updatedRange.match(/^(?:'((?:''|[^'])+)'|([^!]+))!([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) {
    throw new Error("invalid_updated_range");
  }

  const sheetTitle = (match[1] ?? match[2] ?? "").replace(/''/g, "'");
  const startRowNumber = Number.parseInt(match[4], 10);
  const endRowNumber = Number.parseInt(match[6], 10);
  if (!sheetTitle || startRowNumber <= 1 || endRowNumber <= 1) {
    throw new Error("format_skipped_header_or_invalid_range");
  }

  return {
    sheetTitle,
    startRowIndex: startRowNumber - 1,
    endRowIndex: endRowNumber,
    startColumnIndex: columnToIndex(match[3]),
    endColumnIndex: columnToIndex(match[5]) + 1,
  };
}

export function buildVisibleTextFormatRequest(
  sheetId: number,
  range: Omit<ParsedA1Range, "sheetTitle">,
): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: range.startRowIndex,
        endRowIndex: range.endRowIndex,
        startColumnIndex: range.startColumnIndex,
        endColumnIndex: range.endColumnIndex,
      },
      cell: {
        userEnteredFormat: {
          textFormat: {
            foregroundColor: {
              red: 0,
              green: 0,
              blue: 0,
            },
          },
        },
      },
      fields: "userEnteredFormat.textFormat.foregroundColor",
    },
  };
}

function safeFormatWarning(error: unknown, spreadsheetId: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "unknown_format_error");
  return message.split(spreadsheetId).join("[sheet-id]").slice(0, 240);
}

export async function applyVisibleAppendFormat(input: {
  client: sheets_v4.Sheets;
  spreadsheetId: string;
  updatedRange: string;
}): Promise<{ formattedRange: string; formatApplied: true }> {
  const parsed = parseUpdatedA1Range(input.updatedRange);
  const profile = await input.client.spreadsheets.get({
    spreadsheetId: input.spreadsheetId,
    includeGridData: false,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheetId = profile.data.sheets?.find(
    (sheet) => sheet.properties?.title === parsed.sheetTitle,
  )?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error("sheet_title_not_found_for_format");
  }

  await input.client.spreadsheets.batchUpdate({
    spreadsheetId: input.spreadsheetId,
    requestBody: {
      requests: [
        buildVisibleTextFormatRequest(sheetId, {
          startRowIndex: parsed.startRowIndex,
          endRowIndex: parsed.endRowIndex,
          startColumnIndex: parsed.startColumnIndex,
          endColumnIndex: parsed.endColumnIndex,
        }),
      ],
    },
  });

  return {
    formattedRange: input.updatedRange,
    formatApplied: true,
  };
}

export class GoogleSheetsClient {
  private clientPromise: Promise<sheets_v4.Sheets> | null = null;

  private async getClient(): Promise<sheets_v4.Sheets> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient();
    }

    return this.clientPromise;
  }

  private async createClient(): Promise<sheets_v4.Sheets> {
    const credentialsJson = getGoogleServiceAccountJson();
    const auth = new google.auth.GoogleAuth({
      credentials: credentialsJson ? JSON.parse(credentialsJson) : undefined,
      keyFilename: credentialsJson ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES,
    });

    return google.sheets({ version: "v4", auth });
  }

  async profileSpreadsheet(spreadsheetId: string): Promise<SpreadsheetProfile> {
    const client = await this.getClient();
    const response = await client.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
      fields: "properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))",
    });

    return {
      spreadsheetId,
      title: response.data.properties?.title ?? undefined,
      readMethod: "service_account",
      tabs:
        response.data.sheets?.map((sheet) => ({
          title: sheet.properties?.title ?? "Untitled",
          gid: sheet.properties?.sheetId ?? undefined,
          rowCount: sheet.properties?.gridProperties?.rowCount ?? undefined,
          columnCount: sheet.properties?.gridProperties?.columnCount ?? undefined,
        })) ?? [],
    };
  }

  async readTabSample(
    spreadsheetId: string,
    tabTitle: string,
    range = "A1:Z30",
  ): Promise<unknown[][]> {
    const client = await this.getClient();
    const escaped = tabTitle.replace(/'/g, "''");
    const response = await client.spreadsheets.values.get({
      spreadsheetId,
      range: `'${escaped}'!${range}`,
      valueRenderOption: "FORMATTED_VALUE",
      majorDimension: "ROWS",
    });

    return response.data.values ?? [];
  }

  async readTabRows(
    spreadsheetId: string,
    tabTitle: string,
    range = "A:AZ",
  ): Promise<unknown[][]> {
    return this.readTabSample(spreadsheetId, tabTitle, range);
  }

  async duplicateTab(
    spreadsheetId: string,
    sourceSheetId: number,
    newTitle: string,
  ): Promise<{ backupSheetId?: number; title: string }> {
    const client = await this.getClient();
    const response = await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            duplicateSheet: {
              sourceSheetId,
              newSheetName: newTitle,
            },
          },
        ],
      },
    });
    const properties = response.data.replies?.[0]?.duplicateSheet?.properties;

    return {
      backupSheetId: properties?.sheetId ?? undefined,
      title: properties?.title ?? newTitle,
    };
  }

  async appendRow(
    spreadsheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ): Promise<AppendRowResult> {
    const client = await this.getClient();
    const escaped = tabTitle.replace(/'/g, "''");
    const response = await client.spreadsheets.values.append({
      spreadsheetId,
      range: `'${escaped}'!A:AZ`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [values.map((value) => value ?? "")],
      },
    });

    const updatedRange = response.data.updates?.updatedRange ?? undefined;
    const result: AppendRowResult = {
      updatedRange,
      updatedRows: response.data.updates?.updatedRows ?? undefined,
      formatApplied: false,
    };

    if (updatedRange) {
      try {
        const format = await applyVisibleAppendFormat({ client, spreadsheetId, updatedRange });
        result.formattedRange = format.formattedRange;
        result.formatApplied = format.formatApplied;
      } catch (error) {
        result.formatWarning = safeFormatWarning(error, spreadsheetId);
      }
    }

    return result;
  }

  async updateCell(
    spreadsheetId: string,
    tabTitle: string,
    rowNumber: number,
    columnIndex: number,
    value: string | number,
  ): Promise<void> {
    if (!Number.isInteger(rowNumber) || rowNumber <= 1) {
      throw new Error("invalid_data_row_number");
    }

    const client = await this.getClient();
    const escaped = tabTitle.replace(/'/g, "''");
    const cell = `${indexToColumn(columnIndex)}${rowNumber}`;
    await client.spreadsheets.values.update({
      spreadsheetId,
      range: `'${escaped}'!${cell}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[value]] },
    });
  }
}

export async function readPublicCsvSample(
  spreadsheetId: string,
  gid = "0",
): Promise<unknown[][]> {
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
  );
  if (!response.ok) {
    throw new Error(`Public CSV export returned ${response.status}`);
  }

  const text = await response.text();
  return text
    .split(/\r?\n/)
    .slice(0, 30)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "")));
}
