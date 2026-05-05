import { google, type sheets_v4 } from "googleapis";

import { getSheetsAdapterContextFromEnv, mergeSheetsLayout } from "@/lib/hotel/config";
import {
  applyWritePlanToMatrix,
  buildAvailabilityResult,
  buildMonthSnapshotFromGrid,
  buildWritePlanForReservation,
  buildWriteResult,
  getSheetNameForMonth,
  getSheetRange,
  normalizeSheetTitle,
  validateMonthGrid,
} from "@/lib/hotel/sheets/structure";
import type {
  GoogleAuthContext,
  SheetAdapter,
  SheetAdapterContext,
  SheetMonthReadResult,
  SheetStructureReport,
} from "@/lib/hotel/sheets/types";

const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

function ensureGoogleConfig(
  context: SheetAdapterContext,
): asserts context is SheetAdapterContext & {
  spreadsheetId: string;
} {
  if (!context.spreadsheetId) {
    throw new Error(
      "Falta HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID para activar Google Sheets real.",
    );
  }
}

function normalizeGoogleCredentials(
  context: GoogleAuthContext,
): string | undefined {
  if (context.serviceAccountJson?.trim()) {
    return context.serviceAccountJson.trim();
  }

  return undefined;
}

async function createSheetsClient(
  context: GoogleAuthContext,
): Promise<sheets_v4.Sheets> {
  if (context.accessToken?.trim()) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: context.accessToken.trim(),
    });

    return google.sheets({
      version: "v4",
      auth,
    });
  }

  const credentialsJson = normalizeGoogleCredentials(context);
  const auth = new google.auth.GoogleAuth({
    credentials: credentialsJson ? JSON.parse(credentialsJson) : undefined,
    scopes: [...GOOGLE_SHEETS_SCOPES],
  });

  return google.sheets({
    version: "v4",
    auth,
  });
}

function quoteSheetRange(sheetName: string, range: string): string {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'!${range}`;
}

function hexToRgbColor(
  hex: string,
): { red: number; green: number; blue: number } {
  const normalized = hex.replace("#", "").trim();
  if (!/^[\dA-Fa-f]{6}$/.test(normalized)) {
    return { red: 1, green: 1, blue: 1 };
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;

  return { red, green, blue };
}

async function getSheetProperties(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<sheets_v4.Schema$SheetProperties[]> {
  const response = await client.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });

  return response.data.sheets?.map((sheet) => sheet.properties ?? {}).filter(Boolean) ?? [];
}

async function resolveSheetProperty(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
): Promise<sheets_v4.Schema$SheetProperties> {
  const properties = await getSheetProperties(client, spreadsheetId);
  const expectedTitle = normalizeSheetTitle(sheetName);
  const match = properties.find((sheet) => normalizeSheetTitle(sheet.title ?? "") === expectedTitle);

  if (!match?.sheetId && match?.sheetId !== 0) {
    throw new Error(
      `No se ha encontrado la hoja mensual ${sheetName} en el spreadsheet configurado.`,
    );
  }

  return match;
}

async function readMonthValues(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  monthKey: string,
  context: SheetAdapterContext,
): Promise<SheetMonthReadResult & { sheetId: number }> {
  const sheetName = getSheetNameForMonth(monthKey, context);
  const layout = mergeSheetsLayout(context.layout);
  const range = quoteSheetRange(
    sheetName,
    getSheetRange(layout),
  );

  const [valuesResponse, property] = await Promise.all([
    client.spreadsheets.values.get({
      spreadsheetId,
      range,
      majorDimension: "ROWS",
      valueRenderOption: "FORMATTED_VALUE",
    }),
    resolveSheetProperty(client, spreadsheetId, sheetName),
  ]);

  const rawValues = valuesResponse.data.values ?? [];
  const structure = validateMonthGrid(rawValues, monthKey, context, sheetName);
  const snapshot = buildMonthSnapshotFromGrid(rawValues, monthKey, context, sheetName);

  if (property.sheetId === undefined || property.sheetId === null) {
    throw new Error(`La hoja ${sheetName} no expone un sheetId utilizable.`);
  }

  return {
    ...snapshot,
    structure,
    rawValues,
    sheetId: property.sheetId,
  };
}

function assertValidStructure(structure: SheetStructureReport): void {
  if (structure.ok) {
    return;
  }

  const errorMessages = structure.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);

  throw new Error(
    `La estructura de Google Sheets no coincide con el contrato esperado: ${errorMessages.join(
      " | ",
    )}`,
  );
}

