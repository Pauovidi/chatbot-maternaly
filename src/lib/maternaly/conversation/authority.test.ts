import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationRecord } from "@/lib/hotel/conversations/types";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { MaternalyCoreAdapter } from "@/lib/maternaly/conversation/core";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import { validateStructuredIntent } from "@/lib/maternaly/llm/interpreter";

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
      message: "Otra respuesta visible indebida",
      confidence: 0.9,
      needs_availability_lookup: false,
      missing_fields: [],
      safety_flags: [],
    });

    expect((intent as unknown as { reply?: string }).reply).toBeUndefined();
    expect((intent as unknown as { message?: string }).message).toBeUndefined();
    expect(intent.safety_flags).toEqual(
      expect.arrayContaining([
        "nlu_visible_copy_field_stripped:reply",
        "nlu_visible_copy_field_stripped:message",
      ]),
    );
  });

  it("routes clinical warning signs through professional handoff copy", async () => {
    const result = await new MaternalyCoreAdapter().handle({
      conversation: fakeConversation(),
      inbound: {
        provider: "twilio_sandbox",
        from: "whatsapp:+34600111222",
        text: "tengo dolor fuerte y sangrado, puedo hacer pilates embarazo",
      },
    });

    expect(result.intent).toMatchObject({
      should_handoff: true,
      service_candidate: "pilates",
    });
    expect(result.intent.safety_flags).toContain("clinical_or_diagnostic_escalation");
    expect(result.reply).toMatch(/profesional|equipo de Maternaly/i);
    expect(result.reply).toMatch(/No puedo hacer diagn[oó]stico/i);
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
  });
});
