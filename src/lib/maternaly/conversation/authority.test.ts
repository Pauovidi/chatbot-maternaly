import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationRecord } from "@/lib/hotel/conversations/types";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import {
  MaternalyConversationPolicy,
  MaternalyCoreAdapter,
  MaternalyStateReducer,
  MaternalyToolExecutor,
} from "@/lib/maternaly/conversation/core";
import { MaternalyCopyRenderer } from "@/lib/maternaly/conversation/copy-renderer";
import { MaternalyGroundedCopyGenerator } from "@/lib/maternaly/conversation/grounded-copy-generator";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import {
  LlmIntentClassifier,
  MaternalyConversationInterpreter,
  validateStructuredIntent,
} from "@/lib/maternaly/llm/interpreter";
import {
  createRealTemplateWorkbook,
  InMemoryNormalizedSheetsClient,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const clinicalClosing =
  "Si el sangrado, el dolor o cualquier síntoma importante empeora, mi recomendación es que contactes lo antes posible con tu médico o acudas a urgencias.";

function fakeConversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  const now = new Date().toISOString();
  return {
    id: "conv_authority",
    phoneE164: "+34600111222",
    phoneNormalized: "34600111222",
    sourceType: "whatsapp",
    channel: "twilio_sandbox",
    status: "open",
    tags: ["maternaly"],
    mode: "bot",
    humanRequested: false,
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    ...overrides,
  };
}

function eventTypes(result: Awaited<ReturnType<MaternalyCoreAdapter["handle"]>>) {
  return result.events.map((event) => event.eventType);
}

function countEmojis(text: string | undefined): number {
  return Array.from((text ?? "").matchAll(emojiPattern)).length;
}

