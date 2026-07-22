import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

describe("Charla: agenda leída exclusivamente de Sheets", () => {
  let tempDir = "";

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00.000Z"));
    tempDir = await mkdtemp(path.join(os.tmpdir(), "maternaly-charla-sheets-only-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  async function requestCharlaAvailability(workbook: Record<string, unknown[][]>) {
    const store = new FileConversationStore(path.join(tempDir, "conversation.json"));
    const client = new InMemoryNormalizedSheetsClient(workbook);
    return handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34600991001",
        body: "¿Qué citas hay disponibles para la charla informativa?",
        messageSid: "SM_CHARLA_SHEETS_ONLY",
      },
      store,
      {
        normalizedSheetsClient: client,
        normalizedEnv: normalizedTestEnv({ LLM_PROVIDER: "mock", OPENAI_API_KEY: "" }),
      },
    );
  }

  it("muestra solo las sesiones realmente leídas de la agenda vinculada", async () => {
    const result = await requestCharlaAvailability(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        visualHeaderRows: false,
      }),
    );
    const reply = result.botReply?.body ?? "";

    expect(reply).toMatch(/6 de octubre de 2026/i);
    expect(reply).not.toMatch(/20 de agosto|10 de agosto|pendiente de validaci[oó]n manual/i);
    expect(result.conversation.events).toContainEqual(
      expect.objectContaining({
        eventType: "maternaly_availability_checked",
        payload: expect.objectContaining({ sessionsCount: 1 }),
      }),
    );
  });

  it("no inventa fechas contractuales cuando la agenda no contiene sesiones", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      visualHeaderRows: false,
    });
    workbook.Sesiones = workbook.Sesiones.slice(0, 1);

    const result = await requestCharlaAvailability(workbook);
    const reply = result.botReply?.body ?? "";

    expect(reply).toMatch(/no veo sesiones disponibles/i);
    expect(reply).not.toMatch(/20 de agosto|10 de agosto|pendiente de validaci[oó]n manual/i);
  });
});
