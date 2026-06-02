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
      ["Pilates", "SM_MULTI_2"],
      ["Quiero reservar Test ADN", "SM_MULTI_3"],
      ["Bilbao", "SM_MULTI_4"],
      ["Erika Ramírez, erika@test.com", "SM_MULTI_5"],
      ["Sí", "SM_MULTI_6"],
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

    expect(results[0].message).toMatch(/Maternaly|Pilates|AIPAP/i);
    expect(results[1].message).toMatch(/Pilates|Maternaly/i);
    expect(results[2].message).toContain("08/06/2026");
    expect(results[2].message).toContain("18:20");
    expect(results[3].message).toContain("nombre y apellidos");
    expect(results[4].message).toContain("¿Quieres que deje la reserva fijada pendiente de pago?");
    expect(results[5].message).toContain("reserva fijada pendiente de pago");
    expect(results[5].message).toContain("https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh");
    expect(results[5].message).not.toMatch(FORBIDDEN_FINAL_PATTERN);
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
});
