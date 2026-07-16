import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConversationStoreForTests } from "@/lib/hotel/conversations/file-store";
import { POST } from "./route";

const LEGACY_HOTEL_PATTERN = /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer|somos\s+perros)\b/i;
const FORBIDDEN_FINAL_PATTERN = /pago confirmado|factura enviada|reserva confirmada/i;

let tempDir: string;
let storePath: string;

function extractMessage(twiml: string): string {
  return twiml.match(/<Message>([\s\S]*?)<\/Message>/)?.[1] ?? "";
}

function extractMedia(twiml: string): string[] {
  return Array.from(twiml.matchAll(/<Media>([\s\S]*?)<\/Media>/g)).map((match) => match[1]);
}

async function postTwilio(input: {
  body: string;
  sid: string;
  from?: string;
}) {
  const form = new URLSearchParams({
    From: input.from ?? "whatsapp:+34600000123",
    To: "whatsapp:+14155238886",
    Body: input.body,
    MessageSid: input.sid,
    ProfileName: "Demo Maternaly",
  });
  const response = await POST(
    new Request("https://example.test/api/twilio/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
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

    expect(reset.message).toContain("reiniciado");
    expect(reset.message).not.toContain("Disculpa, estoy revisando");
  });

  it("attaches each service poster only with its first answer", async () => {
    const first = await postTwilio({ body: "Quiero información del taller BLW", sid: "SM_MEDIA_BLW_1" });
    const second = await postTwilio({ body: "¿Cuánto cuesta el taller BLW?", sid: "SM_MEDIA_BLW_2" });

    expect(extractMedia(first.text)).toEqual([
      "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
    ]);
    expect(extractMedia(second.text)).toEqual([]);
  });

  it("lists the two active services and attaches both posters on a services question", async () => {
    const result = await postTwilio({
      body: "¿Qué servicios ofrecéis ahora?",
      sid: "SM_MEDIA_SERVICES_1",
      from: "whatsapp:+34600000999",
    });

    expect(result.message).toMatch(/charla informativa gratuita|taller presencial BLW/i);
    expect(extractMedia(result.text)).toEqual([
      "https://maternaly.example.test/maternaly/services/charla-informativa-embarazo.jpeg",
      "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
    ]);
  });
});
