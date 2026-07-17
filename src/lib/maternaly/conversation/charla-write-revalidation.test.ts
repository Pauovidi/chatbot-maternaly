import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { MaternalyToolExecutor } from "@/lib/maternaly/conversation/core";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import { MATERNALY_CHARLA_SESSIONS } from "@/lib/maternaly/knowledge/charla-informativa-contract";
import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";
import {
  createRealTemplateWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

const SPANISH_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

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
        fppOrDueDate: "2026-12-31",
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

  it("sigue mostrando las ocho fechas del Word durante una caída total de Sheets y no escribe", async () => {
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

    for (const session of MATERNALY_CHARLA_SESSIONS) {
      const [year, month, day] = session.date.split("-");
      const monthName = SPANISH_MONTHS[Number(month) - 1];
      expect(reply).toMatch(
        new RegExp(
          `${session.date}|${Number(day)}[\\/-]${Number(month)}[\\/-]${year}|${Number(day)} de ${monthName} de ${year}`,
          "i",
        ),
      );
    }
    expect(reply).toMatch(/validaci[oó]n manual|revisi[oó]n manual|pendiente/i);
    expect(client.appended).toHaveLength(0);
  });
});
