import { describe, expect, it, vi } from "vitest";
import {
  cancelNormalizedRegistration,
  lookupActiveNormalizedRegistration,
} from "@/lib/maternaly/sheets/normalized-registration-management";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  createNormalizedWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";
import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";

function liveEnv(): NodeJS.ProcessEnv {
  return normalizedTestEnv({
    MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
    GOOGLE_SHEETS_ACCESS_MODE: "live",
    BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
  });
}

describe("normalized registration management", () => {
  it("cancels the active registration selected in the current conversation", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "charla_embarazo_1_20",
        "sesion_charla_bilbao_20261006",
        "grupo_charla_bilbao",
        "confirmada",
        "Ana Ruiz",
        "+34600111222",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);

    const result = await cancelNormalizedRegistration({
      phone: "whatsapp:+34 600 111 222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      client,
      env: liveEnv(),
    });

    expect(result.status).toBe("cancelled");
    expect(client.updatedCells).toEqual([
      expect.objectContaining({ tabTitle: "Inscripciones", value: "Cancelada" }),
    ]);
  });

  it("does not cancel blindly when more than one active registration matches", async () => {
    const registration = [
      "charla_embarazo_1_20",
      "sesion_charla_bilbao_20261006",
      "grupo_charla_bilbao",
      "confirmada",
      "Ana Ruiz",
      "+34600111222",
    ];
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [registration, [...registration]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);

    const result = await cancelNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      client,
      env: liveEnv(),
    });

    expect(result).toEqual({ status: "ambiguous", matches: 2 });
    expect(client.updatedCells).toHaveLength(0);
  });

  it("returns not_found for a cancelled registration", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "charla_embarazo_1_20",
        "sesion_charla_bilbao_20261006",
        "grupo_charla_bilbao",
        "cancelada",
        "Ana Ruiz",
        "+34600111222",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);

    await expect(cancelNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      client,
      env: liveEnv(),
    })).resolves.toEqual({ status: "not_found" });
  });

  it("cancels a manual real-template row by group when it has no session identity", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "INS_MANUAL_1",
        "CLI_MANUAL_1",
        "Ana",
        "Ruiz",
        "+34600111222",
        "grupo_charla_bilbao",
        "charla_embarazo_1_20",
        "2026-08-17",
        "manual",
        "0 €",
        "no_aplica",
        "Confirmada",
        "2027-01-15",
        "",
        "",
        "",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);

    const result = await cancelNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      selectedGroupId: "grupo_charla_bilbao",
      client,
      env: liveEnv(),
    });

    expect(result).toMatchObject({
      status: "cancelled",
      registration: {
        registrationId: "INS_MANUAL_1",
        sessionId: "sesion_charla_bilbao_20261006",
      },
    });
    expect(client.updatedCells).toEqual([
      expect.objectContaining({ tabTitle: "Inscripciones", value: "Cancelada" }),
    ]);
  });

  it("reconciles a lost update response when the Sheet row was actually cancelled", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "charla_embarazo_1_20",
        "sesion_charla_bilbao_20261006",
        "grupo_charla_bilbao",
        "confirmada",
        "Ana Ruiz",
        "+34600111222",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook, {
      failUpdateAfterApply: true,
    });

    const result = await cancelNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      selectedGroupId: "grupo_charla_bilbao",
      client,
      env: liveEnv(),
    });

    expect(result.status).toBe("cancelled");
    expect(client.updatedCells).toHaveLength(1);
  });

  it("matches a Spanish local phone in a manual row with the +34 WhatsApp identity", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "charla_embarazo_1_20",
        "sesion_charla_bilbao_20261006",
        "grupo_charla_bilbao",
        "confirmada",
        "Ana Ruiz",
        "600 111 222",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);

    const lookup = await lookupActiveNormalizedRegistration({
      phone: "whatsapp:+34 600 111 222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      client,
      env: liveEnv(),
    });
    const cancellation = await cancelNormalizedRegistration({
      phone: "whatsapp:+34 600 111 222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      client,
      env: liveEnv(),
    });

    expect(lookup.status).toBe("found");
    expect(cancellation.status).toBe("cancelled");
  });

  it("finds and cancels a wait-list registration without counting it as a confirmed place", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "charla_embarazo_1_20",
        "sesion_charla_bilbao_20261006",
        "grupo_charla_bilbao",
        "Lista espera",
        "Ana Ruiz",
        "+34600111222",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);

    const lookup = await lookupActiveNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      client,
      env: liveEnv(),
    });
    const cancellation = await cancelNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      client,
      env: liveEnv(),
    });

    expect(lookup).toMatchObject({
      status: "found",
      registration: { status: "Lista espera" },
    });
    expect(cancellation.status).toBe("cancelled");
  });

  it("does not cancel across services when one registration workbook cannot be read", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "charla_embarazo_1_20",
        "sesion_charla_bilbao_20261006",
        "grupo_charla_bilbao",
        "Activa",
        "Ana Ruiz",
        "+34600111222",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const readRows = client.readTabRows.bind(client);
    vi.spyOn(client, "readTabRows").mockImplementation((sheetId, tabTitle) => {
      if (sheetId === "sheet_blw" && tabTitle === "Inscripciones") {
        throw new Error("synthetic_blw_read_failure");
      }
      return readRows(sheetId, tabTitle);
    });

    const lookup = await lookupActiveNormalizedRegistration({
      phone: "+34600111222",
      client,
      env: liveEnv(),
    });
    const cancellation = await cancelNormalizedRegistration({
      phone: "+34600111222",
      client,
      env: liveEnv(),
    });

    expect(lookup).toMatchObject({ status: "read_error" });
    expect(cancellation).toMatchObject({ status: "read_error" });
    expect(client.updatedCells).toHaveLength(0);
  });

  it("re-resolves the target row when the team sorts the Sheet between reads", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [
        [
          "charla_embarazo_1_20",
          "sesion_charla_bilbao_20261006",
          "grupo_charla_bilbao",
          "Activa",
          "Ana Ruiz",
          "+34600111222",
        ],
        [
          "charla_embarazo_1_20",
          "sesion_charla_bilbao_20261006",
          "grupo_charla_bilbao",
          "Activa",
          "Bea López",
          "+34600999888",
        ],
      ],
    });
    const base = new InMemoryNormalizedSheetsClient(workbook);
    let registrationReads = 0;
    const client: NormalizedSheetsClient = {
      appendRow: base.appendRow.bind(base),
      updateCell: base.updateCell.bind(base),
      updateCellIfRowMatches: base.updateCellIfRowMatches.bind(base),
      async readTabRows(sheetId, tabTitle) {
        if (tabTitle === "Inscripciones" && ++registrationReads === 2) {
          const header = workbook.Inscripciones[0];
          const first = workbook.Inscripciones[1];
          const second = workbook.Inscripciones[2];
          workbook.Inscripciones.splice(0, 3, header, second, first);
        }
        return base.readTabRows(sheetId, tabTitle);
      },
    };

    const result = await cancelNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      client,
      env: liveEnv(),
    });

    expect(result.status).toBe("cancelled");
    expect(workbook.Inscripciones[1]).toContain("Bea López");
    expect(workbook.Inscripciones[1]).toContain("Activa");
    expect(workbook.Inscripciones[2]).toContain("Ana Ruiz");
    expect(workbook.Inscripciones[2]).toContain("Cancelada");
  });

  it("finds one moved registration when the stored conversation session is stale", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "charla_embarazo_1_20",
        "sesion_charla_reprogramada",
        "grupo_charla_reprogramado",
        "Activa",
        "Ana Ruiz",
        "+34600111222",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);

    const lookup = await lookupActiveNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_antigua",
      selectedGroupId: "grupo_charla_antiguo",
      client,
      env: liveEnv(),
    });

    expect(lookup).toMatchObject({
      status: "found",
      registration: {
        sessionId: "sesion_charla_reprogramada",
        groupId: "grupo_charla_reprogramado",
      },
    });
  });

  it("does not cancel another person when a sort happens inside the conditional update", async () => {
    const workbook = createNormalizedWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [
        [
          "charla_embarazo_1_20",
          "sesion_charla_bilbao_20261006",
          "grupo_charla_bilbao",
          "Activa",
          "Ana Ruiz",
          "+34600111222",
        ],
        [
          "charla_embarazo_1_20",
          "sesion_charla_bilbao_20261006",
          "grupo_charla_bilbao",
          "Activa",
          "Bea López",
          "+34600999888",
        ],
      ],
    });
    const base = new InMemoryNormalizedSheetsClient(workbook);
    const client: NormalizedSheetsClient = {
      appendRow: base.appendRow.bind(base),
      readTabRows: base.readTabRows.bind(base),
      async updateCellIfRowMatches(...args) {
        const header = workbook.Inscripciones[0];
        const first = workbook.Inscripciones[1];
        const second = workbook.Inscripciones[2];
        workbook.Inscripciones.splice(0, 3, header, second, first);
        return base.updateCellIfRowMatches(...args);
      },
    };

    const result = await cancelNormalizedRegistration({
      phone: "+34600111222",
      serviceKey: "charla_embarazo_1_20",
      selectedSessionId: "sesion_charla_bilbao_20261006",
      client,
      env: liveEnv(),
    });

    expect(result).toEqual({
      status: "read_error",
      error: "registration_identity_changed_before_update",
    });
    expect(workbook.Inscripciones[1]).toContain("Activa");
    expect(workbook.Inscripciones[2]).toContain("Activa");
  });
});
