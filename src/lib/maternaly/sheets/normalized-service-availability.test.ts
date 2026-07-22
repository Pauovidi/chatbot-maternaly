import { describe, expect, it } from "vitest";
import { getNormalizedServiceAvailability } from "./normalized-service-availability";
import type { NormalizedSheetsClient } from "./normalized-client";

class LegacyCharlaWorkbookClient implements NormalizedSheetsClient {
  async profileSpreadsheet() {
    return {
      title: "26 CHARLA INFORMATIVA ERANDIO",
      tabs: [{ title: "10 -20 AGOSTO" }, { title: "7 -24 SEPTIEMBRE" }],
    };
  }

  async readTabRows(_sheetId: string, tabTitle: string): Promise<unknown[][]> {
    if (tabTitle === "10 -20 AGOSTO") {
      return [[
        "CHARLA INFORMATIVA ON LINE LUNES 10 AGOSTO A LAS 19:00 H NOMBRE CHARLA INFORMATIVA PRESENCIAL ERANDIO JUEVES 20 AGOSTO A LAS 18:30 H NOMBRE",
      ]];
    }
    if (tabTitle === "7 -24 SEPTIEMBRE") {
      return [["CHARLA INFORMATIVA PRESENCIAL ERANDIO JUEVES 24 SEPTIEMBRE A LAS 18:30 H"]];
    }
    throw new Error("tab_not_found");
  }

  async appendRow() {
    return {};
  }
}

describe("normalized service availability", () => {
  it("falls back to the existing Charla workbook layout when normalized tabs do not exist", async () => {
    const result = await getNormalizedServiceAvailability({
      serviceKey: "charla_embarazo_1_20",
      client: new LegacyCharlaWorkbookClient(),
      env: {
        MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "legacy_charla_sheet",
        MATERNALY_NORMALIZED_SHEETS_ENABLED: "true",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      reason: "sessions_available",
      diagnostics: {
        selectedSource: "legacy_charla_sheet",
        errorType: "legacy_charla_layout",
      },
    });
    expect(result.sessions.map((session) => session.date)).toEqual([
      "2026-08-10",
      "2026-08-20",
      "2026-09-24",
    ]);
  });
});
