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

    await new LlmIntentClassifier().classify("hola", {
      active_service_id: "taller_blw",
      active_service_name: "Taller BLW",
      recent_messages: [{ role: "assistant", text: "¿Quieres saber el precio o el contenido?" }],
    });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as {
      input: Array<{ role: string; content: string }>;
      text?: {
        format?: {
          type?: string;
          name?: string;
        };
      };
    };
    const system = body.input.find((entry) => entry.role === "system")?.content ?? "";
    const user = JSON.parse(body.input.find((entry) => entry.role === "user")?.content ?? "{}") as {
      current_message?: string;
      conversation_context?: {
        active_service_id?: string;
        recent_messages?: Array<{ text?: string }>;
      };
    };

    expect(system).toContain("Maternaly");
    expect(system).toContain("AIPAP");
    expect(system).toContain("service_question_focus");
    expect(system).not.toMatch(forbiddenPromptPattern);
    expect(user).toMatchObject({
      current_message: "hola",
      conversation_context: {
        active_service_id: "taller_blw",
        recent_messages: [{ text: "¿Quieres saber el precio o el contenido?" }],
      },
    });
    expect(body.text?.format).toMatchObject({
      type: "json_schema",
      name: "maternaly_structured_intent",
    });
  });

  it("reads structured output from the raw Responses API content shape", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    intent: "service_question",
                    slots: {
                      service_id: "taller_blw",
                    },
                    service_candidate: "taller_blw",
                    service_question_focus: "contents",
                    location_preference: null,
                    venue_preference: null,
                    time_preference: null,
                    pregnancy_week: null,
                    people_count: null,
                    needs_availability_lookup: false,
                    confidence: 0.94,
                    missing_fields: [],
                    should_handoff: false,
                    safety_flags: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(new LlmIntentClassifier().classify("qué incluye el BLW")).resolves.toMatchObject({
      intent: "service_question",
      service_candidate: "taller_blw",
      service_question_focus: "contents",
      confidence: 0.94,
    });
  });

  it.each([
    ["qué beneficios tiene pilates embarazo", "pilates", "benefits", undefined],
    ["Dime los horarios pilates embarazo bilbao", "pilates", "schedule", "bilbao"],
    ["desde qué semana puedo hacer pilates", "pilates", "start_week", undefined],
    ["precio pilates embarazo", "pilates", "pricing", undefined],
    ["quiero reservar pilates embarazo", "pilates", "booking", undefined],
    ["qué incluye el taller blw", "taller_blw", "contents", undefined],
    ["cuánto dura el taller blw", "taller_blw", "duration", undefined],
    ["para quién es el taller blw", "taller_blw", "eligibility", undefined],
  ])("detects service question focus for '%s'", async (message, serviceId, focus, location) => {
    const classifier = new LlmIntentClassifier();

    await expect(classifier.classify(message)).resolves.toMatchObject({
      service_candidate: serviceId,
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

  it.each([
    ["¿y qué incluye?", "taller_blw", "contents"],
    ["¿y cuánto dura?", "taller_blw", "duration"],
    ["vale, dime más", "charla_embarazo_1_20", "general"],
    ["¿y en Bilbao?", "pilates", "locations"],
  ])("resolves contextual follow-up '%s' against %s", async (message, serviceId, focus) => {
    const classifier = new LlmIntentClassifier();

    await expect(
      classifier.classify(message, {
        active_service_id: serviceId as "taller_blw" | "charla_embarazo_1_20" | "pilates",
      }),
    ).resolves.toMatchObject({
      service_candidate: serviceId,
      service_question_focus: focus,
    });
  });

  it("switches between the two active services when the user asks for the other one", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(
      classifier.classify("¿y la otra?", {
        active_service_id: "taller_blw",
      }),
    ).resolves.toMatchObject({
      service_candidate: "charla_embarazo_1_20",
      service_question_focus: "general",
    });
  });

  it("does not drag service context into a clear unrelated message", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(
      classifier.classify("Tengo una duda distinta sobre privacidad", {
        active_service_id: "taller_blw",
      }),
    ).resolves.toMatchObject({
      intent: "privacy_question",
      service_question_focus: "unknown",
    });
  });
});
