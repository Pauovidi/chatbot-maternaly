import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { MaternalyToolExecutor } from "@/lib/maternaly/conversation/core";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

class ChangingCapacityClient implements NormalizedSheetsClient {
  readonly appended: Array<{ tabTitle: string; values: Array<string | number | undefined> }> = [];
  private sessionReads = 0;

  constructor(private readonly workbook: Record<string, unknown[][]>) {}

  async readTabRows(_sheetId: string, tabTitle: string): Promise<unknown[][]> {
    const rows = this.workbook[tabTitle];
    if (!rows) {
      throw new Error(`missing_tab:${tabTitle}`);
    }

    if (tabTitle !== "Sesiones") {
      return rows.map((row) => [...row]);
    }

    this.sessionReads += 1;
    const copy = rows.map((row) => [...row]);
    if (this.sessionReads >= 2) {
      const headerIndex = copy.findIndex((row) => row.includes("sesion_id"));
      const header = copy[headerIndex].map(String);
      const dataRow = copy[headerIndex + 1];
      dataRow[header.indexOf("plazas_ocupadas")] = "1";
      dataRow[header.indexOf("plazas_disponibles")] = "0";
    }
    return copy;
  }

  async appendRow(
    _sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ) {
    this.appended.push({ tabTitle, values });
    return { updatedRange: `${tabTitle}!A1:Z1`, updatedRows: 1 };
  }
}

class FailingReadClient implements NormalizedSheetsClient {
  readonly appended: Array<{ tabTitle: string; values: Array<string | number | undefined> }> = [];

  async readTabRows(): Promise<unknown[][]> {
    throw new Error("synthetic_sheets_outage");
  }

  async appendRow(
    _sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ) {
    this.appended.push({ tabTitle, values });
    return { updatedRange: `${tabTitle}!A1:Z1`, updatedRows: 1 };
  }
}

class ChangingSessionDateClient implements NormalizedSheetsClient {
  readonly appended: Array<{ tabTitle: string; values: Array<string | number | undefined> }> = [];
  private sessionReads = 0;

  constructor(private readonly workbook: Record<string, unknown[][]>) {}

  async readTabRows(_sheetId: string, tabTitle: string): Promise<unknown[][]> {
    const rows = this.workbook[tabTitle];
    if (!rows) {
      throw new Error(`missing_tab:${tabTitle}`);
    }
    const copy = rows.map((row) => [...row]);
    if (tabTitle === "Sesiones") {
      this.sessionReads += 1;
      if (this.sessionReads >= 2) {
        const headerIndex = copy.findIndex((row) => row.includes("sesion_id"));
        const header = copy[headerIndex].map(String);
        copy[headerIndex + 1][header.indexOf("fecha")] = "2027-02-01";
      }
    }
    return copy;
  }

  async appendRow(
    _sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ) {
    this.appended.push({ tabTitle, values });
    return { updatedRange: `${tabTitle}!A1:Z1`, updatedRows: 1 };
  }
}

class FailingCommitReReadClient implements NormalizedSheetsClient {
  readonly appended: Array<{ tabTitle: string; values: Array<string | number | undefined> }> = [];
  private reads = 0;

  constructor(private readonly workbook: Record<string, unknown[][]>) {}

  async readTabRows(_sheetId: string, tabTitle: string): Promise<unknown[][]> {
    this.reads += 1;
    if (this.reads > 6) {
      throw new Error("synthetic_commit_reread_failure");
    }
    const rows = this.workbook[tabTitle];
    if (!rows) {
      throw new Error(`missing_tab:${tabTitle}`);
    }
    return rows.map((row) => [...row]);
  }

  async appendRow(
    _sheetId: string,
    tabTitle: string,
    values: Array<string | number | undefined>,
  ) {
    this.appended.push({ tabTitle, values });
    return { updatedRange: `${tabTitle}!A1:Z1`, updatedRows: 1 };
  }
}

