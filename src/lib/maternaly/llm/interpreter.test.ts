import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmIntentClassifier, MATERNALY_OPENAI_SYSTEM_PROMPT } from "./interpreter";

const forbiddenPromptPattern =
  /\b(?:hotel|perros|canino|vacunas|comida|visitas|residencia|qu[eé]\s+traer)\b/i;

describe("Maternaly LLM interpreter", () => {
  it("marks an explicit cancellation for the safe registration tool", async () => {
    const result = await new LlmIntentClassifier().classify(
      "Quiero cancelar mi inscripción a la charla",
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
    );

    expect(result.safety_flags).toContain("cancel_registration_request");
    expect(result.safety_flags).toContain("handoff_cancel_or_reschedule");
  });

  it("does not cancel or hand off a negated cancellation request", async () => {
    const result = await new LlmIntentClassifier().classify(
      "No quiero cancelar mi inscripción",
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
    );

    expect(result.safety_flags).not.toContain("cancel_registration_request");
    expect(result.safety_flags).not.toContain("handoff_cancel_or_reschedule");
    expect(result.should_handoff).toBe(false);
  });

  it("overrides an OpenAI cancellation guess when the user explicitly negates it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "handoff_request",
            slots: {},
            service_question_focus: "unknown",
            needs_availability_lookup: false,
            confidence: 0.99,
            missing_fields: [],
            should_handoff: true,
            safety_flags: ["cancel_registration_request", "handoff_cancel_or_reschedule"],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await new LlmIntentClassifier().classify(
      "No quiero cancelar mi inscripción",
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-key" } as NodeJS.ProcessEnv,
    );

    expect(result.classification_source).toBe("deterministic_override");
    expect(result.safety_flags).not.toContain("cancel_registration_request");
    expect(result.safety_flags).not.toContain("handoff_cancel_or_reschedule");
    expect(result.should_handoff).toBe(false);
  });

  it.each([
    "¿cómo puedo cancelar?",
    "¿Cómo me doy de baja?",
    "¿qué pasa si quiero cancelar mi inscripción?",
    "¿se puede anular una inscripción?",
    "Si quisiera cancelar, ¿qué tendría que hacer?",
    "En caso de que tuviera que cancelarla, ¿cómo sería el proceso?",
    "Si quisiera borrar mi inscripción, ¿cómo tendría que hacerlo?",
    "No me doy de baja",
    "No quiero borrar mi inscripción",
  ])("keeps the procedural cancellation question '%s' informational", async (message) => {
    const result = await new LlmIntentClassifier().classify(
      message,
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
    );

    expect(result.safety_flags).not.toContain("cancel_registration_request");
    expect(result.safety_flags).not.toContain("handoff_cancel_or_reschedule");
    expect(result.should_handoff).toBe(false);
  });

  it.each(["Cancélame la inscripción", "Quiero cancelarla", "Quiero anularla"])(
    "keeps the explicit pronominal cancellation '%s' destructive",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(
        message,
        { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
        { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
      );

      expect(result.safety_flags).toContain("cancel_registration_request");
      expect(result.safety_flags).toContain("handoff_cancel_or_reschedule");
      expect(result.should_handoff).toBe(true);
    },
  );

  it.each([
    "Me doy de baja",
    "Dame de baja de la charla",
    "Borra mi inscripción",
    "Quita mi reserva",
    "Ya no quiero la plaza",
    "No voy a asistir, libera mi plaza",
    "No puedo asistir",
    "Finalmente no podré ir",
    "No voy a poder acudir",
    "No voy a ir",
  ])("recognizes the habitual cancellation request '%s'", async (message) => {
    const result = await new LlmIntentClassifier().classify(
      message,
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
    );

    expect(result.safety_flags).toContain("cancel_registration_request");
    expect(result.safety_flags).toContain("handoff_cancel_or_reschedule");
    expect(result.should_handoff).toBe(true);
  });

  it("routes an ambiguous attendance problem to handoff without cancelling automatically", async () => {
    const result = await new LlmIntentClassifier().classify(
      "Me viene mal la cita",
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
    );

    expect(result.safety_flags).not.toContain("cancel_registration_request");
    expect(result.safety_flags).toContain("handoff_cancel_or_reschedule");
    expect(result.should_handoff).toBe(true);
  });

  it.each(["¿Qué pasa si no puedo asistir?", "No es que no pueda asistir; sí voy a ir"])(
    "does not cancel for the non-destructive attendance wording '%s'",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(
        message,
        { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
        { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
      );

      expect(result.safety_flags).not.toContain("cancel_registration_request");
    },
  );

  it.each([
    "Me doy de baja de los mensajes, pero mantengo mi plaza",
    "Dame de baja de las comunicaciones",
    "Quiero la baja del newsletter, no de la cita",
  ])("does not cancel a registration for the communications opt-out '%s'", async (message) => {
    const result = await new LlmIntentClassifier().classify(
      message,
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
    );

    expect(result.safety_flags).not.toContain("cancel_registration_request");
    expect(result.intent).not.toBe("registration_start");
  });

  it.each([
    "¿Está confirmada mi reserva?",
    "Quería comprobar el estado de mi reserva",
    "¿Mi plaza sigue confirmada?",
  ])("classifies the reservation-status question '%s' as read-only", async (message) => {
    const result = await new LlmIntentClassifier().classify(
      message,
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "mock" } as NodeJS.ProcessEnv,
    );

    expect(result.intent).toBe("registration_status_query");
    expect(result.needs_availability_lookup).toBe(false);
    expect(result.safety_flags).not.toContain("cancel_registration_request");
  });

  it("overrides an OpenAI cancellation guess for a communications opt-out", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "handoff_request",
            slots: {},
            service_question_focus: "unknown",
            needs_availability_lookup: false,
            confidence: 0.99,
            missing_fields: [],
            should_handoff: true,
            safety_flags: ["cancel_registration_request", "handoff_cancel_or_reschedule"],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await new LlmIntentClassifier().classify(
      "Dame de baja de las comunicaciones, mantengo mi plaza",
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-key" } as NodeJS.ProcessEnv,
    );

    expect(result.classification_source).toBe("deterministic_override");
    expect(result.safety_flags).not.toContain("cancel_registration_request");
  });

  it("overrides an OpenAI destructive guess for a procedural cancellation question", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "handoff_request",
            slots: {},
            service_question_focus: "unknown",
            needs_availability_lookup: false,
            confidence: 0.99,
            missing_fields: [],
            should_handoff: true,
            safety_flags: ["cancel_registration_request", "handoff_cancel_or_reschedule"],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await new LlmIntentClassifier().classify(
      "¿cómo puedo cancelar?",
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-key" } as NodeJS.ProcessEnv,
    );

    expect(result.classification_source).toBe("deterministic_override");
    expect(result.safety_flags).not.toContain("cancel_registration_request");
    expect(result.should_handoff).toBe(false);
  });

  it("overrides OpenAI for a conditional cancellation question", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "handoff_request",
            slots: {},
            service_question_focus: "unknown",
            needs_availability_lookup: false,
            confidence: 0.99,
            missing_fields: [],
            should_handoff: true,
            safety_flags: ["cancel_registration_request", "handoff_cancel_or_reschedule"],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await new LlmIntentClassifier().classify(
      "Si quisiera cancelar, ¿qué tendría que hacer?",
      { active_normalized_service_key: "charla_embarazo_1_20", active_stage: "confirmed" },
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-openai-key" } as NodeJS.ProcessEnv,
    );

    expect(result.classification_source).toBe("deterministic_override");
    expect(result.safety_flags).not.toContain("cancel_registration_request");
    expect(result.safety_flags).not.toContain("handoff_cancel_or_reschedule");
    expect(result.should_handoff).toBe(false);
  });

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

    const result = await new LlmIntentClassifier().classify("hola", {
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
    expect(result.classification_source).toBe("deterministic_override");
  });

  it("resolves a direct Charla availability request without waiting for OpenAI", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      new LlmIntentClassifier().classify(
        "pues quería saber qué citas tenéis disponibles para la charla informativa",
      ),
    ).resolves.toMatchObject({
      intent: "registration_start",
      service_candidate: "charla_embarazo_1_20",
      service_question_focus: "schedule",
      needs_availability_lookup: true,
      classification_source: "deterministic_fast_path",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
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
      classification_source: "openai",
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

  it.each([
    "quiero agendar cita",
    "quiero pedir una cita",
    "necesito coger cita",
  ])("keeps the booking intent when '%s' omits the service", async (message) => {
    const classifier = new LlmIntentClassifier();

    await expect(classifier.classify(message)).resolves.toMatchObject({
      intent: "registration_start",
      service_scope: "unknown",
      service_candidate: undefined,
      service_question_focus: "booking",
      needs_availability_lookup: false,
    });
  });

  it("records when OpenAI fails and deterministic NLU takes over", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("synthetic network failure"));

    await expect(
      new LlmIntentClassifier().classify("qué incluye el BLW"),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_candidate: "taller_blw",
      classification_source: "deterministic_fallback",
      classification_fallback_reason: "openai_fetch_error",
    });
  });

  it("falls back deterministically when OpenAI returns malformed HTTP JSON", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{", { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    await expect(
      new LlmIntentClassifier().classify("qué incluye el BLW"),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_candidate: "taller_blw",
      classification_source: "deterministic_fallback",
      classification_fallback_reason: "openai_invalid_http_json",
    });
  });

  it("recognizes a catalog-wide appointment availability question as service selection", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(
      classifier.classify("¿Para qué servicios tenéis citas disponibles?"),
    ).resolves.toMatchObject({
      intent: "availability_request",
      service_scope: "catalog",
      service_candidate: undefined,
      service_question_focus: "booking",
      needs_availability_lookup: false,
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

  it.each([
    ["embarazo", "embarazo"],
    ["estoy embarazada de cinco meses", "embarazo"],
    ["postparto", "postparto"],
    ["he dado a luz", "postparto"],
    ["otros", "otros"],
    ["otra cosa", "otros"],
  ])("understands the journey-stage answer '%s' without needing a service phrase", async (
    message,
    journeyStage,
  ) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_stage: "choosing_journey_stage",
    });

    expect(result).toMatchObject({
      intent: "service_discovery",
      service_scope: "catalog",
      slots: expect.objectContaining({ journey_stage: journeyStage }),
      needs_availability_lookup: false,
    });
    expect(result.service_candidate).toBeUndefined();
  });

  it("keeps the journey stage from a compound pregnancy-and-catalog message", async () => {
    const result = await new LlmIntentClassifier().classify(
      "Me parece bien. Te explico: estoy embarazada de 5 meses y necesito saber qué servicios ofrecéis",
      { active_stage: "choosing_journey_stage" },
    );

    expect(result).toMatchObject({
      intent: "service_discovery",
      service_scope: "catalog",
      slots: expect.objectContaining({
        journey_stage: "embarazo",
        pregnancy_month: 5,
      }),
      needs_availability_lookup: false,
    });
  });

  it.each([
    ["Quiero para charla informativa", "charla_embarazo_1_20"],
    ["el taller BLW", "taller_blw"],
  ])(
    "treats '%s' as the service choice for the pending appointment",
    async (message, serviceKey) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_stage: "choosing_booking_service",
        journey_stage: "embarazo",
      });

      expect(result).toMatchObject({
        intent: "registration_start",
        service_candidate: serviceKey,
        service_question_focus: "booking",
        needs_availability_lookup: true,
        slots: expect.objectContaining({ normalized_service_key: serviceKey }),
      });
    },
  );

  it("keeps booking focus for a service without a linked agenda", async () => {
    const result = await new LlmIntentClassifier().classify("Pilates embarazo", {
      active_stage: "choosing_booking_service",
      journey_stage: "embarazo",
    });

    expect(result).toMatchObject({
      intent: "service_question",
      service_candidate: "pilates",
      service_question_focus: "booking",
      needs_availability_lookup: false,
    });
  });

  it("does not mistake a pregnancy service name for a journey-stage choice", async () => {
    const result = await new LlmIntentClassifier().classify("Pilates embarazo", {
      active_stage: "choosing_journey_stage",
    });

    expect(result).toMatchObject({
      intent: "service_question",
      service_scope: "explicit",
      service_candidate: "pilates",
    });
    expect(result.slots.journey_stage).toBeUndefined();
  });

  it.each([
    "sesión gratuita de matronas",
    "Antes de apuntarme, explícame bien la sesión que dan las matronas al comienzo del embarazo",
    "Cuéntame la información para las primeras veinte semanas",
  ])("maps the charla paraphrase '%s' to the informational service before booking", async (message) => {
    const result = await new LlmIntentClassifier().classify(message);

    expect(result).toMatchObject({
      intent: "service_question",
      service_scope: "explicit",
      service_candidate: "charla_embarazo_1_20",
      needs_availability_lookup: false,
    });
    expect(result.should_handoff).toBe(false);
  });

  it("understands a brief yes after the charla booking CTA", async () => {
    const result = await new LlmIntentClassifier().classify("sí, por favor", {
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "awaiting_booking_decision",
      recent_messages: [
        { role: "assistant", text: "¿Quieres reservar tu plaza?" },
      ],
    });

    expect(result).toMatchObject({
      intent: "registration_start",
      service_scope: "contextual",
      service_candidate: "charla_embarazo_1_20",
      needs_availability_lookup: true,
      slots: expect.objectContaining({
        normalized_service_key: "charla_embarazo_1_20",
        consent: true,
        last_question_answered: "reservation_accepted",
      }),
    });
  });

  it("understands a brief no after the charla booking CTA without opening availability", async () => {
    const result = await new LlmIntentClassifier().classify("no, gracias", {
      active_service_id: "charla_embarazo_1_20",
      active_stage: "awaiting_booking_decision",
      recent_messages: [
        { role: "assistant", text: "¿Quieres reservar tu plaza?" },
      ],
    });

    expect(result).toMatchObject({
      intent: "service_question",
      service_scope: "contextual",
      service_candidate: "charla_embarazo_1_20",
      needs_availability_lookup: false,
      slots: expect.objectContaining({
        consent: false,
        last_question_answered: "reservation_declined",
      }),
    });
  });

  it.each([
    ["Erandio", "erandio", "presencial"],
    ["prefiero Bilbao", "bilbao", "presencial"],
    ["la opción online", "online", "online"],
  ])("uses '%s' as an availability continuation while choosing a charla session", async (
    message,
    location,
    modality,
  ) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "choosing_session",
    });

    expect(result).toMatchObject({
      intent: "availability_request",
      service_scope: "contextual",
      service_candidate: "charla_embarazo_1_20",
      service_question_focus: "schedule",
      needs_availability_lookup: true,
      slots: expect.objectContaining({ location, modality }),
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

  it.each([
    ["estoy en el quinto mes, por cierto", { pregnancy_month: 5 }],
    ["estoy de cinco meses", { pregnancy_month: 5 }],
    ["estoy de 20 semanas", { pregnancy_week: 20 }],
  ])("treats gestational context '%s' as information rather than a BLW transaction", async (
    message,
    expectedSlots,
  ) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "taller_blw",
      active_stage: "collecting_service",
    });

    expect(result).toMatchObject({
      intent: "general_info",
      service_scope: "unknown",
      slots: expect.objectContaining(expectedSlots),
      needs_availability_lookup: false,
    });
    expect(result.service_candidate).toBeUndefined();
  });

  it.each([
    ["¿qué fechas hay?", "registration_start"],
    ["me quiero apuntar", "registration_start"],
  ])("resolves the explicit transactional continuation '%s' against active BLW", async (
    message,
    expectedIntent,
  ) => {
    await expect(
      new LlmIntentClassifier().classify(message, {
        active_service_id: "taller_blw",
        active_stage: "collecting_service",
      }),
    ).resolves.toMatchObject({
      intent: expectedIntent,
      service_scope: "contextual",
      service_candidate: "taller_blw",
      needs_availability_lookup: true,
    });
  });

  it("treats a bare service name as a request for information, not a booking", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(classifier.classify("taller blw")).resolves.toMatchObject({
      intent: "service_question",
      service_candidate: "taller_blw",
      service_question_focus: "general",
      needs_availability_lookup: false,
    });
  });

  it.each(["reiniciar", "reset", "por favor, empezar de cero", "quiero volver al bot"])(
    "treats '%s' as an explicit technical reset command",
    async (message) => {
      await expect(new LlmIntentClassifier().classify(message)).resolves.toMatchObject({
        intent: "reset",
      });
    },
  );

  it.each([
    "No quiero reiniciar, solo saber qué talleres hay",
    "Quiero saber cómo reiniciar",
    "¿Qué pasa si resetear la conversación?",
    "Sigamos sin empezar de cero",
  ])("does not execute a reset when '%s' only mentions or rejects it", async (message) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "taller_blw",
      active_stage: "collecting_contact",
    });

    expect(result.intent).not.toBe("reset");
  });

  it("honors a correction asking for general information instead of repeating availability", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(
      classifier.classify(
        "me has dado plazas, cuando te pedía info en general ¿qué me puedes contar del taller?",
        { active_service_id: "taller_blw", active_stage: "choosing_session" },
      ),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_candidate: "taller_blw",
      service_question_focus: "general",
      needs_availability_lookup: false,
    });
  });

  it("treats an existential online question as catalog discovery, not as BLW context", async () => {
    const classifier = new LlmIntentClassifier();

    const result = await classifier.classify("oye, pero antes de esto ¿tenéis algún taller online?", {
        active_service_id: "taller_blw",
        active_stage: "collecting_contact",
      });

    expect(result).toMatchObject({
      intent: "service_discovery",
      service_scope: "catalog",
      service_question_focus: "locations",
      needs_availability_lookup: false,
      slots: expect.objectContaining({ modality: "online" }),
    });
    expect(result.service_candidate).toBeUndefined();
    expect(result.slots.normalized_service_key).toBeUndefined();
  });

  it.each([
    "¿algún taller online?",
    "¿qué tenéis online?",
    "¿y online qué tenéis?",
    "¿qué talleres son online?",
    "¿hay actividades online?",
    "Además del BLW, ¿tenéis algo online?",
    "Aparte del taller BLW, ¿qué opciones online hay?",
    "¿Hay otro taller online distinto del BLW?",
    "Fuera del BLW, ¿tenéis algún taller online?",
    "¿Tenéis algún taller online que no sea BLW?",
    "No me refiero al BLW, ¿qué tenéis online?",
    "¿Hay alguna alternativa online al BLW?",
    "BLW aparte, ¿qué más tenéis online?",
    "El taller BLW no; ¿tenéis algún otro online?",
    "¿Qué hay online excepto BLW?",
    "Sin contar el BLW, ¿qué tenéis online?",
    "¿Qué online hay salvo BLW?",
  ])("treats catalog paraphrase '%s' as portfolio discovery", async (message) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "taller_blw",
      active_stage: "collecting_contact",
    });

    expect(result).toMatchObject({
      intent: "service_discovery",
      service_scope: "catalog",
      slots: expect.objectContaining({ modality: "online" }),
      needs_availability_lookup: false,
    });
    expect(result.service_candidate).toBeUndefined();
  });

  it.each(["¿qué servicios ofrecéis?", "¿qué talleres hay?", "servicios"])(
    "treats general portfolio query '%s' as catalog discovery",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "taller_blw",
        active_stage: "collecting_contact",
      });

      expect(result).toMatchObject({
        intent: "service_discovery",
        service_scope: "catalog",
        needs_availability_lookup: false,
      });
      expect(result.service_candidate).toBeUndefined();
    },
  );

  it.each(["¿y presencial?", "¿y presenciales?"])(
    "changes the global catalog filter with '%s'",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_stage: "collecting_service",
        modality: "online",
      });

      expect(result).toMatchObject({
        intent: "service_discovery",
        service_scope: "catalog",
        slots: expect.objectContaining({ modality: "presencial" }),
      });
      expect(result.service_candidate).toBeUndefined();
    },
  );

  it("keeps explicit and short anaphoric modality questions scoped to BLW", async () => {
    const classifier = new LlmIntentClassifier();

    await expect(
      classifier.classify("¿el taller BLW es online?", { active_service_id: "taller_blw" }),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_scope: "explicit",
      service_candidate: "taller_blw",
      slots: expect.objectContaining({ modality: "online" }),
    });

    await expect(
      classifier.classify("¿y online?", { active_service_id: "taller_blw" }),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_scope: "contextual",
      service_candidate: "taller_blw",
      slots: expect.objectContaining({ modality: "online" }),
    });

    await expect(
      classifier.classify("¿BLW tiene otra opción online?", {
        active_service_id: "taller_blw",
      }),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_scope: "explicit",
      service_candidate: "taller_blw",
    });

    await expect(
      classifier.classify("Aparte de si el taller BLW es online, ¿cuánto dura?", {
        active_service_id: "taller_blw",
      }),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_scope: "explicit",
      service_candidate: "taller_blw",
      service_question_focus: "duration",
    });
  });

  it.each([
    "hola, buenos días",
    "buenos días, ¿qué tal?",
    "buenas tardes",
    "hola, ¿cómo estás?",
    "Buenos días 😊",
    "Muy buenos días",
    "Buenos días, gracias",
    "Hola de nuevo",
    "Buenos días a todas",
  ])("keeps natural greeting '%s' independent from stale BLW context", async (message) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "taller_blw",
      active_stage: "choosing_session",
    });

    expect(result).toMatchObject({
      intent: "greeting",
      service_scope: "unknown",
      needs_availability_lookup: false,
    });
    expect(result.service_candidate).toBeUndefined();
  });

  it("stabilizes an OpenAI booking misclassification for a bare service mention", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "registration_start",
            slots: {
              service_id: "taller_blw",
              normalized_service_key: "taller_blw",
            },
            service_question_focus: "booking",
            needs_availability_lookup: true,
            confidence: 0.98,
            missing_fields: [],
            should_handoff: false,
            safety_flags: [],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(new LlmIntentClassifier().classify("taller blw")).resolves.toMatchObject({
      intent: "service_question",
      service_candidate: "taller_blw",
      service_question_focus: "general",
      needs_availability_lookup: false,
      classification_source: "deterministic_override",
    });
  });

  it("stabilizes an OpenAI BLW misclassification for a global online search", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "service_question",
            service_scope: "contextual",
            service_candidate: "taller_blw",
            slots: { service_id: "taller_blw", modality: "online" },
            service_question_focus: "locations",
            needs_availability_lookup: false,
            confidence: 0.98,
            missing_fields: [],
            should_handoff: false,
            safety_flags: [],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await new LlmIntentClassifier().classify(
      "¿y tenéis algún taller online?",
      { active_service_id: "taller_blw", active_stage: "collecting_contact" },
    );

    expect(result).toMatchObject({
      intent: "service_discovery",
      service_scope: "catalog",
      slots: expect.objectContaining({ modality: "online" }),
    });
    expect(result.service_candidate).toBeUndefined();
  });

  it("stabilizes a pure greeting even if OpenAI drags the previous BLW context", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "service_question",
            service_scope: "contextual",
            service_candidate: "taller_blw",
            slots: { service_id: "taller_blw" },
            service_question_focus: "schedule",
            needs_availability_lookup: false,
            confidence: 0.97,
            missing_fields: [],
            should_handoff: false,
            safety_flags: [],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      new LlmIntentClassifier().classify("buenos días", {
        active_service_id: "taller_blw",
        active_stage: "choosing_session",
      }),
    ).resolves.toMatchObject({
      intent: "greeting",
      service_scope: "unknown",
      service_candidate: undefined,
      needs_availability_lookup: false,
    });
  });

  it("keeps the pending booking intent when OpenAI treats the chosen service as information", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "service_question",
            service_scope: "explicit",
            service_candidate: "charla_embarazo_1_20",
            slots: {
              service_id: "charla_embarazo_1_20",
              normalized_service_key: "charla_embarazo_1_20",
            },
            service_question_focus: "general",
            needs_availability_lookup: false,
            confidence: 0.98,
            missing_fields: [],
            should_handoff: false,
            safety_flags: [],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      new LlmIntentClassifier().classify("Quiero para charla informativa", {
        active_stage: "choosing_booking_service",
        journey_stage: "embarazo",
      }),
    ).resolves.toMatchObject({
      intent: "registration_start",
      service_candidate: "charla_embarazo_1_20",
      service_question_focus: "booking",
      needs_availability_lookup: true,
    });
  });

  it("stabilizes a gestational disclosure even if OpenAI turns it into BLW availability", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "registration_data_provided",
            service_scope: "contextual",
            service_candidate: "taller_blw",
            slots: {
              service_id: "taller_blw",
              normalized_service_key: "taller_blw",
              pregnancy_week: 20,
            },
            service_question_focus: "booking",
            needs_availability_lookup: true,
            confidence: 0.98,
            missing_fields: [],
            should_handoff: false,
            safety_flags: [],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      new LlmIntentClassifier().classify("estoy en el quinto mes, por cierto", {
        active_service_id: "taller_blw",
        active_stage: "collecting_service",
      }),
    ).resolves.toMatchObject({
      intent: "general_info",
      service_scope: "unknown",
      service_candidate: undefined,
      slots: expect.objectContaining({ pregnancy_month: 5 }),
      needs_availability_lookup: false,
    });
  });

  it("keeps an explicit booking refusal informational even when the same sentence mentions reservar", async () => {
    await expect(
      new LlmIntentClassifier().classify(
        "¿En qué consiste la charla de las primeras veinte semanas? No quiero reservar aún",
      ),
    ).resolves.toMatchObject({
      intent: "service_question",
      service_candidate: "charla_embarazo_1_20",
      service_question_focus: "general",
      needs_availability_lookup: false,
    });
  });

  it.each([
    ["Sí, en la online", "online", "online", "registration_start"],
    ["vale, la de Bilbao", "bilbao", "presencial", "registration_start"],
    ["de acuerdo, presencial en Erandio", "erandio", "presencial", "registration_start"],
    ["online", "online", "online", "registration_start"],
    ["Quisiera la online", "online", "online", "registration_start"],
    ["Bilbao me viene mejor", "bilbao", "presencial", "registration_start"],
    ["Sí, a las 19:00", "online", "online", "registration_start"],
    ["sí, online el 10 de agosto", "online", "online", "registration_slot_selected"],
  ])(
    "compone la aceptación contextual '%s' con su sede, modalidad o fecha",
    async (message, expectedLocation, expectedModality, expectedIntent) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      });

      expect(result).toMatchObject({
        intent: expectedIntent,
        service_scope: "contextual",
        service_candidate: "charla_embarazo_1_20",
        slots: expect.objectContaining({
          consent: true,
          last_question_answered: "reservation_accepted",
          location: expectedLocation,
          modality: expectedModality,
        }),
        needs_availability_lookup: true,
      });
    },
  );

  it("conserva la aceptación cuando el mismo turno ya aporta asistentes", async () => {
    const result = await new LlmIntentClassifier().classify("Sí, somos dos", {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "awaiting_booking_decision",
      recent_messages: [
        { role: "assistant", text: "¿Quieres reservar tu plaza?" },
      ],
    });

    expect(result).toMatchObject({
      intent: "registration_start",
      slots: expect.objectContaining({
        consent: true,
        people_count: 2,
        last_question_answered: "reservation_accepted",
      }),
      needs_availability_lookup: true,
    });
  });

  it("mantiene una pregunta informativa aunque empiece por sí y mencione modalidad", async () => {
    const result = await new LlmIntentClassifier().classify(
      "Sí, online, pero antes dime cuánto dura",
      {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      },
    );

    expect(result).toMatchObject({
      intent: "service_question",
      service_candidate: "charla_embarazo_1_20",
      service_question_focus: "duration",
      needs_availability_lookup: false,
    });
    expect(result.slots.consent).toBeUndefined();
  });

  it.each([
    "¿Es online?",
    "Sí, pero no online",
    "Sí, presencial, pero no Bilbao",
    "Sí, pero no sé si online",
    "Sí, quizá Bilbao",
  ])(
    "no convierte la duda o preferencia negada '%s' en consentimiento de reserva",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      });

      expect(result.intent).not.toBe("registration_start");
      expect(result.slots.consent).toBeUndefined();
      expect(result.needs_availability_lookup).toBe(false);
    },
  );

  it.each([
    "Sí, pero antes de reservar, ¿cuánto cuesta la online?",
    "Antes de reservar, ¿qué precio tiene?",
    "Quería reservar, pero antes dime el precio",
  ])(
    "pospone la reserva para contestar la pregunta previa: %s",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      });

      expect(result).toMatchObject({
        intent: "service_question",
        service_question_focus: "pricing",
        needs_availability_lookup: false,
      });
      expect(result.slots.consent).toBeUndefined();
    },
  );

  it.each([
    "No quiero reservar",
    "No me interesa reservar",
    "Prefiero no reservar",
    "Todavía no quiero reservar",
    "No por ahora, gracias",
    "No, gracias. Solo quería saber el horario",
  ])(
    "reconoce el rechazo natural a la reserva: %s",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      });

      expect(result.slots).toMatchObject({
        consent: false,
        last_question_answered: "reservation_declined",
      });
      expect(result.needs_availability_lookup).toBe(false);
    },
  );

  it("estabiliza sí en la online aunque OpenAI lo devuelva como pregunta de modalidad", async () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    process.env.OPENAI_API_KEY = "test-openai-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            intent: "service_question",
            service_scope: "contextual",
            service_candidate: "charla_embarazo_1_20",
            slots: {
              service_id: "charla_embarazo_1_20",
              normalized_service_key: "charla_embarazo_1_20",
              location: "online",
              modality: "online",
            },
            service_question_focus: "locations",
            needs_availability_lookup: false,
            confidence: 0.99,
            missing_fields: [],
            should_handoff: false,
            safety_flags: [],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      new LlmIntentClassifier().classify("Sí, en la online", {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      }),
    ).resolves.toMatchObject({
      intent: "registration_start",
      slots: expect.objectContaining({ consent: true, location: "online", modality: "online" }),
      needs_availability_lookup: true,
    });
  });

  it("recognizes a Spanish natural date as a session choice in the active Charla flow", async () => {
    await expect(
      new LlmIntentClassifier().classify("Online, 10 de agosto", {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "choosing_session",
      }),
    ).resolves.toMatchObject({
      intent: "registration_slot_selected",
      service_candidate: "charla_embarazo_1_20",
      slots: expect.objectContaining({ location: "online", modality: "online" }),
      needs_availability_lookup: true,
    });
  });

  it("does not treat 'guárdame una plaza' as an explicit one-person answer", async () => {
    const result = await new LlmIntentClassifier().classify(
      "Sí, me encaja; adelante, guárdame una plaza",
      {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      },
    );

    expect(result).toMatchObject({
      intent: "registration_start",
      needs_availability_lookup: true,
    });
    expect(result.slots.people_count).toBeUndefined();
  });

  it.each([
    ["1", 1],
    ["una", 1],
    ["uno", 1],
    ["2", 2],
    ["dos", 2],
    ["yo y mi pareja", 2],
    ["mi pareja y yo", 2],
  ])(
    "interprets the brief pending-attendee answer %s as %i person(s)",
    async (message, expectedPeopleCount) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "collecting_contact",
        pending_fields: ["peopleCount", "fullName", "fppOrDueDate"],
        recent_messages: [
          { role: "assistant", text: "Perfecto. Antes de continuar, ¿acudiréis una o dos personas?" },
        ],
      });

      expect(result).toMatchObject({
        intent: "registration_data_provided",
        slots: expect.objectContaining({ people_count: expectedPeopleCount }),
        people_count: expectedPeopleCount,
        needs_availability_lookup: false,
      });
    },
  );

  it.each([
    "somos mi chico y yo",
    "vendremos ambos",
    "mi marido y yo",
    "asistiremos las dos",
  ])("understands the natural two-attendee answer '%s' while that field is pending", async (message) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["peopleCount", "fullName", "fppOrDueDate"],
      recent_messages: [
        { role: "assistant", text: "Perfecto. Antes de continuar, ¿acudiréis una o dos personas?" },
      ],
    });

    expect(result).toMatchObject({
      intent: "registration_data_provided",
      people_count: 2,
      slots: expect.objectContaining({ people_count: 2 }),
    });
  });

  it.each([
    "Al final viene mi pareja",
    "Finalmente vendrá mi pareja",
    "También asiste mi acompañante",
    "Quiero añadir a mi pareja",
  ])("updates a one-person draft when the user adds a companion: '%s'", async (message) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fullName", "fppOrDueDate"],
    });

    expect(result).toMatchObject({
      intent: "registration_data_provided",
      people_count: 2,
      slots: expect.objectContaining({ people_count: 2 }),
    });
  });

  it.each([
    "¿Puede venir mi pareja?",
    "¿Podría añadir a mi acompañante?",
  ])("keeps companion eligibility questions read-only: '%s'", async (message) => {
    const result = await new LlmIntentClassifier().classify(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fullName", "fppOrDueDate"],
    });

    expect(result.slots.people_count).toBeUndefined();
    expect(result.people_count).toBeUndefined();
  });

  it("extracts a worded Spanish due date with the nearest reasonable year", async () => {
    const now = new Date();
    const thisYearCandidate = new Date(Date.UTC(now.getUTCFullYear(), 9, 14));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expectedYear = thisYearCandidate.getTime() < today.getTime()
      ? now.getUTCFullYear() + 1
      : now.getUTCFullYear();
    const result = await new LlmIntentClassifier().classify(
      "mi fecha probable es el catorce de octubre",
      {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "collecting_contact",
        pending_fields: ["fppOrDueDate"],
      },
    );

    expect(result).toMatchObject({
      intent: "registration_data_provided",
      slots: expect.objectContaining({ fpp_or_due_date: `${expectedYear}-10-14` }),
    });
  });

  it("keeps a punctuated middle initial in the full name", async () => {
    const result = await new LlmIntentClassifier().classify("Mi nombre es Ana M. López", {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fullName"],
    });

    expect(result).toMatchObject({
      intent: "registration_data_provided",
      slots: expect.objectContaining({ full_name: "Ana M. López" }),
    });
  });

  it.each([
    "Mi nombre es Paola Esto Es Una Prueba y mi pareja Manolo. fecha probable de parto 14 de Oct",
    'Mi nombre es "Paola Esto Es Una Prueba" y mi pareja Manolo. fecha probable de parto 14 de Oct.',
  ])("segments the exact multi-field registration payload '%s'", (message) => {
    const now = new Date();
    const thisYearCandidate = new Date(Date.UTC(now.getUTCFullYear(), 9, 14));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expectedYear = thisYearCandidate.getTime() < today.getTime()
      ? now.getUTCFullYear() + 1
      : now.getUTCFullYear();
    const result = new LlmIntentClassifier().classifyWithMock(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fullName", "partnerName", "fppOrDueDate"],
    });

    expect(result).toMatchObject({
      intent: "registration_data_provided",
      slots: expect.objectContaining({
        full_name: "Paola Esto Es Una Prueba",
        partner_name: "Manolo",
        fpp_or_due_date: `${expectedYear}-10-14`,
      }),
    });
    expect(result.slots.full_name).not.toMatch(/\by$/i);
  });

  it.each([
    ["ene", "01"],
    ["feb.", "02"],
    ["mar", "03"],
    ["abr.", "04"],
    ["may", "05"],
    ["jun.", "06"],
    ["jul", "07"],
    ["ago.", "08"],
    ["sep", "09"],
    ["set.", "09"],
    ["oct", "10"],
    ["nov.", "11"],
    ["dic", "12"],
  ])("extracts the abbreviated Spanish month '%s'", (month, expectedMonth) => {
    const result = new LlmIntentClassifier().classifyWithMock(
      `mi fecha probable de parto es el 14 de ${month}`,
      {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "collecting_contact",
        pending_fields: ["fppOrDueDate"],
      },
    );

    expect(result.slots.fpp_or_due_date).toMatch(new RegExp(`^\\d{4}-${expectedMonth}-14$`));
  });

  it.each(["la primera no, mejor la segunda", "la del diez"])(
    "recognizes the contextual session selection '%s'",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "choosing_session",
      });

      expect(result).toMatchObject({
        intent: "registration_slot_selected",
        service_candidate: "charla_embarazo_1_20",
        needs_availability_lookup: true,
      });
    },
  );

  it("continues the active appointment instead of falling back to general conversation", async () => {
    const result = await new LlmIntentClassifier().classify("continuar con la cita", {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["peopleCount", "fullName", "fppOrDueDate"],
    });

    expect(result).toMatchObject({
      intent: "registration_start",
      service_candidate: "charla_embarazo_1_20",
      needs_availability_lookup: true,
    });
  });

  it("treats a contextual request to schedule as the pending service booking", async () => {
    const result = await new LlmIntentClassifier().classify(
      "pues si, quiero agendar ¿es posible?",
      {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "awaiting_booking_decision",
        recent_messages: [
          { role: "assistant", text: "¿Quieres reservar tu plaza?" },
        ],
      },
    );

    expect(result).toMatchObject({
      intent: "registration_start",
      service_candidate: "charla_embarazo_1_20",
      needs_availability_lookup: true,
    });
  });

  it.each(["1", "una", "uno", "2", "dos"])(
    "does not infer the brief attendee answer %s outside a pending people-count field",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "collecting_contact",
        pending_fields: ["fullName", "fppOrDueDate"],
      });

      expect(result.slots.people_count).toBeUndefined();
      expect(result.people_count).toBeUndefined();
    },
  );

  it("keeps a bare number as a session option while choosing a session", async () => {
    const result = await new LlmIntentClassifier().classify("2", {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "choosing_session",
      pending_fields: [],
    });

    expect(result).toMatchObject({
      intent: "registration_slot_selected",
      service_candidate: "charla_embarazo_1_20",
      needs_availability_lookup: true,
    });
    expect(result.slots.people_count).toBeUndefined();
  });

  it("does not confuse a day of month with the pending people count", async () => {
    const result = await new LlmIntentClassifier().classify("2 de octubre", {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["peopleCount", "fppOrDueDate"],
    });

    expect(result.slots.people_count).toBeUndefined();
    expect(result.people_count).toBeUndefined();
  });

  it.each(["Vamos 3 personas", "Seremos 4"])(
    "does not accept an unsupported attendee count in '%s'",
    async (message) => {
      const result = await new LlmIntentClassifier().classify(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "collecting_contact",
        pending_fields: ["peopleCount"],
      });

      expect(result.slots.people_count).toBeUndefined();
      expect(result.people_count).toBeUndefined();
    },
  );

  it("keeps a concrete service question when pregnancy context is shared in the same turn", async () => {
    const result = await new LlmIntentClassifier().classifyWithMock(
      "Estoy embarazada de 5 meses, ¿cuánto cuesta Pilates?",
    );

    expect(result).toMatchObject({
      intent: "service_question",
      service_candidate: "pilates",
      service_scope: "explicit",
      service_question_focus: "pricing",
      slots: {
        journey_stage: "embarazo",
        pregnancy_month: 5,
      },
    });
  });

  it("keeps a concrete booking request when pregnancy context is shared in the same turn", async () => {
    const result = await new LlmIntentClassifier().classifyWithMock(
      "Estoy embarazada de 6 meses y quiero reservar el taller BLW",
    );

    expect(result).toMatchObject({
      intent: "registration_start",
      service_candidate: "taller_blw",
      service_scope: "explicit",
      service_question_focus: "booking",
      needs_availability_lookup: true,
      slots: {
        journey_stage: "embarazo",
        pregnancy_month: 6,
        normalized_service_key: "taller_blw",
      },
    });
  });

  it.each([
    ["Prefiero presencial, no online", undefined, "presencial"],
    ["No online, mejor presencial", undefined, "presencial"],
    ["En Bilbao, no Erandio", "bilbao", "presencial"],
    ["No Bilbao, mejor Erandio", "erandio", "presencial"],
  ])(
    "resolves the asserted preference instead of the negated one in '%s'",
    async (message, location, modality) => {
      const result = await new LlmIntentClassifier().classifyWithMock(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "choosing_session",
        location: "online",
        modality: "online",
      });

      expect(result).toMatchObject({
        intent: "availability_request",
        service_candidate: "charla_embarazo_1_20",
        needs_availability_lookup: true,
        slots: {
          location,
          modality,
        },
      });
    },
  );

  it("resumes the transactional service after an informational detour", async () => {
    const result = await new LlmIntentClassifier().classifyWithMock("continuar con la cita", {
      active_service_id: "pilates",
      active_normalized_service_key: "taller_blw",
      active_stage: "choosing_session",
    });

    expect(result).toMatchObject({
      intent: "registration_start",
      service_candidate: "taller_blw",
      service_scope: "contextual",
      needs_availability_lookup: true,
      slots: { normalized_service_key: "taller_blw" },
    });
  });

  it("continues the active booking when the user says exactly 'quiero una cita'", async () => {
    const result = await new LlmIntentClassifier().classifyWithMock("quiero una cita", {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
    });

    expect(result).toMatchObject({
      intent: "registration_start",
      service_candidate: "charla_embarazo_1_20",
      service_scope: "contextual",
      needs_availability_lookup: true,
      slots: { normalized_service_key: "charla_embarazo_1_20" },
    });
  });

  it.each(["Prefiero online o presencial", "No sé si Bilbao o Erandio"])(
    "does not persist an unresolved alternative as a session preference in '%s'",
    async (message) => {
      const result = await new LlmIntentClassifier().classifyWithMock(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "choosing_session",
      });

      expect(result.intent).toBe("service_question");
      expect(result.needs_availability_lookup).toBe(false);
      expect(result.slots.location).toBeUndefined();
      expect(result.slots.modality).toBeUndefined();
    },
  );
});
