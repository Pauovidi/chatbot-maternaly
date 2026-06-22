import { describe, expect, it } from "vitest";
import {
  applyVisibleAppendFormat,
  buildVisibleTextFormatRequest,
  parseUpdatedA1Range,
} from "@/lib/maternaly/sheets/client";

describe("Maternaly Google Sheets visible append formatting", () => {
  it("parses an appended row range without touching headers", () => {
    expect(parseUpdatedA1Range("Clientes_Local!A5:P5")).toEqual({
      sheetTitle: "Clientes_Local",
      startRowIndex: 4,
      endRowIndex: 5,
      startColumnIndex: 0,
      endColumnIndex: 16,
    });
    expect(parseUpdatedA1Range("'Interacciones Chatbot'!B7:O7")).toMatchObject({
      sheetTitle: "Interacciones Chatbot",
      startRowIndex: 6,
      endRowIndex: 7,
      startColumnIndex: 1,
      endColumnIndex: 15,
    });
    expect(() => parseUpdatedA1Range("Clientes_Local!A1:P1")).toThrow(/header_or_invalid/);
  });

  it("builds a black text repeatCell request for the appended range", () => {
    expect(
      buildVisibleTextFormatRequest(123, {
        startRowIndex: 4,
        endRowIndex: 5,
        startColumnIndex: 0,
        endColumnIndex: 16,
      }),
    ).toEqual({
      repeatCell: {
        range: {
          sheetId: 123,
          startRowIndex: 4,
          endRowIndex: 5,
          startColumnIndex: 0,
          endColumnIndex: 16,
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
    });
  });

  it("invokes batchUpdate with visible black text for the updated append range", async () => {
    const batchUpdates: unknown[] = [];
    const fakeClient = {
      spreadsheets: {
        get: async () => ({
          data: {
            sheets: [
              {
                properties: {
                  sheetId: 456,
                  title: "Clientes_Local",
                },
              },
            ],
          },
        }),
        batchUpdate: async (request: unknown) => {
          batchUpdates.push(request);
          return { data: {} };
        },
      },
    };

    await expect(
      applyVisibleAppendFormat({
        client: fakeClient as never,
        spreadsheetId: "sheet_synthetic",
        updatedRange: "Clientes_Local!A5:P5",
      }),
    ).resolves.toEqual({
      formattedRange: "Clientes_Local!A5:P5",
      formatApplied: true,
    });

    expect(batchUpdates).toEqual([
      {
        spreadsheetId: "sheet_synthetic",
        requestBody: {
          requests: [
            buildVisibleTextFormatRequest(456, {
              startRowIndex: 4,
              endRowIndex: 5,
              startColumnIndex: 0,
              endColumnIndex: 16,
            }),
          ],
        },
      },
    ]);
  });
});
