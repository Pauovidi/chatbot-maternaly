import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

import ExcelJS from "exceljs";
import { google, type drive_v3 } from "googleapis";
import type {
  SheetsColorPalette,
  SheetsMonthlyLayout,
  WorkbookDerivedSheetsContract,
} from "@/lib/hotel/config/sheets";
import { parseWorkbookMonthKeyFromTitle } from "@/lib/hotel/config/sheets-contract";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

export const DEFAULT_HOTEL_SHEET_BOOTSTRAP_SOURCE =
  "D:\\- TOT EL DEMES\\TREBALLS\\FEINA ACTUAL\\Reddia\\somos perros\\Copia de FPO1-04 RESERVAS BUENO.xlsx";

export interface ExcelSheetValuePreview {
  cell: string;
  value: string;
}

export interface ExcelColorSummary {
  argb: string;
  count: number;
}

export interface ExcelSheetInspection {
  title: string;
  dimension: string;
  rowCount: number;
  columnCount: number;
  mergedRanges: string[];
  freezePane?: string | null;
  formulaCells: number;
  dataValidationCount: number;
  conditionalFormattingCount: number;
  solidFillColors: ExcelColorSummary[];
  borderStyles: Array<{ style: string; count: number }>;
  previewRows: Array<{ row: number; values: ExcelSheetValuePreview[] }>;
}

export interface ExcelWorkbookInspection {
  sourcePath: string;
  fileSize: number;
  sheetCount: number;
  sheetNames: string[];
  monthlySheets: string[];
  rejectedSheets: string[];
  summarySheets: string[];
  dominantMonthSheet: ExcelSheetInspection | null;
  monthSheetMap: Record<string, string>;
  derivedLayout: Partial<SheetsMonthlyLayout>;
  derivedColorPalette: Partial<SheetsColorPalette>;
  legendRows: Array<{
    label: string;
    colorArgb?: string;
    row: number;
  }>;
  sheets: ExcelSheetInspection[];
}

export interface HotelSheetBootstrapInput {
  sourcePath: string;
  spreadsheetTitle: string;
  shareWithEmail?: string;
  serviceAccountEmail?: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRedirectUri: string;
  oauthTokenPath: string;
  googleProjectId?: string;
  contractOutputPath?: string;
}

export interface HotelSheetBootstrapResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sharedWithEmail?: string;
  contractPath?: string;
  contract: WorkbookDerivedSheetsContract;
  inspection: ExcelWorkbookInspection;
}

interface GoogleOAuthTokenPayload {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

interface GoogleApiLikeError {
  message?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
}

function argbToHex(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (/^[A-F0-9]{8}$/u.test(normalized)) {
    return `#${normalized.slice(2)}`;
  }

  if (/^[A-F0-9]{6}$/u.test(normalized)) {
    return `#${normalized}`;
  }

  return undefined;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function maskClientId(clientId: string): string {
  if (clientId.length <= 12) {
    return `${clientId.slice(0, 4)}...`;
  }

  return `${clientId.slice(0, 8)}...${clientId.slice(-8)}`;
}

function formatOAuthErrorBody(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function openUrlInBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return;
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [url], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return;
    }

    const child = spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // If the browser cannot be opened automatically, the URL is still printed to stdout.
  }
}

async function readPersistedOAuthToken(
  tokenPath: string,
): Promise<GoogleOAuthTokenPayload | undefined> {
  try {
    const raw = await readFile(tokenPath, "utf8");
    return JSON.parse(raw) as GoogleOAuthTokenPayload;
  } catch {
    return undefined;
  }
}

async function persistOAuthToken(
  tokenPath: string,
  token: GoogleOAuthTokenPayload,
): Promise<void> {
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(token, null, 2), "utf8");
}

