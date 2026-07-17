import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationRecord } from "@/lib/hotel/conversations/types";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { MaternalyCoreAdapter } from "@/lib/maternaly/conversation/core";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import { validateStructuredIntent } from "@/lib/maternaly/llm/interpreter";

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

  it("answers an online question before resuming a pending BLW registration", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation({
        serviceDetected: "Taller BLW",
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

    expect(result.authorityTrace.policy.action).toBe("service_info");
    expect(result.reply).toMatch(/no tiene modalidad online|presencial/i);
    expect(result.reply).not.toMatch(/me faltan|email|fecha de nacimiento del beb[eé]/i);
    expect(result.state).toMatchObject({
      serviceKey: "taller_blw",
      selectedSessionId: "sesion_blw_erandio_20261007",
    });
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
    expect(second.reply).toContain(first.reply);
    expect(eventTypes(second)).toContain("maternaly_copy_repetition_avoided");
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

    expect(reset.reply).toMatch(/reiniciado|Maternaly/i);
    expect(reset.conversationPatch).toMatchObject({
      mode: "bot",
      humanRequested: false,
      requiresManualReview: false,
    });
  });
});
