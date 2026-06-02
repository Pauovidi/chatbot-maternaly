import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmIntentClassifier, MATERNALY_OPENAI_SYSTEM_PROMPT } from "./interpreter";

const forbiddenPromptPattern =
  /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer)\b/i;

describe("Maternaly LLM interpreter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete process.env.OPENAI_API_KEY;
  });

  it("keeps OpenAI system instructions in the Maternaly domain", () => {
    expect(MATERNALY_OPENAI_SYSTEM_PROMPT).toContain("Maternaly");
    expect(MATERNALY_OPENAI_SYSTEM_PROMPT).toContain("AIPAP");
    expect(MATERNALY_OPENAI_SYSTEM_PROMPT).not.toMatch(forbiddenPromptPattern);
  });

  it("sends a Maternaly-only system prompt to OpenAI", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "greeting",
            needs_availability_lookup: false,
            confidence: 0.9,
            missing_fields: [],
            should_handoff: false,
            safety_flags: [],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await new LlmIntentClassifier().classify("hola");

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as {
      input: Array<{ role: string; content: string }>;
    };
    const system = body.input.find((entry) => entry.role === "system")?.content ?? "";

    expect(system).toContain("Maternaly");
    expect(system).toContain("AIPAP");
    expect(system).not.toMatch(forbiddenPromptPattern);
  });
});
