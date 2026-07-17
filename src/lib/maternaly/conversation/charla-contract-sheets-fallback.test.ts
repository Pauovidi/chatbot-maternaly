import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import { MATERNALY_CHARLA_SESSIONS } from "@/lib/maternaly/knowledge/charla-informativa-contract";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

const CHARLA_SERVICE_ID = "charla_embarazo_1_20";
const SPARSE_SHEET_SESSION_ID = "sesion_charla_bilbao_20261006";

const spanishMonths = [
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function datePattern(isoDate: string): RegExp {
  const [year, month, day] = isoDate.split("-");
  const monthName = spanishMonths[Number(month) - 1];
  return new RegExp(
    `${isoDate}|${day}[\\/-]${month}[\\/-]${year}|${Number(day)} de ${monthName}`,
    "i",
  );
}

function pendingDatePattern(isoDate: string): RegExp {
  const date = datePattern(isoDate).source;
  const pending = "(?:pendiente|validaci[oó]n manual|revisi[oó]n manual)";
  return new RegExp(
    `(?:${date})[\\s\\S]{0,100}${pending}|${pending}[\\s\\S]{0,100}(?:${date})`,
    "i",
  );
}

function latestEventPayload(
  events: Array<{ eventType: string; payload?: unknown }>,
  eventType: string,
): Record<string, unknown> | undefined {
  const event = [...events].reverse().find((candidate) => candidate.eventType === eventType);
  return isRecord(event?.payload) ? event.payload : undefined;
}

/**
 * Deliberadamente deja una sola convocatoria real en Sheets. El calendario del
 * Word debe seguir siendo la autoridad visible; Sheets únicamente decide qué
 * convocatoria tiene capacidad/registro automático y cuál requiere revisión.
 */
function createSparseCharlaWorkbook(options: { sessionCapacity?: string } = {}): Record<string, unknown[][]> {
  return createRealTemplateWorkbook({
    serviceKey: CHARLA_SERVICE_ID,
    visualHeaderRows: false,
    sessionCapacity: options.sessionCapacity,
  });
}

describe("Charla: calendario contractual con respaldo parcial de Sheets", () => {
  let tempDir = "";
  let harnessSequence = 0;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00.000Z"));
    tempDir = await mkdtemp(path.join(os.tmpdir(), "maternaly-charla-contract-fallback-"));
    harnessSequence = 0;
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeHarness(options: {
    liveWrite?: boolean;
    from?: string;
    sessionCapacity?: string;
  } = {}) {
    const sequence = ++harnessSequence;
    const store = new FileConversationStore(path.join(tempDir, `conversation-${sequence}.json`));
    const client = new InMemoryNormalizedSheetsClient(
      createSparseCharlaWorkbook({ sessionCapacity: options.sessionCapacity }),
    );
    const env = normalizedTestEnv({
      LLM_PROVIDER: "mock",
      OPENAI_API_KEY: "",
      APP_BASE_URL: "https://maternaly.example.test",
      ...(options.liveWrite
        ? {
            MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
            GOOGLE_SHEETS_ACCESS_MODE: "live",
            BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
          }
        : {}),
    });
    const from = options.from ?? `whatsapp:+34600991${String(sequence).padStart(3, "0")}`;
    let turn = 0;

    return {
      client,
      async send(body: string) {
        turn += 1;
        return handleInboundMaternalyWhatsApp(
          {
            from,
            body,
            messageSid: `SM_CHARLA_CONTRACT_FALLBACK_${sequence}_${turn}`,
          },
          store,
          { normalizedSheetsClient: client, normalizedEnv: env },
        );
      },
    };
  }

  async function requestContractCalendar(harness: ReturnType<typeof makeHarness>) {
    await harness.send("Explícame la charla informativa gratuita de las primeras veinte semanas");
    return harness.send("Sí, quiero reservar mi plaza");
  }

  it("muestra siempre las ocho sesiones del Word aunque Sheets solo respalde una", async () => {
    const harness = makeHarness();

    const result = await requestContractCalendar(harness);
    const reply = result.botReply?.body ?? "";

    expect(latestEventPayload(result.conversation.events, "maternaly_availability_checked")).toMatchObject({
      ok: true,
      serviceKey: CHARLA_SERVICE_ID,
      sessionsCount: 1,
    });
    const missingDates = MATERNALY_CHARLA_SESSIONS.filter(
      (session) => !datePattern(session.date).test(reply),
    ).map((session) => session.date);
    const unmarkedContractOnlyDates = MATERNALY_CHARLA_SESSIONS.filter(
      (session) => session.date !== "2026-10-06",
    )
      .filter((session) => !pendingDatePattern(session.date).test(reply))
      .map((session) => session.date);

    expect.soft(missingDates).toEqual([]);
    expect.soft(unmarkedContractOnlyDates).toEqual([]);
  });

  it("nunca registra automáticamente una fecha contractual sin fila real en Sheets", async () => {
    const harness = makeHarness({ liveWrite: true, from: "whatsapp:+34600991001" });
    await requestContractCalendar(harness);
    await harness.send("Online, 10 de agosto");
    await harness.send("Irá una persona");

    const result = await harness.send(
      "Soy Ana Prueba Manual, teléfono +34 600 991 001, FPP 31/12/2026",
    );
    const reply = result.botReply?.body ?? "";

    expect(harness.client.appended).toHaveLength(0);
    expect(reply).toMatch(/pendiente de validaci[oó]n|validaci[oó]n manual|revisi[oó]n manual|revisar[aá] el equipo/i);
    expect(reply).not.toMatch(/plaza confirmada|reserva confirmada/i);
  });

  it("descarta Bilbao si después la usuaria cambia explícitamente a una fecha contractual sin fila", async () => {
    const harness = makeHarness({ liveWrite: true, from: "whatsapp:+34600991003" });
    await requestContractCalendar(harness);
    await harness.send("Bilbao, 6 de octubre");

    const changed = await harness.send(
      "He cambiado de idea: prefiero online el 10 de agosto",
    );
    const changedSessionId =
      changed.conversation.maternalyNormalizedFlow?.selectedSessionId ?? "";

    expect(changedSessionId).not.toBe(SPARSE_SHEET_SESSION_ID);
    expect(changedSessionId).toMatch(/contract|manual|pending/i);
    expect(changedSessionId).toContain("2026-08-10");

    await harness.send("Irá una persona");
    const completed = await harness.send(
      "Soy Carla Cambio Online, teléfono +34 600 991 003, FPP 31/12/2026",
    );
    const reply = completed.botReply?.body ?? "";

    expect(harness.client.appended).toHaveLength(0);
    expect(completed.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe(
      changedSessionId,
    );
    expect(completed.conversation.maternalyNormalizedFlow?.selectedSessionId).not.toBe(
      SPARSE_SHEET_SESSION_ID,
    );
    expect(reply).toMatch(/pendiente de validaci[oó]n|validaci[oó]n manual|revisi[oó]n manual|revisar[aá] el equipo/i);
    expect(reply).not.toMatch(/plaza confirmada|reserva confirmada/i);
  });

  it("al cambiar solo de Bilbao a online borra la sesión incompatible y espera una fecha", async () => {
    const harness = makeHarness({ liveWrite: true, from: "whatsapp:+34600991004" });
    await requestContractCalendar(harness);
    const bilbao = await harness.send("Bilbao, 6 de octubre");
    expect(bilbao.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe(
      SPARSE_SHEET_SESSION_ID,
    );

    const changed = await harness.send("He cambiado de idea: prefiero online");
    expect(changed.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "choosing_session",
      location: "online",
      modality: "online",
    });
    expect(changed.conversation.maternalyNormalizedFlow?.selectedSessionId).toBeUndefined();
    expect(changed.conversation.maternalyNormalizedFlow?.selectedGroupId).toBeUndefined();
    expect(changed.botReply?.body).toMatch(/Online[\s\S]*(10 de agosto|7 de septiembre|5 de octubre)/i);

    const attendees = await harness.send("Irá una persona");
    expect(attendees.conversation.maternalyNormalizedFlow?.selectedSessionId).toBeUndefined();
    expect(attendees.conversation.maternalyNormalizedFlow?.selectedGroupId).toBeUndefined();
    expect(attendees.conversation.maternalyNormalizedFlow?.stage).toBe("choosing_session");
    expect(harness.client.appended).toHaveLength(0);
  });

  it("resuelve el ordinal sobre las ocho opciones globales aunque Bilbao sea la preferencia", async () => {
    const harness = makeHarness({ liveWrite: true, from: "whatsapp:+34600991005" });
    await requestContractCalendar(harness);

    const preferred = await harness.send("Bilbao");
    expect(preferred.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "choosing_session",
      location: "bilbao",
    });
    expect(preferred.conversation.maternalyNormalizedFlow?.selectedSessionId).toBeUndefined();
    expect(preferred.botReply?.body).toMatch(/1\.\s*20 de agosto/i);

    const selected = await harness.send("1");
    expect(selected.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "collecting_contact",
      location: "Erandio",
      modality: "presencial",
    });
    expect(selected.conversation.maternalyNormalizedFlow?.selectedSessionId).toContain(
      "contract-pending:erandio:2026-08-20:18:30",
    );
    expect(selected.conversation.maternalyNormalizedFlow?.selectedSessionId).not.toBe(
      SPARSE_SHEET_SESSION_ID,
    );
    expect(selected.botReply?.body).toMatch(/acudir[eé]is una o dos personas/i);
    expect(harness.client.appended).toHaveLength(0);
  });

  it("no desplaza el ordinal cuando la cuarta opción visible está llena", async () => {
    const harness = makeHarness({
      liveWrite: true,
      from: "whatsapp:+34600991006",
      sessionCapacity: "0",
    });
    const calendar = await requestContractCalendar(harness);
    expect(calendar.botReply?.body).toMatch(
      /4\.\s*6 de octubre[\s\S]{0,80}sin plazas libres/i,
    );

    const rejected = await harness.send("4");
    expect(rejected.conversation.maternalyNormalizedFlow?.selectedSessionId).toBeUndefined();
    expect(rejected.conversation.maternalyNormalizedFlow?.selectedGroupId).toBeUndefined();
    expect(rejected.conversation.maternalyNormalizedFlow?.stage).toBe("choosing_session");
    expect(rejected.botReply?.body).toMatch(
      /4\.\s*6 de octubre[\s\S]{0,80}sin plazas libres/i,
    );
    expect(rejected.botReply?.body).not.toMatch(/15 de diciembre[\s\S]{0,120}acudir[eé]is/i);
    expect(harness.client.appended).toHaveLength(0);
  });

  it("mantiene la sesión elegida cuando una FPP coincide con otra convocatoria", async () => {
    const harness = makeHarness({ liveWrite: true, from: "whatsapp:+34600991007" });
    await requestContractCalendar(harness);
    const selected = await harness.send("Online, 10 de agosto");
    const augustSessionId = selected.conversation.maternalyNormalizedFlow?.selectedSessionId;
    expect(augustSessionId).toContain("contract-pending:online:2026-08-10:19:00");
    await harness.send("Irá una persona");

    const fpp = await harness.send("Mi FPP es 07/09/2026");
    expect(fpp.conversation.maternalyNormalizedFlow?.fppOrDueDate).toBe("07/09/2026");
    expect(fpp.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe(augustSessionId);
    expect(fpp.conversation.maternalyNormalizedFlow?.selectedSessionId).not.toContain(
      "2026-09-07",
    );
    expect(harness.client.appended).toHaveLength(0);
  });

  it("mantiene el registro por Sheets para la única sesión que sí está respaldada", async () => {
    const harness = makeHarness({ liveWrite: true, from: "whatsapp:+34600991002" });
    await requestContractCalendar(harness);
    await harness.send("Bilbao, 6 de octubre");
    await harness.send("Irá una persona");

    const result = await harness.send(
      "Soy Bea Prueba Sheets, teléfono +34 600 991 002, FPP 31/12/2026",
    );

    expect(result.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe(
      SPARSE_SHEET_SESSION_ID,
    );
    expect(harness.client.appended.length).toBeGreaterThan(0);
    expect(latestEventPayload(result.conversation.events, "maternaly_tool_executed")).toMatchObject({
      status: "write_result",
      applied: true,
      mode: "live",
    });
  });
});
