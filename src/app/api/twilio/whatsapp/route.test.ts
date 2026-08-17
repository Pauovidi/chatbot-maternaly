import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConversationStore,
  resetConversationStoreForTests,
} from "@/lib/hotel/conversations/file-store";
import { MATERNALY_KNOWLEDGE_SERVICES } from "@/lib/maternaly/knowledge/catalog";
import { POST } from "./route";

const LEGACY_HOTEL_PATTERN = /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer|somos\s+perros)\b/i;
const FORBIDDEN_FINAL_PATTERN = /pago confirmado|factura enviada|reserva confirmada/i;

let tempDir: string;
let storePath: string;

function extractMessage(twiml: string): string {
  return Array.from(twiml.matchAll(/<Message>([\s\S]*?)<\/Message>/g))
    .map((match) => match[1])
    .join("\n");
}

function extractMedia(twiml: string): string[] {
  return Array.from(twiml.matchAll(/<Media>([\s\S]*?)<\/Media>/g)).map((match) => match[1]);
}

async function postTwilio(input: {
  body: string;
  sid: string;
  from?: string;
  requestUrl?: string;
  headers?: Record<string, string>;
}) {
  const form = new URLSearchParams({
    From: input.from ?? "whatsapp:+34600000123",
    To: "whatsapp:+14155238886",
    Body: input.body,
    MessageSid: input.sid,
    ProfileName: "Demo Maternaly",
  });
  const response = await POST(
    new Request(input.requestUrl ?? "https://example.test/api/twilio/whatsapp", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...input.headers,
      },
      body: form,
    }),
  );
  const text = await response.text();

  return {
    response,
    text,
    message: extractMessage(text),
  };
}

async function mediaDispatchEvents(phone = "34600000123") {
  const conversation = await getConversationStore().getByPhone(phone);
  return conversation?.events.filter((event) =>
    event.eventType.startsWith("maternaly_service_media_dispatch"),
  ) ?? [];
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "maternaly-twilio-"));
  storePath = path.join(tempDir, "conversations.json");
  vi.stubEnv("MATERNALY_CONVERSATIONS_STORE_PROVIDER", "file-local");
  vi.stubEnv("HOTEL_CONVERSATIONS_STORE_PROVIDER", "file-local");
  vi.stubEnv("HOTEL_CONVERSATIONS_STORE_PATH", storePath);
  vi.stubEnv("LLM_PROVIDER", "mock");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("TWILIO_WEBHOOK_AUTH_TOKEN", "");
  vi.stubEnv("APP_BASE_URL", "https://maternaly.example.test");
  vi.stubEnv("MATERNALY_DEMO_PAYMENT_LINK", "https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh");
  resetConversationStoreForTests();
});

afterEach(async () => {
  resetConversationStoreForTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(tempDir, { recursive: true, force: true });
});