async function persistAuthorizationUrl(
  tokenPath: string,
  authorizationUrl: string,
): Promise<string> {
  const outputPath = tokenPath.replace(/\.json$/u, ".auth-url.txt");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${authorizationUrl}\n`, "utf8");
  return outputPath;
}

async function waitForOAuthCode(
  redirectUri: string,
): Promise<string> {
  const redirectUrl = new URL(redirectUri);
  const hostname = redirectUrl.hostname;
  const port = Number(redirectUrl.port || (redirectUrl.protocol === "https:" ? 443 : 80));
  const pathname = redirectUrl.pathname || "/";

  if (!["127.0.0.1", "localhost"].includes(hostname)) {
    throw new Error(
      "GOOGLE_OAUTH_REDIRECT_URI debe apuntar a localhost o 127.0.0.1 para el flujo local.",
    );
  }

  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("La autorización OAuth ha expirado sin recibir código de Google."));
    }, 5 * 60 * 1000);

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", redirectUri);
      if (requestUrl.pathname !== pathname) {
        response.statusCode = 404;
        response.end("Ruta OAuth no encontrada.");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      if (error) {
        clearTimeout(timeout);
        response.statusCode = 400;
        response.end("Google ha devuelto un error durante la autorización.");
        server.close();
        reject(new Error(`Google OAuth devolvió el error ${error}.`));
        return;
      }

      const code = requestUrl.searchParams.get("code");
      if (!code) {
        response.statusCode = 400;
        response.end("Falta el código OAuth.");
        return;
      }

      clearTimeout(timeout);
      console.log(`[hotel:sheet:init] callback recibido en ${hostname}:${port}${pathname}`);
      console.log(`[hotel:sheet:init] authorization code recibido; empieza el token exchange`);
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<html><body><h1>Autorización completada</h1><p>Ya puedes volver al terminal.</p></body></html>");
      server.close();
      resolve(code);
    });

    server.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.listen(port, hostname);
  });
}

async function createDriveClient(
  input: HotelSheetBootstrapInput,
): Promise<drive_v3.Drive> {
  const oauthClientId = input.oauthClientId.trim();
  const oauthClientSecret = input.oauthClientSecret.trim();
  const oauthRedirectUri = input.oauthRedirectUri.trim();
  const oauthTokenPath = input.oauthTokenPath.trim();

  if (!oauthClientId || !oauthClientSecret || !oauthRedirectUri) {
    throw new Error(
      "Faltan GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET o GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }

  console.log(`[hotel:sheet:init] oauth client id=${maskClientId(oauthClientId)}`);
  console.log(`[hotel:sheet:init] oauth redirect uri=${oauthRedirectUri}`);

  const oauthClient = new google.auth.OAuth2(
    oauthClientId,
    oauthClientSecret,
    oauthRedirectUri,
  );
  const persistedToken = await readPersistedOAuthToken(oauthTokenPath);

  if (persistedToken) {
    console.log(`[hotel:sheet:init] token OAuth reutilizado desde ${oauthTokenPath}`);
    oauthClient.setCredentials(persistedToken);
  } else {
    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [DRIVE_SCOPE, SPREADSHEETS_SCOPE],
      include_granted_scopes: true,
    });

    const authorizationUrlPath = await persistAuthorizationUrl(
      oauthTokenPath,
      authorizationUrl,
    );

    console.log(`[hotel:sheet:init] Abre este enlace para autorizar el bootstrap: ${authorizationUrl}`);
    console.log(`[hotel:sheet:init] URL completa guardada en ${authorizationUrlPath}`);
    openUrlInBrowser(authorizationUrl);

    const code = await waitForOAuthCode(oauthRedirectUri);

    try {
      const tokenResponse = await oauthClient.getToken({
        code,
        redirect_uri: oauthRedirectUri,
      });
      const token = tokenResponse.tokens as GoogleOAuthTokenPayload;

      if (!token.refresh_token) {
        throw new Error(
          "Google OAuth no devolvió refresh_token. Repite el flujo con prompt=consent y revoca el acceso previo si hace falta.",
        );
      }

      oauthClient.setCredentials(token);
      await persistOAuthToken(oauthTokenPath, token);
      console.log(`[hotel:sheet:init] token OAuth persistido en ${oauthTokenPath}`);
    } catch (error) {
      const oauthError = error as GoogleApiLikeError;
      console.error(`[hotel:sheet:init] token exchange failed`);
      console.error(`[hotel:sheet:init] token endpoint status=${oauthError.response?.status ?? "unknown"}`);
      console.error(
        `[hotel:sheet:init] token endpoint body=${formatOAuthErrorBody(oauthError.response?.data ?? oauthError.message ?? "unknown_error")}`,
      );
      throw error;
    }
  }

  return google.drive({
    version: "v3",
    auth: oauthClient,
  });
}

function ensureFileExists(path: string): Promise<void> {
  return access(path, fsConstants.R_OK);
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toUpperCase();
}

function classifySheet(title: string): "summary" | "rejected" | "month" | "other" {
  const normalized = normalizeTitle(title);
  if (normalized.includes("RECHAZADOS")) {
    return "rejected";
  }
  if (normalized.includes("NIVEL DE OCUP")) {
    return "summary";
  }
  if (
    /^(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SEPTIMEBRE|SEPTIMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/.test(
      normalized,
    )
  ) {
    return "month";
  }
  return "other";
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" && value !== null) {
    if ("formula" in value && typeof (value as { formula?: unknown }).formula === "string") {
      return `=${(value as { formula: string }).formula}`;
    }
    if ("richText" in value && Array.isArray((value as { richText?: unknown[] }).richText)) {
      return (value as { richText: Array<{ text?: string }> }).richText
        .map((part) => part.text ?? "")
        .join("");
    }
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
  }

  return String(value);
}

function columnIndexToLetter(columnIndex: number): string {
  let current = columnIndex;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - remainder - 1) / 26);
  }

  return result;
}

function previewSheetValues(worksheet: ExcelJS.Worksheet): Array<{ row: number; values: ExcelSheetValuePreview[] }> {
  const previews: Array<{ row: number; values: ExcelSheetValuePreview[] }> = [];
  const maxRows = Math.min(worksheet.rowCount, 12);
  const maxColumns = Math.min(Math.max(worksheet.actualColumnCount, worksheet.columnCount), 16);

  for (let rowNumber = 1; rowNumber <= maxRows; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: ExcelSheetValuePreview[] = [];

    for (let columnNumber = 1; columnNumber <= maxColumns; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      const text = cellToText(cell.value);
      if (text) {
        values.push({
          cell: cell.address,
          value: text,
        });
      }
    }

    if (values.length > 0) {
      previews.push({ row: rowNumber, values });
    }
  }

  return previews;
}

function summarizeSheet(worksheet: ExcelJS.Worksheet): ExcelSheetInspection {
  const colorCounts = new Map<string, number>();
  const borderCounts = new Map<string, number>();
  let formulaCells = 0;
  const worksheetAny = worksheet as ExcelJS.Worksheet & {
    dataValidations?: { model?: Record<string, unknown> };
    conditionalFormattings?: unknown[];
  };

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.type === ExcelJS.ValueType.Formula) {
        formulaCells += 1;
      }

      const fill = cell.fill;
      const fillArgb = fill && fill.type === "pattern" ? fill.fgColor?.argb : undefined;
      if (fillArgb) {
        colorCounts.set(fillArgb, (colorCounts.get(fillArgb) ?? 0) + 1);
      }

      const borderStyles = [
        cell.border?.left?.style,
        cell.border?.right?.style,
        cell.border?.top?.style,
        cell.border?.bottom?.style,
      ].filter(Boolean) as string[];

      for (const style of borderStyles) {
        borderCounts.set(style, (borderCounts.get(style) ?? 0) + 1);
      }
    });
  });

  const mergedRanges = ((worksheet as unknown as { model?: { merges?: string[] } }).model?.merges ?? []);
  const dimensions = (worksheet.dimensions as unknown as
    | { model?: { left: number; right: number; top: number; bottom: number } }
    | undefined)?.model;
  const dimension = dimensions
    ? `${columnIndexToLetter(dimensions.left)}${dimensions.top}:${columnIndexToLetter(dimensions.right)}${dimensions.bottom}`
    : "";
  return {
    title: worksheet.name,
    dimension,
    rowCount: worksheet.rowCount,
    columnCount: worksheet.columnCount,
    mergedRanges,
    freezePane: worksheet.views?.[0]?.activeCell ?? null,
    formulaCells,
    dataValidationCount: Object.keys(worksheetAny.dataValidations?.model ?? {}).length,
    conditionalFormattingCount: worksheetAny.conditionalFormattings?.length ?? 0,
    solidFillColors: [...colorCounts.entries()]
      .map(([argb, count]) => ({ argb, count }))
      .sort((left, right) => right.count - left.count),
    borderStyles: [...borderCounts.entries()]
      .map(([style, count]) => ({ style, count }))
      .sort((left, right) => right.count - left.count),
    previewRows: previewSheetValues(worksheet),
  };
}

function extractLegendRows(worksheet: ExcelJS.Worksheet): ExcelWorkbookInspection["legendRows"] {
  const legendRows: ExcelWorkbookInspection["legendRows"] = [];

  for (let rowNumber = 46; rowNumber <= 52; rowNumber += 1) {
    const label = cellToText(worksheet.getCell(`A${rowNumber}`).value);
    if (!label) {
      continue;
    }

    const colorCell = worksheet.getCell(`D${rowNumber}`);
    const colorArgb =
      colorCell.fill && colorCell.fill.type === "pattern" ? colorCell.fill.fgColor?.argb : undefined;

    legendRows.push({
      label,
      colorArgb,
      row: rowNumber,
    });
  }

  return legendRows;
}

function deriveMonthSheetMap(sheetNames: string[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const title of sheetNames) {
    const monthKey = parseWorkbookMonthKeyFromTitle(title);
    if (!monthKey || map[monthKey]) {
      continue;
    }

    map[monthKey] = title;
  }

  return map;
}

function deriveColorPalette(
  legendRows: ExcelWorkbookInspection["legendRows"],
): Partial<SheetsColorPalette> {
  const byLabel = new Map(
    legendRows.map((item) => [item.label, argbToHex(item.colorArgb)]),
  );

  return {
    pending: byLabel.get("No comparte") ?? "#FFC000",
    available: byLabel.get("Sociable") ?? "#92D050",
    noAvailability: byLabel.get("No sociable") ?? "#FF0000",
    confirmed: byLabel.get("Nuevo") ?? "#00B0F0",
    reminder: byLabel.get("No comparte") ?? "#FFC000",
    review: byLabel.get("No comparte") ?? "#FFC000",
    header: "#FF0000",
    overflow:
      byLabel.get("Antiguo (no se recuerda carácter)") ??
      byLabel.get("Escuela de dia") ??
      "#7030A0",
  };
}

function buildDerivedContract(
  inspection: ExcelWorkbookInspection,
): WorkbookDerivedSheetsContract {
  return {
    sourceWorkbookFileName: inspection.sourcePath.split("\\").pop(),
    monthSheetMap: inspection.monthSheetMap,
    layout: inspection.derivedLayout,
    colorPalette: inspection.derivedColorPalette,
    legend: inspection.legendRows
      .filter((item) => item.colorArgb)
      .map((item) => ({
        label: item.label,
        color: argbToHex(item.colorArgb) ?? item.colorArgb ?? "",
        sampleCell: `D${item.row}`,
      })),
    roomLabels: Array.from({ length: 16 }, (_, index) => ({
      rowIndex: 4 + index * 2,
      label: `HAB ${index + 1}`,
    })).concat([
      { rowIndex: 36, label: "COCINA" },
      { rowIndex: 38, label: "ENTRADA" },
    ]),
    sheetSummaries: inspection.sheets.map((sheet) => ({
      title: sheet.title,
      kind: classifySheet(sheet.title),
      monthKey: parseWorkbookMonthKeyFromTitle(sheet.title),
      usefulRange: sheet.dimension || null,
    })),
  };
}

async function persistDerivedContract(
  contractPath: string,
  contract: WorkbookDerivedSheetsContract,
): Promise<void> {
  const directory = contractPath.replace(/[\\/][^\\/]+$/u, "");
  await mkdir(directory, { recursive: true });
  await writeFile(contractPath, JSON.stringify(contract, null, 2), "utf8");
}

export async function inspectHotelWorkbook(
  sourcePath: string,
): Promise<ExcelWorkbookInspection> {
  await ensureFileExists(sourcePath);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const fileStat = await stat(sourcePath);
  const sheets = workbook.worksheets.map((worksheet) => summarizeSheet(worksheet));
  const monthlySheets = sheets
    .filter((sheet) => classifySheet(sheet.title) === "month")
    .map((sheet) => sheet.title);
  const rejectedSheets = sheets
    .filter((sheet) => classifySheet(sheet.title) === "rejected")
    .map((sheet) => sheet.title);
  const summarySheets = sheets
    .filter((sheet) => classifySheet(sheet.title) === "summary")
    .map((sheet) => sheet.title);
  const monthSheetMap = deriveMonthSheetMap(sheets.map((sheet) => sheet.title));
  const preferredMonthSheetTitle =
    monthSheetMap["2026-01"] ??
    monthSheetMap["2025-01"] ??
    monthlySheets[0];
  const dominantMonthSheet =
    sheets.find((sheet) => sheet.title === preferredMonthSheetTitle) ?? null;
  const dominantMonthWorksheet = dominantMonthSheet
    ? workbook.getWorksheet(dominantMonthSheet.title)
    : undefined;
  const legendRows = dominantMonthWorksheet ? extractLegendRows(dominantMonthWorksheet) : [];
  const derivedLayout: Partial<SheetsMonthlyLayout> = {
    sheetNaming: "client-workbook-map",
    titleRowIndex: 1,
    titleRequired: false,
    dayHeaderRowIndex: 3,
    firstDataRowIndex: 4,
    lastDataRowIndex: 39,
    overflowRowStartIndex: 40,
    overflowRowEndIndex: 39,
    summaryRowStartIndex: 40,
    summaryRowEndIndex: 52,
    labelColumnIndex: 1,
    firstDayColumnIndex: 2,
    lastDayColumnIndex: 32,
    lastRelevantColumnIndex: 33,
    dayCount: 31,
    occupancyMode: "mirror-daily-counts",
    sheetNameMap: monthSheetMap,
    searchRowRanges: [{ startRowIndex: 4, endRowIndex: 39 }],
  };
  const derivedColorPalette = deriveColorPalette(legendRows);

  return {
    sourcePath,
    fileSize: fileStat.size,
    sheetCount: sheets.length,
    sheetNames: sheets.map((sheet) => sheet.title),
    monthlySheets,
    rejectedSheets,
    summarySheets,
    dominantMonthSheet,
    monthSheetMap,
    derivedLayout,
    derivedColorPalette,
    legendRows,
    sheets,
  };
}

function buildSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

export async function bootstrapHotelSpreadsheetFromExcel(
  input: HotelSheetBootstrapInput,
): Promise<HotelSheetBootstrapResult> {
  const sourcePath = input.sourcePath.trim();
  const spreadsheetTitle = input.spreadsheetTitle.trim();
  const shareWithEmail =
    trimOrUndefined(input.shareWithEmail) ??
    trimOrUndefined(input.serviceAccountEmail);
  const inspection = await inspectHotelWorkbook(sourcePath);
  const contract = buildDerivedContract(inspection);
  const drive = await createDriveClient(input);

  const created = await drive.files.create({
    requestBody: {
      name: spreadsheetTitle,
      mimeType: GOOGLE_SHEETS_MIME_TYPE,
    },
    media: {
      mimeType: XLSX_MIME_TYPE,
      body: createReadStream(sourcePath),
    },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });

  const spreadsheetId = created.data.id;
  if (!spreadsheetId) {
    throw new Error("Google Drive no devolvio un spreadsheetId utilizable.");
  }

  if (shareWithEmail) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: shareWithEmail,
      },
      fields: "id",
      supportsAllDrives: true,
    });
  }

  if (input.contractOutputPath) {
    await persistDerivedContract(input.contractOutputPath, contract);
  }

  return {
    spreadsheetId,
    spreadsheetUrl: created.data.webViewLink ?? buildSpreadsheetUrl(spreadsheetId),
    sharedWithEmail: shareWithEmail ?? undefined,
    contractPath: input.contractOutputPath,
    contract,
    inspection,
  };
}