describe("Maternaly conversation authority", () => {
  let tempDir = "";

  beforeEach(async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "maternaly-authority-"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("emits an authority trace with timings and renderer-owned visible text", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "hola",
      },
    });

    expect(result.renderedMessage).toMatchObject({
      kind: "text",
      source: "copy_renderer",
      renderer: "MaternalyCopyRenderer",
    });
    expect(result.authorityTrace.pipeline).toEqual([
      "normalized_inbound",
      "nlu_structured",
      "state_reducer",
      "policy",
      "copy_renderer",
      "outbox",
    ]);
    expect(result.authorityTrace.inbound.fromRedacted).not.toContain("600111222");
    expect(result.authorityTrace.timing.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.authorityTrace.timing.nluTotalMs).toBeGreaterThanOrEqual(0);
    expect(result.authorityTrace.invariants).toMatchObject({
      nluStructuredOnly: true,
      rendererUsedForVisibleText: true,
      policyUsedStateAfter: true,
      pendingFieldsFromStateAfter: true,
    });
    expect(eventTypes(result)).toEqual(
      expect.arrayContaining([
        "maternaly_authority_timing_completed",
        "maternaly_authority_turn_completed",
      ]),
    );
  });

  it("lets FAQ escape an active flow without dropping state_after", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_bilbao_20260925",
          selectedGroupId: "grupo_blw_bilbao",
          updatedAt: "2026-06-25T00:00:00.000Z",
        },
      }),
      inbound: {
        provider: "webchat",
        from: "+34600111222",
        text: "cuánto cuesta el taller BLW",
      },
    });

    expect(result.reply).toMatch(/BLW|Precio/i);
    expect(result.state).toMatchObject({
      serviceKey: "taller_blw",
      stage: "collecting_contact",
      selectedSessionId: "sesion_blw_bilbao_20260925",
      selectedGroupId: "grupo_blw_bilbao",
      pendingFields: [],
    });
    expect(result.authorityTrace.policy).toMatchObject({
      action: "service_info",
      reason: "faq_escape_hatch",
    });
  });

  it("honors a general-information correction instead of repeating the session list", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "choosing_session",
          selectedSessionId: "sesion_blw_erandio_20261007",
          selectedGroupId: "grupo_blw_erandio",
          updatedAt: "2026-07-17T10:21:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "me has dado plazas, cuando te pedía info en general ¿qué me puedes contar del taller?",
      },
    });

    expect(result.intent).toMatchObject({
      intent: "service_question",
      service_candidate: "taller_blw",
      service_question_focus: "general",
      needs_availability_lookup: false,
    });
    expect(result.authorityTrace.policy).toMatchObject({
      action: "service_info",
      reason: "faq_escape_hatch",
    });
    expect(result.reply).toMatch(/Tienes raz[oó]n|alimentaci[oó]n complementaria autorregulada/i);
    expect(result.reply).toMatch(/seguridad|alergias|alimentaci[oó]n saludable/i);
    expect(result.reply).not.toMatch(/Opciones para Taller BLW|plazas disponibles/i);
    expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
  });

  it.each([
    "¿Para qué servicios tenéis citas disponibles?",
    "no, lo que quiero es agendar cita",
  ])(
    "keeps pregnancy context and asks for the service on the appointment turn '%s'",
    async (message) => {
      const now = "2026-07-18T09:06:00.000Z";
      const previousMenu = new MaternalyCopyRenderer().render({
        decision: { action: "catalog_info", journeyStage: "embarazo" },
      }) ?? "";
      const result = await new MaternalyCoreAdapter().handle({
        conversation: fakeConversation({
          maternalyNormalizedFlow: {
            journeyStage: "embarazo",
            stage: "collecting_service",
            updatedAt: now,
          },
          messages: [
            {
              id: "msg_previous_pregnancy_menu",
              conversationId: "conv_authority",
              direction: "outbound",
              senderType: "bot",
              transport: "whatsapp",
              body: previousMenu,
              createdAt: now,
            },
          ],
        }),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: message,
        },
      });

      expect(result.authorityTrace.policy).toMatchObject({
        action: "booking_service_selection",
        reason: "booking_service_required",
      });
      expect(result.state).toMatchObject({
        journeyStage: "embarazo",
        stage: "choosing_booking_service",
      });
      expect(result.reply).toMatch(/agendar|cita/i);
      expect(result.reply).toMatch(/servicio concreto|qu[eé] servicio/i);
      expect(result.reply).not.toMatch(
        /^Puntos clave|Soy Ane|en qu[eé] etapa|EMBARAZO, POSTPARTO|Perfecto.*servicios de Maternaly para el embarazo/is,
      );
      expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
    },
  );

  it("keeps stage and booking intent across the exact three-turn reported flow", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        multiSession: true,
        sessionCapacity: "14",
      }),
    );
    const adapter = new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    );
    const env = normalizedTestEnv();

    const catalog = await adapter.handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Me parece bien. Te explico: estoy embarazada de 5 meses y necesito saber qué servicios ofrecéis",
      },
      env,
    });

    expect(catalog.authorityTrace.policy.action).toBe("catalog_info");
    expect(catalog.state).toMatchObject({
      journeyStage: "embarazo",
      pregnancyMonth: 5,
      stage: "collecting_service",
    });
    expect(catalog.reply).toMatch(/embarazada de 5 meses/i);
    expect(catalog.reply).not.toMatch(/en qu[eé] momento est[aá]s|Lactancia|Pedi[aá]trica/i);

    const appointment = await adapter.handle({
      conversation: fakeConversation({ ...catalog.conversationPatch }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "quiero agendar cita",
      },
      env,
    });

    expect(appointment.authorityTrace.policy.action).toBe("booking_service_selection");
    expect(appointment.state).toMatchObject({
      journeyStage: "embarazo",
      pregnancyMonth: 5,
      stage: "choosing_booking_service",
    });
    expect(appointment.reply).toMatch(/agenda vinculada|fechas y plazas reales/i);
    expect(appointment.reply).not.toMatch(/equipo confirme la agenda/i);

    const serviceChoice = await adapter.handle({
      conversation: fakeConversation({ ...appointment.conversationPatch }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Quiero para charla informativa",
      },
      env,
    });

    expect(serviceChoice.authorityTrace.policy.action).toBe("normalized_registration");
    expect(serviceChoice.state).toMatchObject({
      serviceKey: "charla_embarazo_1_20",
      journeyStage: "embarazo",
      pregnancyMonth: 5,
      stage: "choosing_session",
    });
    expect(eventTypes(serviceChoice)).toContain("maternaly_availability_checked");
    expect(serviceChoice.conversationPatch.maternalyReservationStatus).toBe("none");
    expect(serviceChoice.reply).toMatch(/Charla Informativa[\s\S]*(Erandio|Bilbao|online)/i);
    expect(serviceChoice.reply).not.toMatch(/¿Quieres reservar tu plaza\?|equipo confirme la agenda/i);
  });

  it("keeps gestational context and social replies outside a topical BLW registration flow", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const adapter = new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    );
    const env = normalizedTestEnv();
    const topic = await adapter.handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "¿no tenéis taller BLW?",
      },
      env,
    });

    expect(topic.authorityTrace.policy.action).toBe("service_info");
    expect(topic.state).toMatchObject({
      serviceKey: "taller_blw",
      stage: "collecting_service",
    });
    expect(topic.state?.phone).toBeUndefined();

    for (const message of [
      "estoy en el quinto mes, por cierto",
      "estoy de cinco meses",
      "estoy de 20 semanas",
      "gracias",
    ]) {
      const result = await adapter.handle({
        conversation: fakeConversation({ ...topic.conversationPatch }),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: message,
        },
        env,
      });

      expect(result.authorityTrace.policy.action).not.toBe("normalized_registration");
      expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
      expect(result.reply).not.toMatch(/Opciones para Taller BLW|plazas disponibles|2026-\d{2}-\d{2}/i);
      expect(result.state).toMatchObject({
        serviceKey: "taller_blw",
        stage: "collecting_service",
      });
      expect(result.state?.fullName).toBeUndefined();
      expect(result.state?.pregnancyWeek).toBeUndefined();
    }
  });

  it.each(["¿qué fechas hay?", "me quiero apuntar"])(
    "continues topical BLW only for the explicit transaction '%s'",
    async (message) => {
      const client = new InMemoryNormalizedSheetsClient(
        createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
      );
      const adapter = new MaternalyCoreAdapter(
        undefined,
        undefined,
        undefined,
        new MaternalyToolExecutor(client),
      );
      const env = normalizedTestEnv();
      const topic = await adapter.handle({
        conversation: fakeConversation(),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: "taller BLW",
        },
        env,
      });
      const result = await adapter.handle({
        conversation: fakeConversation({ ...topic.conversationPatch }),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: message,
        },
        env,
      });

      expect(result.authorityTrace.policy.action).toBe("normalized_registration");
      expect(eventTypes(result)).toContain("maternaly_availability_checked");
      expect(result.reply).toMatch(/Opciones para Taller BLW|plazas disponibles/i);
    },
  );

  it("accepts relevant contact data while a BLW registration is collecting contact", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const adapter = new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    );
    const env = normalizedTestEnv();
    const contact = await adapter.handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_bilbao_20260925",
          selectedGroupId: "grupo_blw_bilbao",
          phone: "+34600111222",
          pendingFields: ["fullName", "email", "peopleCount", "babyBirthDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Soy Ana García, ana@example.test, 1 persona, fecha nacimiento bebé 2025-01-15",
      },
      env,
    });

    expect(contact.authorityTrace.policy.action).toBe("normalized_registration");
    expect(eventTypes(contact)).toContain("maternaly_availability_checked");
    expect(contact.state).toMatchObject({
      fullName: "Ana García",
      email: "ana@example.test",
      peopleCount: 1,
      babyBirthDate: "2025-01-15",
      stage: "write_planned",
    });
  });

  it.each([
    ["Soy Ana García y voy sola", 1, undefined],
    ["Me llamo Ana García y vengo en pareja", 2, undefined],
    ["Soy Ana García ana@example.test", undefined, "ana@example.test"],
    ["Soy Ana García mi email es ana@example.test", undefined, "ana@example.test"],
    ["Soy Ana García y mi email es ana@example.test", undefined, "ana@example.test"],
  ])(
    "segments full name from the other contact fields in '%s'",
    async (message, expectedPeopleCount, expectedEmail) => {
      const client = new InMemoryNormalizedSheetsClient(
        createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
      );
      const result = await new MaternalyCoreAdapter(
        undefined,
        undefined,
        undefined,
        new MaternalyToolExecutor(client),
      ).handle({
        conversation: fakeConversation({
          serviceDetected: "Taller BLW",
          maternalyNormalizedFlow: {
            serviceKey: "taller_blw",
            stage: "collecting_contact",
            selectedSessionId: "sesion_blw_bilbao_20260925",
            selectedGroupId: "grupo_blw_bilbao",
            phone: "+34600111222",
            pendingFields: ["fullName", "email", "peopleCount", "babyBirthDate"],
            updatedAt: "2026-07-17T12:00:00.000Z",
          },
        }),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: message,
        },
        env: normalizedTestEnv(),
      });

      expect(result.state?.fullName).toBe("Ana García");
      if (expectedPeopleCount) {
        expect(result.state?.peopleCount).toBe(expectedPeopleCount);
      }
      if (expectedEmail) {
        expect(result.state?.email).toBe(expectedEmail);
      }
      expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    },
  );

  it.each([
    "gracias por la información",
    "qué interesante todo",
    "cuéntame algo más",
  ])("does not treat the social reply '%s' as the pending full name", async (message) => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_bilbao_20260925",
          selectedGroupId: "grupo_blw_bilbao",
          phone: "+34600111222",
          pendingFields: ["fullName", "email", "peopleCount", "babyBirthDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
    });

    expect(result.state?.fullName).toBeUndefined();
    expect(result.state?.pendingFields).toEqual([
      "fullName",
      "email",
      "peopleCount",
      "babyBirthDate",
    ]);
    expect(result.authorityTrace.policy.action).not.toBe("normalized_registration");
    expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
  });

  it("accepts a strong bare full name when it is one of several pending fields", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ multiSession: true, sessionCapacity: "14" }),
    );
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    ).handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_bilbao_20260925",
          selectedGroupId: "grupo_blw_bilbao",
          phone: "+34600111222",
          pendingFields: ["fullName", "email", "peopleCount", "babyBirthDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Ana García",
      },
      env: normalizedTestEnv(),
    });

    expect(result.state?.fullName).toBe("Ana García");
    expect(result.state?.pendingFields).toEqual(["email", "peopleCount", "babyBirthDate"]);
    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(eventTypes(result)).toContain("maternaly_availability_checked");
  });

  it("sends only abstract conversation categories to the grounded-copy request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            plans: [
              { opening_id: "none", closing_id: "none" },
              { opening_id: "friendly", closing_id: "available" },
            ],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const interpreter = {
      interpret: vi.fn(async () =>
        validateStructuredIntent({
          intent: "service_question",
          service_scope: "explicit",
          service_candidate: "taller_blw",
          service_question_focus: "general",
          needs_availability_lookup: false,
          slots: {
            service_id: "taller_blw",
            normalized_service_key: "taller_blw",
          },
        }),
      ),
    } as unknown as MaternalyConversationInterpreter;
    const renderer = new MaternalyCopyRenderer(
      new MaternalyGroundedCopyGenerator({ fetchImpl: fetchMock as unknown as typeof fetch }),
    );
    const adapter = new MaternalyCoreAdapter(
      interpreter,
      undefined,
      undefined,
      undefined,
      renderer,
    );

    await adapter.handle({
      conversation: fakeConversation({
        messages: [
          {
            id: "msg_sensitive_user",
            conversationId: "conv_authority",
            direction: "inbound",
            senderType: "user",
            transport: "whatsapp",
            body: "Soy Ana García y tengo diabetes gestacional",
            createdAt: "2026-07-17T12:00:00.000Z",
          },
          {
            id: "msg_sensitive_echo",
            conversationId: "conv_authority",
            direction: "outbound",
            senderType: "bot",
            transport: "whatsapp",
            body: "Gracias, Ana García; anoto que tienes diabetes gestacional.",
            createdAt: "2026-07-17T12:01:00.000Z",
          },
        ],
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "¿Qué me puedes contar del taller BLW?",
      },
      env: {
        NODE_ENV: "test",
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "unit-test-key",
      } as NodeJS.ProcessEnv,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const requestBody = String(init?.body);
    expect(requestBody).not.toContain("Ana García");
    expect(requestBody).not.toContain("diabetes gestacional");
    expect(requestBody).not.toContain("[contexto clinico omitido]");
    expect(requestBody).not.toContain("alimentación complementaria");
    const body = JSON.parse(requestBody) as {
      input: Array<{ role: string; content: string }>;
    };
    expect(JSON.parse(body.input[1].content)).toEqual({
      action: "service_info",
      context_mode: "informational",
      draft_shape: expect.any(Object),
      has_recent_assistant_reply: true,
    });
  });

  it("does not treat pregnancy context as a BLW contact field during an active registration", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_bilbao_20260925",
          selectedGroupId: "grupo_blw_bilbao",
          phone: "+34600111222",
          pendingFields: ["fullName", "email", "peopleCount", "babyBirthDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "estoy en el quinto mes, por cierto",
      },
    });

    expect(result.authorityTrace.policy.action).not.toBe("normalized_registration");
    expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
    expect(result.state?.fullName).toBeUndefined();
    expect(result.state?.pregnancyWeek).toBeUndefined();
  });

  it("records pregnancy week but keeps FPP pending in an active Charla registration", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }),
    );
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    ).handle({
      conversation: fakeConversation({
        serviceDetected: "Charla informativa gratuita semana 1 a 20 de embarazo",
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          selectedGroupId: "grupo_charla_bilbao",
          fullName: "Ana García",
          phone: "+34600111222",
          email: "ana@example.test",
          peopleCount: 1,
          pendingFields: ["fppOrDueDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "estoy de 20 semanas",
      },
      env: normalizedTestEnv(),
    });

    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(eventTypes(result)).toContain("maternaly_availability_checked");
    expect(result.state).toMatchObject({
      serviceKey: "charla_embarazo_1_20",
      pregnancyWeek: 20,
      stage: "collecting_contact",
      pendingFields: ["fppOrDueDate"],
    });
    expect(result.state?.fppOrDueDate).toBeUndefined();
  });

  it.each([
    ["Mi pareja se llama Pedro y estoy de 20 semanas", "Pedro"],
    ["Mi pareja se llama Pedro García y mi FPP es 20/12/2026", "Pedro García"],
    ["Pedro García", "Pedro García"],
  ])("segments a valid partner name from '%s'", async (message, expectedPartnerName) => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }),
    );
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    ).handle({
      conversation: fakeConversation({
        serviceDetected: "Charla informativa gratuita semana 1 a 20 de embarazo",
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          selectedGroupId: "grupo_charla_bilbao",
          fullName: "Ana García",
          phone: "+34600111222",
          email: "ana@example.test",
          peopleCount: 2,
          pendingFields: ["fppOrDueDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
      env: normalizedTestEnv(),
    });

    expect(result.state?.partnerName).toBe(expectedPartnerName);
    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(eventTypes(result)).toContain("maternaly_availability_checked");
  });

  it.each(["vengo en pareja", "mi pareja todavía no sabe si viene"])(
    "does not infer a partner name from '%s'",
    async (message) => {
      const result = await new MaternalyCoreAdapter().handle({
        conversation: fakeConversation({
          serviceDetected: "Charla informativa gratuita semana 1 a 20 de embarazo",
          maternalyNormalizedFlow: {
            serviceKey: "charla_embarazo_1_20",
            stage: "collecting_contact",
            selectedSessionId: "sesion_charla_bilbao_20261006",
            selectedGroupId: "grupo_charla_bilbao",
            fullName: "Ana García",
            phone: "+34600111222",
            email: "ana@example.test",
            peopleCount: 2,
            pendingFields: ["fppOrDueDate"],
            updatedAt: "2026-07-17T12:00:00.000Z",
          },
        }),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: message,
        },
      });

      expect(result.state?.partnerName).toBeUndefined();
      expect(result.state?.pendingFields).toEqual(["fppOrDueDate"]);
      expect(result.authorityTrace.policy.action).not.toBe("normalized_registration");
      expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
    },
  );

  it("answers a global online search from the catalog without resuming or contaminating BLW", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyReservationStatus: "pending",
        maternalyPaymentStatus: "confirmed",
        maternalyInvoiceStatus: "sent",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_erandio_20261007",
          selectedGroupId: "grupo_blw_erandio",
          pendingFields: ["email", "peopleCount", "babyBirthDate"],
          updatedAt: "2026-07-17T10:24:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "oye, pero antes de esto ¿tenéis algún taller online?",
      },
    });

    expect(result.intent).toMatchObject({
      intent: "service_discovery",
      service_scope: "catalog",
      service_candidate: undefined,
      slots: expect.objectContaining({ modality: "online" }),
    });
    expect(result.authorityTrace.policy).toMatchObject({
      action: "catalog_info",
      reason: "catalog_scope",
    });
    expect(result.reply).toMatch(/opci[oó]n online.*charla informativa|charla informativa.*online/i);
    expect(result.reply).not.toMatch(/^El taller BLW no tiene|te cuento c[oó]mo es el BLW/i);
    expect(result.reply).not.toMatch(/me faltan|email|fecha de nacimiento del beb[eé]/i);
    expect(result.state).toMatchObject({
      serviceKey: "charla_embarazo_1_20",
      stage: "collecting_service",
      modality: "online",
    });
    expect(result.conversationPatch.serviceDetected).toBe("Taller BLW");
    expect(result.conversationPatch).toMatchObject({
      maternalyReservationStatus: "none",
      maternalyPaymentStatus: "confirmed",
      maternalyInvoiceStatus: "sent",
    });
    expect(eventTypes(result)).not.toContain("maternaly_availability_checked");

    const followUp = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({ ...result.conversationPatch }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "gracias",
      },
    });

    expect(followUp.authorityTrace.policy.action).not.toBe("normalized_registration");
    expect(followUp.reply).not.toMatch(/Taller BLW|17:00|plazas disponibles/i);

    const editions = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({ ...result.conversationPatch }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Sí, mira las próximas",
      },
    });

    expect(editions.intent).toMatchObject({
      service_candidate: "charla_embarazo_1_20",
      service_scope: "contextual",
      slots: expect.objectContaining({ modality: "online" }),
    });
    expect(editions.authorityTrace.policy.action).toBe("normalized_registration");
    expect(editions.reply).not.toMatch(/Pilates|AIPAP|Yoga Prenatal/i);
  });

  it("routes a pure greeting before any stale registration context", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "choosing_session",
          updatedAt: "2026-07-17T10:21:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "buenos días",
      },
    });

    expect(result.intent.intent).toBe("greeting");
    expect(result.authorityTrace.policy.action).toBe("greeting");
    expect(result.reply).toMatch(/Buenos d[ií]as|Encantada de leerte/i);
    expect(result.reply).not.toMatch(/BLW|17:00|plazas|fechas/i);
    expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
  });

  it("never emits an identical non-safety reply twice in the recent conversation", async () => {
    const adapter = new MaternalyCoreAdapter();
    const first = await adapter.handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "hola",
      },
    });
    const second = await adapter.handle({
      conversation: fakeConversation({
        ...first.conversationPatch,
        messages: [
          {
            id: "msg_previous_bot_reply",
            conversationId: "conv_authority",
            direction: "outbound",
            senderType: "bot",
            transport: "whatsapp",
            body: first.reply ?? "",
            createdAt: "2026-07-17T10:00:00.000Z",
          },
        ],
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "hola",
      },
    });

    expect(second.reply).not.toBe(first.reply);
    expect(second.reply).not.toMatch(/repetitiva|otra manera|otro [aá]ngulo|misma respuesta/i);
    expect(eventTypes(second)).toContain("maternaly_copy_repetition_avoided");
  });

  it("keeps reset technical and clears every service-level context", async () => {
    const resetCopy = "Listo, conversación reiniciada. Empezamos desde cero. ¿En qué puedo ayudarte?";
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyReservationStatus: "pending",
        maternalyPaymentStatus: "pending",
        maternalyInvoiceStatus: "pending",
        maternalyReviewStatus: "manual_review_required",
        priority: "urgent",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          modality: "presencial",
          updatedAt: "2026-07-17T10:21:00.000Z",
        },
        messages: [
          {
            id: "msg_previous_reset",
            conversationId: "conv_authority",
            direction: "outbound",
            senderType: "bot",
            transport: "whatsapp",
            body: resetCopy,
            createdAt: "2026-07-17T10:22:00.000Z",
          },
        ],
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "reiniciar",
      },
    });

    expect(result.reply).toBe(resetCopy);
    expect(result.reply).not.toMatch(/repetitiva|otra manera|otro [aá]ngulo/i);
    expect(result.state).toBeUndefined();
    expect(result.conversationPatch).toMatchObject({
      serviceDetected: undefined,
      maternalyNormalizedFlow: undefined,
      maternalyReservationStatus: "none",
      maternalyPaymentStatus: "none",
      maternalyInvoiceStatus: "none",
      maternalyReviewStatus: "ok",
      priority: "normal",
    });
    expect(eventTypes(result)).not.toContain("maternaly_copy_repetition_avoided");
  });

  it("does not let reset remove a blocked client's mandatory review", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        clientStatus: "blocked",
        mode: "human",
        humanRequested: true,
        requiresManualReview: true,
        maternalyReviewStatus: "manual_review_required",
        priority: "urgent",
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          updatedAt: "2026-07-17T10:21:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "reiniciar",
      },
    });

    expect(result.state).toBeUndefined();
    expect(result.conversationPatch).toMatchObject({
      serviceDetected: undefined,
      maternalyNormalizedFlow: undefined,
      mode: "human",
      humanRequested: true,
      requiresManualReview: true,
      maternalyReviewStatus: "manual_review_required",
      priority: "urgent",
    });
  });

  it("resets the chat without erasing confirmed business milestones", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyReservationStatus: "confirmed",
        maternalyPaymentStatus: "confirmed",
        maternalyInvoiceStatus: "sent",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          updatedAt: "2026-07-17T10:21:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "reiniciar",
      },
    });

    expect(result.state).toBeUndefined();
    expect(result.conversationPatch).toMatchObject({
      serviceDetected: "Taller BLW",
      maternalyReservationStatus: "confirmed",
      maternalyPaymentStatus: "confirmed",
      maternalyInvoiceStatus: "sent",
    });
  });

  it("persists outbound text through the Maternaly outbox", async () => {
    const store = new FileConversationStore(path.join(tempDir, "conversations.json"));

    const result = await handleInboundMaternalyWhatsApp(
      {
        from: "whatsapp:+34600111222",
        body: "hola",
        messageSid: "SM_AUTHORITY_OUTBOX",
        channel: "twilio_sandbox",
      },
      store,
    );

    expect(result.botReply?.body).toContain("Maternaly");
    expect(result.twiml).toContain("<Message>");
    expect(result.conversation.events.map((event) => event.eventType)).toContain("maternaly_outbox_sent");
    expect(
      result.conversation.events.find((event) => event.eventType === "maternaly_outbox_sent")?.payload,
    ).toMatchObject({
      renderedSource: "copy_renderer",
      mode: "twiml",
      provider: "twilio_sandbox",
    });
  });

  it("strips visible copy fields from structured NLU payloads", () => {
    const intent = validateStructuredIntent({
      intent: "greeting",
      reply: "Hola, texto visible indebido",
      replyText: "Otro texto indebido",
      message: "Otra respuesta visible indebida",
      botReply: "Copy visible indebido",
      visibleText: "Texto visible indebido",
      confidence: 0.9,
      needs_availability_lookup: false,
      missing_fields: [],
      safety_flags: [],
    });

    expect((intent as unknown as { reply?: string }).reply).toBeUndefined();
    expect((intent as unknown as { replyText?: string }).replyText).toBeUndefined();
    expect((intent as unknown as { message?: string }).message).toBeUndefined();
    expect((intent as unknown as { botReply?: string }).botReply).toBeUndefined();
    expect((intent as unknown as { visibleText?: string }).visibleText).toBeUndefined();
    expect(intent.safety_flags).toEqual(
      expect.arrayContaining([
        "nlu_visible_copy_field_stripped:reply",
        "nlu_visible_copy_field_stripped:replyText",
        "nlu_visible_copy_field_stripped:message",
        "nlu_visible_copy_field_stripped:botReply",
        "nlu_visible_copy_field_stripped:visibleText",
      ]),
    );
  });

  it("routes clinical warning signs through professional handoff copy", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "tengo dolor fuerte y sangrado",
      },
    });

    expect(result.intent).toMatchObject({
      should_handoff: true,
      service_question_focus: "clinical_risk",
    });
    expect(result.intent.safety_flags).toContain("clinical_or_diagnostic_escalation");
    expect(result.reply).toMatch(/profesional|equipo de Maternaly/i);
    expect(result.reply).toMatch(/No puedo hacer diagn[oó]stico/i);
    expect(result.reply).toContain(clinicalClosing);
    expect(result.reply).not.toContain("no esperes a la respuesta del bot");
    expect(result.reply).not.toContain("continúa o te preocupa");
    expect(result.reply).not.toMatch(/lo dejo preparado/i);
    expect(countEmojis(result.reply)).toBe(0);
    expect(result.renderedMessage).toMatchObject({
      kind: "text",
      source: "copy_renderer",
      renderer: "MaternalyCopyRenderer",
    });
    expect(result.authorityTrace.invariants.nluStructuredOnly).toBe(true);
    expect(result.authorityTrace.policy).toMatchObject({
      action: "handoff",
      reason: "clinical_safety_requires_professional",
    });
    expect(result.authorityTrace.intent.serviceQuestionFocus).toBe("clinical_risk");
    expect(result.conversationPatch).toMatchObject({
      mode: "human",
      humanRequested: true,
      requiresManualReview: true,
      maternalyReviewStatus: "manual_review_required",
      priority: "urgent",
    });
    expect(eventTypes(result)).toEqual(
      expect.arrayContaining([
        "maternaly_clinical_safety_handoff",
        "maternaly_handoff_required",
        "human_requested",
      ]),
    );
  });

  it("keeps Pilates context when a follow-up turn only asks for prices", async () => {
    const adapter = new MaternalyCoreAdapter();
    const first = await adapter.handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Dime los horarios pilates embarazo bilbao",
      },
    });
    const second = await adapter.handle({
      conversation: fakeConversation({
        ...first.conversationPatch,
        messages: [],
        events: [],
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "vale, dime precios venga",
      },
    });

    expect(first.reply).toContain("Bilbao");
    expect(first.reply).not.toContain("59 €/mes");
    expect(first.conversationPatch.serviceDetected).toBe("Pilates Embarazo");
    expect(second.intent).toMatchObject({
      service_candidate: "pilates",
      service_question_focus: "pricing",
    });
    expect(second.reply).toContain("59 €/mes");
    expect(second.reply).toContain("99 €/mes");
    expect(second.reply).not.toMatch(/Puedo orientarte sobre charlas de embarazo|taller BLW|AIPAP|suelo p[eé]lvico/i);
    expect(second.reply).not.toMatch(/lunes 10:00-11:00|miércoles 18:15-19:15|martes 17:30-18:30/i);
    expect(second.authorityTrace.policy).toMatchObject({
      action: "service_info",
      reason: "faq_escape_hatch",
    });
  });

  it("replaces stale BLW topic context when the user switches to Pilates", async () => {
    const adapter = new MaternalyCoreAdapter();
    const blw = await adapter.handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "taller BLW",
      },
    });
    const pilates = await adapter.handle({
      conversation: fakeConversation({ ...blw.conversationPatch }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "pilates embarazo",
      },
    });
    const lifeStage = await adapter.handle({
      conversation: fakeConversation({ ...pilates.conversationPatch }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "estoy en el quinto mes",
      },
    });

    expect(blw.state).toMatchObject({
      serviceKey: "taller_blw",
      stage: "collecting_service",
    });
    expect(pilates.conversationPatch.serviceDetected).toBe("Pilates Embarazo");
    expect(pilates.state?.serviceKey).toBeUndefined();
    expect(lifeStage.intent.service_candidate).toBe("pilates");
    expect(lifeStage.reply).toMatch(/Pilates Embarazo/i);
    expect(lifeStage.reply).not.toMatch(/taller BLW|alimentaci[oó]n complementaria/i);
    expect(lifeStage.authorityTrace.policy.action).toBe("service_info");
  });

  it("keeps an active BLW registration intact during an informational Pilates detour", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_bilbao_20260925",
          selectedGroupId: "grupo_blw_bilbao",
          phone: "+34600111222",
          pendingFields: ["fullName", "email", "peopleCount", "babyBirthDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "¿qué beneficios tiene pilates embarazo?",
      },
    });

    expect(result.authorityTrace.policy.action).toBe("service_info");
    expect(result.conversationPatch.serviceDetected).toBe("Pilates Embarazo");
    expect(result.state).toMatchObject({
      serviceKey: "taller_blw",
      stage: "collecting_contact",
      selectedSessionId: "sesion_blw_bilbao_20260925",
      selectedGroupId: "grupo_blw_bilbao",
      pendingFields: ["fullName", "email", "peopleCount", "babyBirthDate"],
    });
    expect(eventTypes(result)).not.toContain("maternaly_availability_checked");
  });

  it("replaces an active BLW transaction when registration starts for Charla", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }),
    );
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    ).handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          selectedSessionId: "sesion_blw_bilbao_20260925",
          selectedGroupId: "grupo_blw_bilbao",
          fullName: "Ana García",
          phone: "+34600111222",
          email: "ana@example.test",
          peopleCount: 1,
          babyBirthDate: "2025-01-15",
          observations: "dato específico del BLW",
          pendingFields: [],
          idempotencyKey: "old-blw-idempotency-key",
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "quiero apuntarme a la charla informativa de embarazo",
      },
      env: normalizedTestEnv(),
    });

    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(result.state).toMatchObject({
      serviceKey: "charla_embarazo_1_20",
      fullName: "Ana García",
      phone: "+34600111222",
      email: "ana@example.test",
    });
    expect(result.state?.peopleCount).toBeUndefined();
    expect(result.state?.selectedSessionId).not.toBe("sesion_blw_bilbao_20260925");
    expect(result.state?.selectedGroupId).not.toBe("grupo_blw_bilbao");
    expect(result.state?.babyBirthDate).toBeUndefined();
    expect(result.state?.observations).toBeUndefined();
    expect(result.state?.idempotencyKey).not.toBe("old-blw-idempotency-key");
    expect(eventTypes(result)).toContain("maternaly_availability_checked");
  });

  it.each([
    [
      "qué incluye el taller BLW",
      "¿y cuánto dura?",
      "taller_blw",
      "duration",
      /3 horas|17:00 a 20:00/i,
    ],
    [
      "qué incluye la charla informativa",
      "¿y puedo ir con mi pareja?",
      "charla_embarazo_1_20",
      "eligibility",
      /pareja o acompa[nñ]ante/i,
    ],
    [
      "qué beneficios tiene pilates embarazo",
      "¿y en Bilbao?",
      "pilates",
      "locations",
      /Bilbao/i,
    ],
  ])(
    "keeps service context across '%s' followed by '%s'",
    async (firstMessage, followUp, serviceId, focus, replyPattern) => {
      const adapter = new MaternalyCoreAdapter();
      const first = await adapter.handle({
        conversation: fakeConversation(),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: firstMessage,
        },
      });
      const second = await adapter.handle({
        conversation: fakeConversation({
          ...first.conversationPatch,
          messages: [
            {
              id: "msg_user_context",
              conversationId: "conv_authority",
              direction: "inbound",
              senderType: "user",
              transport: "whatsapp",
              body: firstMessage,
              createdAt: "2026-07-16T10:00:00.000Z",
            },
            {
              id: "msg_bot_context",
              conversationId: "conv_authority",
              direction: "outbound",
              senderType: "bot",
              transport: "whatsapp",
              body: first.reply ?? "",
              createdAt: "2026-07-16T10:00:01.000Z",
            },
          ],
          events: [],
        }),
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: followUp,
        },
      });

      expect(second.intent).toMatchObject({
        service_candidate: serviceId,
        service_question_focus: focus,
      });
      expect(second.reply).toMatch(replyPattern);
      expect(second.authorityTrace.policy.action).toBe("service_info");
    },
  );

  it("understands 'the other one' between the two active services", async () => {
    const adapter = new MaternalyCoreAdapter();
    const first = await adapter.handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "qué incluye el taller BLW",
      },
    });
    const second = await adapter.handle({
      conversation: fakeConversation({
        ...first.conversationPatch,
        messages: [],
        events: [],
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "¿y la otra?",
      },
    });

    expect(second.intent).toMatchObject({
      service_candidate: "charla_embarazo_1_20",
      service_question_focus: "general",
    });
    expect(second.reply).toMatch(/charla informativa gratuita|semana 1 y la 20/i);
  });

  it.each([
    ["taller_blw" as const, "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", /45 €\/persona|75 €\/pareja/i],
    ["charla_embarazo_1_20" as const, "sesion_charla_bilbao_20261006", "grupo_charla_bilbao", /charla|gratuita/i],
  ])("keeps %s choosing_session state when pricing is asked as an FAQ", async (
    serviceKey,
    selectedSessionId,
    selectedGroupId,
    replyPattern,
  ) => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey,
          stage: "choosing_session",
          selectedSessionId,
          selectedGroupId,
          updatedAt: "2026-06-25T00:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "precio",
      },
    });

    expect(result.reply).toMatch(replyPattern);
    expect(result.state).toMatchObject({
      serviceKey,
      stage: "choosing_session",
      selectedSessionId,
      selectedGroupId,
    });
    expect(result.authorityTrace.policy).toMatchObject({
      action: "service_info",
      reason: "faq_escape_hatch",
    });
  });

  it("suppresses bot replies after clinical handoff until an explicit reset", async () => {
    const adapter = new MaternalyCoreAdapter();
    const first = await adapter.handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "tengo dolor fuerte y sangrado",
      },
    });
    const humanConversation = fakeConversation({
      ...first.conversationPatch,
      mode: "human",
      humanRequested: true,
    });

    const second = await adapter.handle({
      conversation: humanConversation,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "precio pilates embarazo",
      },
    });

    expect(second.reply).toBeUndefined();
    expect(second.authorityTrace.policy).toMatchObject({
      action: "silent_human",
      reason: "human_mode",
    });

    const reset = await adapter.handle({
      conversation: humanConversation,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "reiniciar",
      },
    });

    expect(reset.reply).toMatch(/reiniciad[ao]|Maternaly/i);
    expect(reset.conversationPatch).toMatchObject({
      mode: "bot",
      humanRequested: false,
      requiresManualReview: false,
    });
  });

  it("answers the concrete service question while retaining pregnancy context from the same turn", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Estoy embarazada de 5 meses, ¿cuánto cuesta Pilates?",
      },
    });

    expect(result.intent).toMatchObject({
      intent: "service_question",
      service_candidate: "pilates",
      service_question_focus: "pricing",
    });
    expect(result.state).toMatchObject({
      journeyStage: "embarazo",
      pregnancyMonth: 5,
    });
    expect(result.reply).toMatch(/59\s*€|99\s*€/i);
    expect(result.reply).not.toMatch(/dime cu[aá]l te interesa|qu[eé] te ayudar[ií]a m[aá]s ahora/i);
  });

  it("lets an explicit current-turn name correct a previously persisted name", async () => {
    const message = "No, me llamo María López, no Marta";
    const intent = new LlmIntentClassifier().classifyWithMock(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: [],
    });
    const reduced = new MaternalyStateReducer().reduceWithDiagnostics({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_online_20260810",
          fullName: "Marta Pérez",
          phone: "+34600111222",
          peopleCount: 1,
          fppOrDueDate: "2026-10-20",
          pendingFields: [],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      intent,
      message,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
    });

    expect(reduced.state.fullName).toBe("María López");
    expect(reduced.diagnostics.fullNameDetected).toBe(true);
  });

  it("preserves a punctuated middle initial as part of the full name", () => {
    const message = "Mi nombre es Ana M. López";
    const intent = new LlmIntentClassifier().classifyWithMock(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fullName"],
    });
    const reduced = new MaternalyStateReducer().reduceWithDiagnostics({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_online_20260810",
          phone: "+34600111222",
          peopleCount: 1,
          fppOrDueDate: "2026-10-20",
          pendingFields: ["fullName"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      intent,
      message,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
    });

    expect(reduced.state.fullName).toBe("Ana M. López");
    expect(reduced.diagnostics.fullNameDetected).toBe(true);
  });

  it.each(["somos mi chico y yo", "vendremos ambos", "mi marido y yo", "asistiremos las dos"])(
    "persists two attendees from the natural pending-field answer '%s'",
    (message) => {
      const intent = new LlmIntentClassifier().classifyWithMock(message, {
        active_service_id: "charla_embarazo_1_20",
        active_normalized_service_key: "charla_embarazo_1_20",
        active_stage: "collecting_contact",
        pending_fields: ["peopleCount"],
      });
      const reduced = new MaternalyStateReducer().reduceWithDiagnostics({
        conversation: fakeConversation({
          maternalyNormalizedFlow: {
            serviceKey: "charla_embarazo_1_20",
            stage: "collecting_contact",
            selectedSessionId: "sesion_charla_bilbao_20261006",
            phone: "+34600111222",
            fullName: "Ana López",
            fppOrDueDate: "2026-10-20",
            pendingFields: ["peopleCount"],
            updatedAt: "2026-07-17T12:00:00.000Z",
          },
        }),
        intent,
        message,
        inbound: {
          provider: "twilio_sandbox",
          from: "whatsapp:+34600111222",
          text: message,
        },
      });

      expect(reduced.state.peopleCount).toBe(2);
      expect(reduced.diagnostics.peopleCountDetected).toBe(true);
    },
  );

  it("normalizes a worded due date using the nearest reasonable year", () => {
    const message = "mi fecha probable es el catorce de octubre";
    const now = new Date();
    const thisYearCandidate = new Date(Date.UTC(now.getUTCFullYear(), 9, 14));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expectedYear = thisYearCandidate.getTime() < today.getTime()
      ? now.getUTCFullYear() + 1
      : now.getUTCFullYear();
    const intent = new LlmIntentClassifier().classifyWithMock(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fppOrDueDate"],
    });
    const reduced = new MaternalyStateReducer().reduceWithDiagnostics({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          phone: "+34600111222",
          fullName: "Ana López",
          peopleCount: 1,
          pendingFields: ["fppOrDueDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      intent,
      message,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
    });

    expect(reduced.state.fppOrDueDate).toBe(`${expectedYear}-10-14`);
  });

  it("reduces the exact combined registration payload without leaking conjunctions into the name", () => {
    const message =
      "Mi nombre es Paola Esto Es Una Prueba y mi pareja Manolo. fecha probable de parto 14 de Oct";
    const now = new Date();
    const thisYearCandidate = new Date(Date.UTC(now.getUTCFullYear(), 9, 14));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const expectedYear = thisYearCandidate.getTime() < today.getTime()
      ? now.getUTCFullYear() + 1
      : now.getUTCFullYear();
    const intent = new LlmIntentClassifier().classifyWithMock(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fullName", "partnerName", "fppOrDueDate"],
    });
    const reduced = new MaternalyStateReducer().reduceWithDiagnostics({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          phone: "+34600111222",
          peopleCount: 2,
          pendingFields: ["fullName", "partnerName", "fppOrDueDate"],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      intent,
      message,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
    });

    expect(reduced.state).toMatchObject({
      fullName: "Paola Esto Es Una Prueba",
      partnerName: "Manolo",
      fppOrDueDate: `${expectedYear}-10-14`,
    });
  });

  it("accepts the combined pending-name reply without requiring a name prefix", () => {
    const message =
      "Paola Esto Es Una Prueba y mi pareja Manolo, fecha probable de parto 14 de Oct";
    const intent = new LlmIntentClassifier().classifyWithMock(message, {
      active_service_id: "charla_embarazo_1_20",
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "collecting_contact",
      pending_fields: ["fullName", "partnerName", "fppOrDueDate"],
    });
    const reduced = new MaternalyStateReducer().reduceWithDiagnostics({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          phone: "+34600111222",
          peopleCount: 2,
          pendingFields: ["fullName", "partnerName", "fppOrDueDate"],
          updatedAt: "2026-08-17T12:00:00.000Z",
        },
      }),
      intent,
      message,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
    });

    expect(reduced.state).toMatchObject({
      fullName: "Paola Esto Es Una Prueba",
      partnerName: "Manolo",
    });
    expect(reduced.state.fppOrDueDate).toMatch(/-10-14$/);
  });

  it("uses the corrected ordinal instead of the rejected one", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        multiSession: true,
        sessionCapacity: "14",
      }),
    );
    const adapter = new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    );
    const result = await adapter.handle({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "choosing_session",
          pendingFields: [],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "la primera no, mejor la segunda",
      },
      env: normalizedTestEnv(),
    });

    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(result.state?.selectedSessionId).toBe("sesion_charla_bilbao_20261006");
  });

  it("selects the unique visible session by day in 'la del diez'", async () => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      multiSession: true,
      sessionCapacity: "14",
    }) as Record<string, unknown[][]>;
    workbook.Grupos_Ediciones.push([
      "grupo_charla_online",
      "charla_embarazo_1_20",
      "Charla Online",
      "Online",
      "Online",
      "14",
      "Activa",
      "sí",
      "sí",
    ]);
    workbook.Sesiones.push([
      "sesion_charla_online_20261010",
      "grupo_charla_online",
      "charla_embarazo_1_20",
      "2026-10-10",
      "19:00",
      "20:30",
      "Online",
      "Online",
      "Activa",
      "14",
      "0",
      "14",
      "sí",
      "sí",
      "",
    ]);
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(new InMemoryNormalizedSheetsClient(workbook)),
    ).handle({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "choosing_session",
          pendingFields: [],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "la del diez",
      },
      env: normalizedTestEnv(),
    });

    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(result.state?.selectedSessionId).toBe("sesion_charla_online_20261010");
  });

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
  ])("routes the habitual cancellation '%s' to the cancellation action", (message) => {
    const conversation = fakeConversation({
      maternalyNormalizedFlow: {
        serviceKey: "charla_embarazo_1_20",
        stage: "confirmed",
        selectedSessionId: "sesion_charla_bilbao_20261006",
        selectedGroupId: "grupo_charla_bilbao",
        fullName: "Ana López",
        phone: "+34600111222",
        peopleCount: 1,
        fppOrDueDate: "2026-10-20",
        pendingFields: [],
        updatedAt: "2026-07-17T12:00:00.000Z",
      },
    });
    const intent = new LlmIntentClassifier().classifyWithMock(message, {
      active_normalized_service_key: "charla_embarazo_1_20",
      active_stage: "confirmed",
    });
    const state = new MaternalyStateReducer().reduce({
      conversation,
      intent,
      message,
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
    });
    const decision = new MaternalyConversationPolicy().decide({
      conversation,
      intent,
      state,
    });

    expect(intent.safety_flags).toContain("cancel_registration_request");
    expect(decision).toMatchObject({
      action: "cancel_registration",
      serviceKey: "charla_embarazo_1_20",
      reason: "explicit_registration_cancellation",
    });
  });

  it.each([
    "¿Está confirmada mi reserva?",
    "Quería comprobar el estado de mi reserva",
    "¿Mi plaza sigue confirmada?",
  ])("checks reservation status read-only for '%s'", async (message) => {
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      registrations: [[
        "INS_STATUS_1",
        "CLI_STATUS_1",
        "Ana",
        "López",
        "+34600111222",
        "grupo_charla_bilbao",
        "charla_embarazo_1_20",
        "2026-08-17",
        "whatsapp",
        "0 €",
        "no_aplica",
        "Confirmada",
        "2027-01-15",
        "",
        "",
        "session:sesion_charla_bilbao_20261006 | personas:1",
      ]],
    });
    const client = new InMemoryNormalizedSheetsClient(workbook);
    const adapter = new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    );
    const result = await adapter.handle({
      conversation: fakeConversation({
        maternalyReservationStatus: "confirmed",
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "confirmed",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          selectedGroupId: "grupo_charla_bilbao",
          updatedAt: "2026-08-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: message,
      },
      env: normalizedTestEnv(),
    });

    expect(result.authorityTrace.policy.action).toBe("reservation_status");
    expect(result.reply).toMatch(/figura activa y confirmada/i);
    expect(result.conversationPatch.maternalyReservationStatus).toBe("confirmed");
    expect(client.appended).toHaveLength(0);
    expect(client.updatedCells).toHaveLength(0);
  });

  it("does not recreate an externally removed reservation during a status query", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }),
    );
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    ).handle({
      conversation: fakeConversation({
        maternalyReservationStatus: "confirmed",
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "confirmed",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          selectedGroupId: "grupo_charla_bilbao",
          updatedAt: "2026-08-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "¿Está confirmada mi reserva?",
      },
      env: normalizedTestEnv(),
    });

    expect(result.authorityTrace.policy.action).toBe("reservation_status");
    expect(result.reply).toMatch(/no encuentro una inscripci[oó]n activa/i);
    expect(result.conversationPatch.maternalyReservationStatus).toBe("none");
    expect(result.state).toMatchObject({
      stage: "collecting_service",
      pendingFields: [],
    });
    expect(result.state?.selectedSessionId).toBeUndefined();
    expect(result.state?.selectedGroupId).toBeUndefined();
    expect(result.conversationPatch.mode).toBe("human");
    expect(client.appended).toHaveLength(0);
    expect(client.updatedCells).toHaveLength(0);
  });

  it("lists alternatives without reusing or reconfirming the already booked session", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        multiSession: true,
        sessionCapacity: "14",
      }),
    );
    const adapter = new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    );
    const result = await adapter.handle({
      conversation: fakeConversation({
        maternalyReservationStatus: "confirmed",
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "confirmed",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          selectedGroupId: "grupo_charla_bilbao",
          fullName: "Ana López",
          phone: "+34600111222",
          peopleCount: 1,
          fppOrDueDate: "2027-03-31",
          updatedAt: "2026-08-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "¿Qué otras fechas hay?",
      },
      env: normalizedTestEnv(),
    });

    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(result.reply).toMatch(/sesiones publicadas|opciones para|dime cu[aá]l prefieres/i);
    expect(result.reply).not.toMatch(/reserva ha quedado confirmada/i);
    expect(result.state?.selectedSessionId).toBeUndefined();
    expect(result.state?.rescheduleReviewRequired).toBe(true);
    expect(client.appended).toHaveLength(0);

    const selection = await adapter.handle({
      conversation: fakeConversation({
        maternalyReservationStatus: "confirmed",
        maternalyNormalizedFlow: result.state,
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "Opción 1",
      },
      env: normalizedTestEnv(),
    });

    expect(selection.authorityTrace.policy).toMatchObject({
      action: "handoff",
      reason: "confirmed_registration_change_requires_human",
    });
    expect(selection.conversationPatch.mode).toBe("human");
    expect(client.appended).toHaveLength(0);
  });

  it("does not confirm Charla when the known gestational stage is outside weeks 1 to 20", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({
        serviceKey: "charla_embarazo_1_20",
        multiSession: true,
        sessionCapacity: "14",
      }),
    );
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    ).handle({
      conversation: fakeConversation({
        maternalyNormalizedFlow: {
          serviceKey: "charla_embarazo_1_20",
          stage: "collecting_contact",
          selectedSessionId: "sesion_charla_bilbao_20261006",
          selectedGroupId: "grupo_charla_bilbao",
          fullName: "Ana López",
          phone: "+34600111222",
          peopleCount: 1,
          pregnancyMonth: 6,
          fppOrDueDate: "2026-12-20",
          updatedAt: "2026-08-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "quiero continuar con la cita",
      },
      env: normalizedTestEnv({
        MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
        GOOGLE_SHEETS_ACCESS_MODE: "live",
        BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
      }),
    });

    expect(result.reply).toMatch(/semanas 1 y 20|fuera de ese tramo/i);
    expect(result.reply).toMatch(/no he reservado/i);
    expect(result.conversationPatch.mode).toBe("human");
    expect(client.appended).toHaveLength(0);
  });

  it("returns to the transactional service after an informational service detour", async () => {
    const client = new InMemoryNormalizedSheetsClient(
      createRealTemplateWorkbook({ serviceKey: "taller_blw" }),
    );
    const result = await new MaternalyCoreAdapter(
      undefined,
      undefined,
      undefined,
      new MaternalyToolExecutor(client),
    ).handle({
      conversation: fakeConversation({
        serviceDetected: "Pilates Embarazo",
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "choosing_session",
          pendingFields: [],
          updatedAt: "2026-07-17T12:00:00.000Z",
        },
      }),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "continuar con la cita",
      },
      env: normalizedTestEnv(),
    });

    expect(result.intent).toMatchObject({
      intent: "registration_start",
      service_candidate: "taller_blw",
    });
    expect(result.authorityTrace.policy.action).toBe("normalized_registration");
    expect(result.state?.serviceKey).toBe("taller_blw");
    expect(result.reply).toMatch(/BLW|opciones/i);
  });
});