describe("Maternaly Twilio WhatsApp route", () => {
  it("responds with non-empty safe TwiML for the full multi-turn demo", async () => {
    const inputs = [
      ["hola", "SM_MULTI_1"],
      ["Quiero apuntarme al taller BLW", "SM_MULTI_2"],
      ["Bilbao", "SM_MULTI_3"],
      [
        "Soy Erika Ramirez, telefono +34 600 000 123, email erika@example.test, 1 persona, fecha nacimiento bebé 2025-01-15",
        "SM_MULTI_4",
      ],
    ] as const;
    const results = [];

    for (const [body, sid] of inputs) {
      const result = await postTwilio({ body, sid });
      results.push(result);

      expect(result.response.status).toBe(200);
      expect(result.response.headers.get("content-type")).toContain("text/xml");
      expect(result.text).toContain("<Response>");
      expect(result.text).toContain("<Message>");
      expect(result.message.trim().length).toBeGreaterThan(0);
      expect(result.message).not.toMatch(LEGACY_HOTEL_PATTERN);
    }

    expect(results[0].message).toMatch(/Maternaly|servicio/i);
    expect(results[0].message).not.toContain("Disculpa, estoy revisando");
    expect(results[1].message).toMatch(/BLW|validar disponibilidad|equipo/i);
    expect(results[2].message).toMatch(/BLW|validar disponibilidad|equipo|solicitud/i);
    expect(results[3].message).toMatch(/solicitud|equipo|validación/i);
    expect(results[3].message).not.toMatch(FORBIDDEN_FINAL_PATTERN);
  });

  it("does not dedupe different messages with different MessageSid values", async () => {
    const first = await postTwilio({ body: "hola", sid: "SM_DEDUPE_1" });
    const second = await postTwilio({ body: "Pilates", sid: "SM_DEDUPE_2" });

    expect(first.message.trim().length).toBeGreaterThan(0);
    expect(second.message).toMatch(/Pilates|Maternaly/i);
    expect(second.text).toContain("<Message>");
  });

  it("queues the reply through the Twilio API and returns empty TwiML in live mode", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: "SM_OUTBOUND_API" }), { status: 200 }),
    );

    const result = await postTwilio({
      body: "hola",
      sid: "SM_DIRECT_DELIVERY_1",
    });
    const [url, init] = fetchMock.mock.calls[0];
    const body = init?.body as URLSearchParams;

    expect(result.response.status).toBe(200);
    expect(result.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(String(url)).toContain("/Messages.json");
    expect(body.get("To")).toBe("whatsapp:+34600000123");
    expect(body.get("Body")).toMatch(/Maternaly|asistente virtual/i);
  });

  it("queues the service notice before the poster in two ordered Twilio sends", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    const eventsSeenBeforeAccept: string[][] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        eventsSeenBeforeAccept.push(
          (await mediaDispatchEvents()).map((event) => event.eventType),
        );
        return new Response(JSON.stringify({ sid: "SM_PREFACE" }), { status: 200 });
      })
      .mockImplementationOnce(async () => {
        eventsSeenBeforeAccept.push(
          (await mediaDispatchEvents()).map((event) => event.eventType),
        );
        return new Response(JSON.stringify({ sid: "SM_POSTER" }), { status: 200 });
      });

    const result = await postTwilio({
      body: "Quiero información de la charla informativa",
      sid: "SM_DIRECT_MEDIA_SEQUENCE",
    });
    const firstBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;

    expect(result.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstBody.get("Body")).toBe(
      "Te paso la información de la charla para que sepas en qué consiste.",
    );
    expect(firstBody.get("MediaUrl")).toBeNull();
    expect(secondBody.get("Body")).toMatch(/charla informativa|embarazo/i);
    expect(secondBody.get("MediaUrl")).toBe(
      "https://maternaly.example.test/maternaly/services/charla-informativa-embarazo.jpeg",
    );
    expect(eventsSeenBeforeAccept).toEqual([
      ["maternaly_service_media_dispatch_attempted"],
      ["maternaly_service_media_dispatch_attempted"],
    ]);
    const mediaEvents = await mediaDispatchEvents();
    expect(mediaEvents.map((event) => event.eventType)).toEqual([
      "maternaly_service_media_dispatch_attempted",
      "maternaly_service_media_dispatched",
    ]);
    expect(mediaEvents[1]?.payload).toEqual(expect.objectContaining({
      deliveryState: "queued",
      transport: "twilio_rest_api",
      prefaceTransport: "twilio_rest_api",
      posterTransport: "twilio_rest_api",
    }));
  });

  it("falls back with only the poster when the notice was already delivered", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sid: "SM_PREFACE_ONLY" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("request rejected", { status: 400 }));

    const result = await postTwilio({
      body: "Quiero información de la charla informativa",
      sid: "SM_DIRECT_MEDIA_PARTIAL_FALLBACK",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text.match(/<Message>/g)).toHaveLength(1);
    expect(result.text).not.toContain("Te paso la información de la charla");
    expect(extractMedia(result.text)).toEqual([
      "https://maternaly.example.test/maternaly/services/charla-informativa-embarazo.jpeg",
    ]);
    const mediaEvents = await mediaDispatchEvents();
    expect(mediaEvents.map((event) => event.eventType)).toEqual([
      "maternaly_service_media_dispatch_attempted",
      "maternaly_service_media_dispatched",
    ]);
    expect(mediaEvents[1]?.payload).toEqual(expect.objectContaining({
      deliveryState: "queued",
      transport: "twiml",
      prefaceTransport: "twilio_rest_api",
      posterTransport: "twiml",
    }));
  });

  it("falls back to visible TwiML when direct Twilio delivery fails", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("request rejected", { status: 400 }),
    );

    const result = await postTwilio({
      body: "hola",
      sid: "SM_DIRECT_DELIVERY_FALLBACK",
    });

    expect(result.response.status).toBe(200);
    expect(result.text).toContain("<Message>");
    expect(result.message).toMatch(/Maternaly|asistente virtual/i);
  });

  it("does not duplicate a reply through TwiML when the direct POST result is ambiguous", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    const cause = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), { cause }),
    );

    const result = await postTwilio({
      body: "hola",
      sid: "SM_DIRECT_DELIVERY_AMBIGUOUS",
    });

    expect(result.response.status).toBe(200);
    expect(result.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(result.text).not.toContain("<Message>");
    const conversation = await getConversationStore().getByPhone("34600000123");
    expect(conversation).toMatchObject({
      mode: "human",
      humanRequested: true,
      requiresManualReview: true,
      maternalyReviewStatus: "manual_review_required",
    });
    expect(conversation?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "maternaly_outbound_delivery_uncertain" }),
      ]),
    );
  });

  it("does not duplicate a reply when Twilio returns an ambiguous 5xx", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("upstream failed", { status: 503 }),
    );

    const result = await postTwilio({
      body: "hola",
      sid: "SM_DIRECT_DELIVERY_AMBIGUOUS_5XX",
    });

    expect(result.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    const conversation = await getConversationStore().getByPhone("34600000123");
    expect(conversation).toMatchObject({
      mode: "human",
      requiresManualReview: true,
    });
  });

  it("uses visible TwiML when the direct POST definitely failed before sending", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    const cause = Object.assign(new Error("dns lookup failed"), { code: "ENOTFOUND" });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), { cause }),
    );

    const result = await postTwilio({
      body: "hola",
      sid: "SM_DIRECT_DELIVERY_PRESEND_FAILURE",
    });

    expect(result.response.status).toBe(200);
    expect(result.text).toContain("<Message>");
    expect(result.message).toMatch(/Maternaly|asistente virtual/i);
  });

  it("does not queue a second outbound message when Twilio retries the same SID", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886");
    vi.stubEnv("HOTEL_CONVERSATIONS_MOCK_TWILIO", "false");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM_OUTBOUND_ONCE" }), { status: 200 }),
    );

    const first = await postTwilio({
      body: "hola",
      sid: "SM_DIRECT_DELIVERY_DEDUPE",
    });
    const duplicate = await postTwilio({
      body: "hola",
      sid: "SM_DIRECT_DELIVERY_DEDUPE",
    });

    expect(first.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(duplicate.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns fallback TwiML instead of silence when the store fails on a later message", async () => {
    await postTwilio({ body: "hola", sid: "SM_STORE_1" });
    await writeFile(storePath, "{not valid json", "utf8");

    const second = await postTwilio({ body: "Pilates", sid: "SM_STORE_2" });

    expect(second.response.status).toBe(200);
    expect(second.response.headers.get("content-type")).toContain("text/xml");
    expect(second.text).toContain("<Message>");
    expect(second.message).toContain("Maternaly");
    expect(second.message).not.toMatch(LEGACY_HOTEL_PATTERN);
  });

  it("returns empty valid TwiML in human mode", async () => {
    await postTwilio({ body: "Quiero hablar con una persona", sid: "SM_HUMAN_1" });
    const second = await postTwilio({ body: "¿Hay alguien?", sid: "SM_HUMAN_2" });

    expect(second.response.status).toBe(200);
    expect(second.text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  it("reset leaves human mode and answers naturally", async () => {
    await postTwilio({ body: "Quiero hablar con una persona", sid: "SM_RESET_1" });
    const reset = await postTwilio({ body: "reiniciar", sid: "SM_RESET_2" });

    expect(reset.message).toMatch(/reiniciad[ao]/i);
    expect(reset.message).not.toContain("Disculpa, estoy revisando");
  });

  it("reproduces reset, greeting, BLW information and global online discovery correctly", async () => {
    await postTwilio({ body: "taller blw", sid: "SM_REGRESSION_BLW_1" });
    const firstReset = await postTwilio({ body: "reiniciar", sid: "SM_REGRESSION_RESET_1" });
    const secondReset = await postTwilio({ body: "reiniciar", sid: "SM_REGRESSION_RESET_2" });
    const greeting = await postTwilio({ body: "buenos días", sid: "SM_REGRESSION_GREETING" });

    for (const reset of [firstReset, secondReset]) {
      expect(reset.message).toMatch(/conversaci[oó]n reiniciada|empezamos desde cero/i);
      expect(reset.message).not.toMatch(/repetitiva|otra manera|otro [aá]ngulo|misma respuesta/i);
    }
    expect(greeting.message).toMatch(/Buenos d[ií]as|Encantada de leerte/i);
    expect(greeting.message).not.toMatch(/BLW|17:00|plazas|fechas/i);

    const secondBlw = await postTwilio({ body: "taller blw", sid: "SM_REGRESSION_BLW_2" });
    expect(extractMedia(secondBlw.text)).toEqual([
      "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
    ]);
    const online = await postTwilio({
      body: "¿y tenéis algún taller online?",
      sid: "SM_REGRESSION_ONLINE",
    });

    expect(online.message).toMatch(/opci[oó]n online.*charla informativa|charla informativa.*online/i);
    expect(online.message).not.toMatch(/^El taller BLW no tiene|te cuento c[oó]mo es el BLW/i);
    expect(online.message).not.toMatch(/me faltan|email|fecha de nacimiento del beb[eé]/i);
    expect(extractMedia(online.text)).toEqual([]);

    const thanks = await postTwilio({ body: "gracias", sid: "SM_REGRESSION_THANKS" });
    expect(thanks.message).not.toMatch(/Taller BLW|17:00|plazas disponibles/i);
  });

  it("attaches each service poster only with its first answer", async () => {
    const first = await postTwilio({ body: "Quiero información del taller BLW", sid: "SM_MEDIA_BLW_1" });
    const second = await postTwilio({ body: "¿Cuánto cuesta el taller BLW?", sid: "SM_MEDIA_BLW_2" });

    expect(extractMedia(first.text)).toEqual([
      "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
    ]);
    expect(first.text.match(/<Message>/g)).toHaveLength(2);
    expect(first.text.indexOf("Te paso la información del taller BLW")).toBeLessThan(
      first.text.indexOf("<Media>"),
    );
    expect(extractMedia(second.text)).toEqual([]);
  });

  it("lists every service and sends the BLW poster after the user selects BLW", async () => {
    const result = await postTwilio({
      body: "¿Qué servicios ofrecéis ahora?",
      sid: "SM_MEDIA_SERVICES_1",
      from: "whatsapp:+34600000999",
    });

    for (const service of MATERNALY_KNOWLEDGE_SERVICES) {
      expect(result.message).toContain(service.name);
    }
    expect(extractMedia(result.text)).toEqual([]);

    const blw = await postTwilio({
      body: "¿No tenéis taller BLW?",
      sid: "SM_MEDIA_SERVICES_BLW_2",
      from: "whatsapp:+34600000999",
    });
    expect(extractMedia(blw.text)).toEqual([
      "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
    ]);
  });

  it("builds the poster URL from the public webhook origin when APP_BASE_URL is absent", async () => {
    vi.stubEnv("APP_BASE_URL", "");
    const result = await postTwilio({
      body: "Quiero información del taller BLW",
      sid: "SM_MEDIA_ORIGIN_FALLBACK",
      from: "whatsapp:+34600000888",
      requestUrl: "https://maternaly-public.example.test/api/twilio/whatsapp",
    });

    expect(extractMedia(result.text)).toEqual([
      "https://maternaly-public.example.test/maternaly/services/taller-blw.jpeg",
    ]);
  });

  it("uses the forwarded public origin when the configured base URL is invalid", async () => {
    vi.stubEnv("APP_BASE_URL", "internal-service-without-a-scheme");
    const result = await postTwilio({
      body: "Quiero información del taller BLW",
      sid: "SM_MEDIA_FORWARDED_ORIGIN",
      from: "whatsapp:+34600000889",
      requestUrl: "http://maternaly-chatbot:3000/api/twilio/whatsapp",
      headers: {
        "x-forwarded-host": "maternaly-public.example.test",
        "x-forwarded-proto": "https",
      },
    });

    expect(extractMedia(result.text)).toEqual([
      "https://maternaly-public.example.test/maternaly/services/taller-blw.jpeg",
    ]);
  });
});
