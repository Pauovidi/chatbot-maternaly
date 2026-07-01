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
            service_question_focus: "general",
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
    expect(system).toContain("service_question_focus");
    expect(system).not.toMatch(forbiddenPromptPattern);
  });

  it.each([
    ["qué beneficios tiene pilates embarazo", "benefits", undefined],
    ["Dime los horarios pilates embarazo bilbao", "schedule", "bilbao"],
    ["desde qué semana puedo hacer pilates", "start_week", undefined],
    ["precio pilates embarazo", "pricing", undefined],
    ["quiero reservar pilates embarazo", "booking", undefined],
  ])("detects service question focus for '%s'", async (message, focus, location) => {
    const classifier = new LlmIntentClassifier();

    await expect(classifier.classify(message)).resolves.toMatchObject({
      service_candidate: "pilates",
      service_question_focus: focus,
      location_preference: location,
    });
  });

  it("marks cancellations, rescheduling and invoice/payment requests for human handoff", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(classifier.classify("quiero cancelar mi inscripción")).resolves.toMatchObject({
      should_handoff: true,
      safety_flags: expect.arrayContaining(["handoff_cancel_or_reschedule"]),
    });
    await expect(classifier.classify("quiero cambiar la fecha")).resolves.toMatchObject({
      should_handoff: true,
      safety_flags: expect.arrayContaining(["handoff_cancel_or_reschedule"]),
    });
    await expect(classifier.classify("necesito factura")).resolves.toMatchObject({
      should_handoff: true,
      safety_flags: expect.arrayContaining(["handoff_payment_or_invoice"]),
    });
  });

  it("marks strong clinical warning signs for handoff even on informational activities", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(
      classifier.classify("tengo dolor fuerte y sangrado, puedo hacer pilates embarazo"),
    ).resolves.toMatchObject({
      service_candidate: "pilates",
      service_question_focus: "clinical_risk",
      should_handoff: true,
      safety_flags: expect.arrayContaining(["clinical_or_diagnostic_escalation"]),
    });
  });

  it("marks clinical risk without needing a service mention", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(classifier.classify("tengo dolor fuerte y sangrado")).resolves.toMatchObject({
      service_question_focus: "clinical_risk",
      should_handoff: true,
      safety_flags: expect.arrayContaining(["clinical_or_diagnostic_escalation"]),
    });
  });
});
