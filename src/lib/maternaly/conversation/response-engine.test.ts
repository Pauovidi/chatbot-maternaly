import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMaternalyWhatsAppReply,
  containsLegacyHotelKnowledge,
  ensureMaternalySafeReply,
  MATERNALY_SAFE_FALLBACK,
} from "./response-engine";

const forbiddenResponsePattern =
  /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer)\b/i;

describe("Maternaly response engine", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["hola"],
    ["buenos días"],
    ["quiero información"],
    ["quiero AIPAP"],
    ["me interesa pilates"],
    ["necesito factura"],
  ])("answers Maternaly content in mock mode for %s", async (message) => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply(message);

    expect(result.reply).toMatch(/Maternaly|Pilates|AIPAP|factura|justificante/i);
    expect(result.reply).not.toMatch(forbiddenResponsePattern);
  });

  it("blocks legacy hotel candidates with the safe Maternaly fallback", () => {
    const unsafe =
      "Puedo ayudarte con horarios, visitas, vacunas, comida y funcionamiento del hotel.";

    expect(containsLegacyHotelKnowledge(unsafe)).toBe(true);
    expect(ensureMaternalySafeReply(unsafe)).toBe(MATERNALY_SAFE_FALLBACK);
    expect(MATERNALY_SAFE_FALLBACK).not.toMatch(forbiddenResponsePattern);
  });
});
