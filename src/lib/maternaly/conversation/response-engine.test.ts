import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMaternalyWhatsAppReply,
  containsLegacyHotelKnowledge,
  ensureMaternalySafeReply,
  MATERNALY_SAFE_FALLBACK,
} from "./response-engine";

const forbiddenResponsePattern =
  /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer)\b/i;
const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const clinicalClosing =
  "Si el sangrado, el dolor o cualquier síntoma importante empeora, mi recomendación es que contactes lo antes posible con tu médico o acudas a urgencias.";

function countEmojis(text: string): number {
  return Array.from(text.matchAll(emojiPattern)).length;
}

describe("Maternaly response engine", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["hola"],
    ["buenas noches"],
    ["buenos días"],
    ["quiero información"],
    ["quiero AIPAP"],
    ["me interesa pilates"],
    ["Quiero apuntarme al taller BLW"],
    ["necesito factura"],
    ["reiniciar"],
  ])("answers Maternaly content in mock mode for %s", async (message) => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply(message);

    expect(result.reply).toMatch(/Maternaly|Pilates|AIPAP|factura|justificante|BLW|reiniciad[ao]|hola|buenos|buenas|ayudarte/i);
    expect(result.reply).not.toContain("Disculpa, estoy revisando");
    expect(result.reply).not.toMatch(forbiddenResponsePattern);
  });

  it("blocks legacy hotel candidates with the safe Maternaly fallback", () => {
    const unsafe =
      "Puedo ayudarte con horarios, visitas, vacunas, comida y funcionamiento del hotel.";

    expect(containsLegacyHotelKnowledge(unsafe)).toBe(true);
    expect(ensureMaternalySafeReply(unsafe)).toBe(MATERNALY_SAFE_FALLBACK);
    expect(MATERNALY_SAFE_FALLBACK).not.toMatch(forbiddenResponsePattern);
  });

  it("answers Pilates benefits with warm controlled copy and real knowledge", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("qué beneficios tiene pilates embarazo");

    expect(result.intent.service_question_focus).toBe("benefits");
    expect(result.reply).toMatch(/acompañada|cuidaros|bienestar/i);
    expect(result.reply).toMatch(/tono muscular|fuerza|resistencia/i);
    expect(result.reply).toMatch(/circulaci[oó]n|postura|suelo p[eé]lvico/i);
    expect(result.reply).not.toMatch(/lunes 10:00-11:00|59 €\/mes/i);
    expect(result.reply).not.toMatch(forbiddenResponsePattern);
    expect(countEmojis(result.reply)).toBeLessThanOrEqual(2);
  });

  it("answers Bilbao Pilates schedules", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("horarios pilates embarazo bilbao");

    expect(result.intent.service_question_focus).toBe("schedule");
    expect(result.intent.location_preference).toBe("bilbao");
    expect(result.reply).toContain("Bilbao");
    expect(result.reply).toMatch(/lunes 10:00-11:00/i);
    expect(result.reply).toMatch(/lunes 18:15-19:15/i);
    expect(result.reply).toMatch(/mi[eé]rcoles 17:00-18:00/i);
    expect(result.reply).toMatch(/mi[eé]rcoles 18:15-19:15/i);
    expect(result.reply).not.toContain("Erandio");
    expect(countEmojis(result.reply)).toBeLessThanOrEqual(2);
  });

  it("answers Erandio Pilates schedules", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("pilates embarazo erandio");

    expect(result.intent.service_question_focus).toBe("locations");
    expect(result.reply).toContain("Erandio");
    expect(result.reply).toMatch(/Bilbao|sede|sedes/i);
    expect(countEmojis(result.reply)).toBeLessThanOrEqual(2);
  });

  it("answers Erandio Pilates schedules without Bilbao when schedule focus includes Erandio", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("horarios pilates embarazo erandio");

    expect(result.intent.service_question_focus).toBe("schedule");
    expect(result.intent.location_preference).toBe("erandio");
    expect(result.reply).toContain("Erandio");
    expect(result.reply).toMatch(/martes 17:30-18:30/i);
    expect(result.reply).toMatch(/jueves 10:00-11:00/i);
    expect(result.reply).toMatch(/jueves 17:30-18:30/i);
    expect(result.reply).not.toContain("Bilbao");
    expect(countEmojis(result.reply)).toBeLessThanOrEqual(2);
  });

  it("answers Pilates start week and continuity through pregnancy", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("desde qué semana puedo hacer pilates embarazo");

    expect(result.intent.service_question_focus).toBe("start_week");
    expect(result.reply).toMatch(/semana 14/i);
    expect(result.reply).toMatch(/final de la gestaci[oó]n/i);
    expect(result.reply).not.toMatch(/lunes 10:00-11:00|59 €\/mes|tono muscular/i);
    expect(countEmojis(result.reply)).toBeLessThanOrEqual(2);
  });

  it("answers Pilates prices", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("precio pilates embarazo");

    expect(result.intent.service_question_focus).toBe("pricing");
    expect(result.reply).toContain("59 €/mes");
    expect(result.reply).toContain("99 €/mes");
    expect(result.reply).toMatch(/1 clase\/semana|2 clases\/semana/i);
    expect(result.reply).not.toMatch(/lunes 10:00-11:00|martes 17:30-18:30/i);
    expect(countEmojis(result.reply)).toBeLessThanOrEqual(2);
  });

  it("answers Pilates booking focus without claiming automatic reservation", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("quiero reservar pilates embarazo");

    expect(result.intent.service_question_focus).toBe("booking");
    expect(result.reply).toMatch(/agenda autom[aá]tica|no te confirmo plaza/i);
    expect(result.reply).toMatch(/equipo de Maternaly revise disponibilidad/i);
    expect(result.reply).not.toMatch(/plaza confirmada|pago confirmado/i);
    expect(countEmojis(result.reply)).toBeLessThanOrEqual(2);
  });

  it("derives strong clinical symptoms to a professional without diagnosis or playful emoji", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply(
      "tengo dolor fuerte y sangrado después de pilates embarazo",
    );

    expect(result.intent.should_handoff).toBe(true);
    expect(result.intent.service_question_focus).toBe("clinical_risk");
    expect(result.intent.safety_flags).toContain("clinical_or_diagnostic_escalation");
    expect(result.reply).toMatch(/profesional|equipo de Maternaly/i);
    expect(result.reply).toMatch(/No puedo hacer diagn[oó]stico/i);
    expect(result.reply).toContain(clinicalClosing);
    expect(result.reply).not.toContain("no esperes a la respuesta del bot");
    expect(result.reply).not.toContain("continúa o te preocupa");
    expect(result.reply).not.toMatch(/lo dejo preparado/i);
    expect(result.reply).not.toMatch(/beneficios|precio|horarios/i);
    expect(countEmojis(result.reply)).toBe(0);
  });

  it("answers a bare price question safely when no service context exists", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("precio");

    expect(result.intent.service_question_focus).toBe("pricing");
    expect(result.reply).toMatch(/charlas de embarazo|taller BLW|Pilates|Maternaly/i);
    expect(result.reply).not.toContain("59 €/mes");
    expect(result.reply).not.toContain("99 €/mes");
    expect(result.reply).not.toContain("45 €/persona");
    expect(result.reply).not.toContain("75 €/pareja");
  });
});