async function applyCellUpdates(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  cellUpdates: Array<{ cell: string; value: string }>,
): Promise<void> {
  if (cellUpdates.length === 0) {
    return;
  }

  await client.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: cellUpdates.map((update) => ({
        range: quoteSheetRange(sheetName, update.cell),
        values: [[update.value]],
      })),
    },
  });
}

async function applyColorPlan(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  colorPlan: Array<{ row: number; column: number; color: string }>,
): Promise<void> {
  if (colorPlan.length === 0) {
    return;
  }

  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: colorPlan.map((item) => ({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: item.row - 1,
            endRowIndex: item.row,
            startColumnIndex: item.column - 1,
            endColumnIndex: item.column,
          },
          cell: {
            userEnteredFormat: {
              backgroundColorStyle: {
                rgbColor: hexToRgbColor(item.color),
              },
            },
          },
          fields: "userEnteredFormat.backgroundColorStyle",
        },
      })),
    },
  });
}

export async function buildGoogleSheetAdapter(
  providedContext?: Partial<SheetAdapterContext>,
): Promise<SheetAdapter> {
  const context = {
    ...getSheetsAdapterContextFromEnv("real"),
    ...providedContext,
    layout: {
      ...getSheetsAdapterContextFromEnv("real").layout,
      ...providedContext?.layout,
    },
    colorPalette: {
      ...getSheetsAdapterContextFromEnv("real").colorPalette,
      ...providedContext?.colorPalette,
    },
  } satisfies SheetAdapterContext;

  ensureGoogleConfig(context);

  const spreadsheetId = context.spreadsheetId;
  const client = await createSheetsClient({
    spreadsheetId,
    accessToken: context.accessToken,
    serviceAccountJson: context.serviceAccountJson,
  });

  async function readMonth(monthKey: string) {
    const month = await readMonthValues(client, spreadsheetId, monthKey, context);
    return {
      monthKey: month.monthKey,
      sheetName: month.sheetName,
      capacityBySlot: month.capacityBySlot,
      occupiedByDate: month.occupiedByDate,
      reservations: month.reservations,
      colorPlan: month.colorPlan,
    };
  }

  async function validateMonthStructure(monthKey: string) {
    const month = await readMonthValues(client, spreadsheetId, monthKey, context);
    return month.structure;
  }

  async function checkAvailability(input: {
    entryDate: string;
    entrySlot: "morning" | "afternoon";
    exitDate: string;
    exitSlot: "morning" | "afternoon";
    dogs: number;
  }) {
    const monthKey = input.entryDate.slice(0, 7);
    const month = await readMonthValues(client, spreadsheetId, monthKey, context);
    assertValidStructure(month.structure);
    return buildAvailabilityResult(month, input, month.rawValues, context);
  }

  async function buildWritePlan(reservation: Parameters<typeof buildWritePlanForReservation>[0]) {
    const monthKey = reservation.entryDate.slice(0, 7);
    const month = await readMonthValues(client, spreadsheetId, monthKey, context);
    assertValidStructure(month.structure);
    return buildWritePlanForReservation(
      {
        ...reservation,
        sheetName: month.sheetName,
      },
      month.rawValues,
      context,
    );
  }

  async function writeReservation(reservation: Parameters<typeof buildWritePlanForReservation>[0]) {
    const monthKey = reservation.entryDate.slice(0, 7);
    const month = await readMonthValues(client, spreadsheetId, monthKey, context);
    assertValidStructure(month.structure);

    const plan = buildWritePlanForReservation(
      {
        ...reservation,
        sheetName: month.sheetName,
      },
      month.rawValues,
      context,
    );

    const projectedMatrix = applyWritePlanToMatrix(month.rawValues, plan);
    const projectedStructure = validateMonthGrid(
      projectedMatrix,
      monthKey,
      context,
      month.sheetName,
    );
    assertValidStructure(projectedStructure);

    await applyCellUpdates(client, spreadsheetId, month.sheetName, plan.cellUpdates);
    await applyColorPlan(client, spreadsheetId, month.sheetId, plan.colorPlan);

    return buildWriteResult(plan, "real");
  }

  return {
    readMonth,
    validateMonthStructure,
    checkAvailability,
    buildWritePlan,
    writeReservation,
  };
}