describe("Charla: revalidación final y calendario seguro", () => {
  let tempDir = "";

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00.000Z"));
    tempDir = await mkdtemp(path.join(os.tmpdir(), "maternaly-charla-write-revalidation-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("bloquea la escritura si la última plaza desaparece entre la consulta y el alta", async () => {
    const client = new ChangingCapacityClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        sessionCapacity: "1",
        visualHeaderRows: false,
      }),
    );
    const executor = new MaternalyToolExecutor(client);
    const env = normalizedTestEnv({
      MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
      GOOGLE_SHEETS_ACCESS_MODE: "live",
      BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
    });

    const result = await executor.runNormalizedRegistration({
      serviceKey: "charla_embarazo_1_20",
      message: "Estos son todos mis datos",
      state: {
        serviceKey: "charla_embarazo_1_20",
        stage: "collecting_contact",
        selectedSessionId: "sesion_charla_bilbao_20261006",
        selectedGroupId: "grupo_charla_bilbao",
        location: "Bilbao",
        modality: "presencial",
        peopleCount: 1,
        fullName: "Ana Prueba Capacidad",
        phone: "+34600992001",
        fppOrDueDate: "2027-03-31",
        updatedAt: "2026-07-17T10:00:00.000Z",
      },
      env,
    });

    expect(client.appended).toHaveLength(0);
    expect(result.status).toBe("write_result");
    expect(result.selectedSession?.full).toBe(true);
    expect(result.plan).toMatchObject({
      blocked: true,
      blockedReasons: expect.arrayContaining(["session_full"]),
    });
    expect(result.writeResult).toMatchObject({ ok: false, applied: false });
  });

  it("solo confirma a una persona cuando dos teléfonos compiten por la última plaza", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        sessionCapacity: "1",
        visualHeaderRows: false,
      }),
    );
    const executor = new MaternalyToolExecutor(client);
    const env = normalizedTestEnv({
      MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
      GOOGLE_SHEETS_ACCESS_MODE: "live",
      BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
    });
    const registration = (fullName: string, phone: string) =>
      executor.runNormalizedRegistration({
        serviceKey: "charla_embarazo_1_20",
        message: "Estos son todos mis datos",
        state: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          selectedGroupId: "grupo_charla_bilbao",
          location: "Bilbao",
          modality: "presencial",
          peopleCount: 1,
          fullName,
          phone,
          fppOrDueDate: "2027-03-31",
          updatedAt: "2026-07-17T10:00:00.000Z",
        },
        env,
      });

    const results = await Promise.all([
      registration("Ana Primera", "+34600992011"),
      registration("Bea Segunda", "+34600992012"),
    ]);

    expect(results.filter((result) => result.writeResult?.registrationStatus === "confirmada"))
      .toHaveLength(1);
    expect(results.filter((result) => result.plan?.blockedReasons.includes("session_full")))
      .toHaveLength(1);
    expect(client.appended.filter((item) => item.tabTitle === "Inscripciones"))
      .toHaveLength(1);
  });

  it("revalida la semana gestacional si la fecha de la sesión cambia bajo el lock", async () => {
    const client = new ChangingSessionDateClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        sessionCapacity: "14",
        visualHeaderRows: false,
      }),
    );
    const executor = new MaternalyToolExecutor(client);
    const result = await executor.runNormalizedRegistration({
      serviceKey: "charla_embarazo_1_20",
      message: "Estos son todos mis datos",
      state: {
        serviceKey: "charla_embarazo_1_20",
        stage: "collecting_contact",
        selectedSessionId: "sesion_charla_bilbao_20261006",
        selectedGroupId: "grupo_charla_bilbao",
        location: "Bilbao",
        modality: "presencial",
        peopleCount: 1,
        fullName: "Ana Cambio Fecha",
        phone: "+34600992031",
        fppOrDueDate: "2027-05-04",
        updatedAt: "2026-07-17T10:00:00.000Z",
      },
      env: normalizedTestEnv({
        MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
        GOOGLE_SHEETS_ACCESS_MODE: "live",
        BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
      }),
    });

    expect(result).toMatchObject({
      status: "manual_validation_required",
      error: "charla_outside_week_1_20",
      selectedSession: { date: "2027-02-01" },
    });
    expect(client.appended).toHaveLength(0);
  });

  it("escala a revisión sin volver a listar fechas si falla la relectura de confirmación", async () => {
    const client = new FailingCommitReReadClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        visualHeaderRows: false,
      }),
    );
    const executor = new MaternalyToolExecutor(client);
    const env = normalizedTestEnv({
      MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
      GOOGLE_SHEETS_ACCESS_MODE: "live",
      BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
    });

    const result = await executor.runNormalizedRegistration({
      serviceKey: "charla_embarazo_1_20",
      message: "Estos son todos mis datos",
      state: {
        serviceKey: "charla_embarazo_1_20",
        stage: "collecting_contact",
        selectedSessionId: "sesion_charla_bilbao_20261006",
        selectedGroupId: "grupo_charla_bilbao",
        peopleCount: 1,
        fullName: "Ana Fallo Escritura",
        phone: "+34600992021",
        fppOrDueDate: "2027-03-31",
        updatedAt: "2026-07-17T10:00:00.000Z",
      },
      env,
    });

    expect(result.status).toBe("manual_validation_required");
    expect(result.error).toMatch(/synthetic_commit_reread_failure|header_not_found/);
    expect(client.appended).toHaveLength(0);
  });

  it("no muestra fechas fijas durante una caída total de Sheets y no escribe", async () => {
    const client = new FailingReadClient();
    const store = new FileConversationStore(path.join(tempDir, "conversation.json"));
    const env = normalizedTestEnv({
      LLM_PROVIDER: "mock",
      OPENAI_API_KEY: "",
      APP_BASE_URL: "https://maternaly.example.test",
    });

    await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34600992002",
        body: "Explícame la charla informativa gratuita para embarazadas",
        messageSid: "SM_CHARLA_OUTAGE_1",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34600992002",
        body: "Sí, quiero reservar mi plaza",
        messageSid: "SM_CHARLA_OUTAGE_2",
      },
      store,
      { normalizedSheetsClient: client, normalizedEnv: env },
    );
    const reply = result.botReply?.body ?? "";

    expect(reply).toMatch(/no puedo comprobar la disponibilidad/i);
    expect(reply).not.toMatch(/20 de agosto|10 de agosto|pendiente de validaci[oó]n manual/i);
    expect(client.appended).toHaveLength(0);
  });
});
