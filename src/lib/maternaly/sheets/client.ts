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
