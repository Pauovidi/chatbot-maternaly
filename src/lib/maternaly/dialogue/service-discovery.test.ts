import { afterEach, describe, expect, it, vi } from "vitest";
import { MaternalyCoreAdapter, MaternalyToolExecutor } from "@/lib/maternaly/conversation/core";
import { InMemoryNormalizedSheetsClient, createRealTemplateWorkbook } from "@/lib/maternaly/sheets/normalized-test-utils";
import { dialogueTestConversation } from "./evaluation";
import { isolatedDialogueEnv } from "./conversation-evaluation";
import { dialogueIntent, type DialogueUnderstanding } from "./understanding";
import type { MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";

const noCatalog = /Estos son los servicios|Test ADN fetal|Detesex|Unidad de Psicología/;
function interpretation(overrides: Partial<DialogueUnderstanding> = {}): DialogueUnderstanding {
  return { goal: "explore", scope: "explicit", serviceId: "charla_embarazo_1_20", authorization: "none", actionEvidence: null,
    clinical: false, updates: [], questions: [], ambiguities: [], selection: { sessionId: null, evidence: null }, ...overrides };
}
function harness(fresh = true, state: Partial<MaternalyNormalizedFlowState> = {}) {
  const client = new InMemoryNormalizedSheetsClient(createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }));
  const core = new MaternalyCoreAdapter(undefined, undefined, undefined, new MaternalyToolExecutor(client));
  let conversation = dialogueTestConversation(state);
  if (fresh) conversation = { ...conversation, messages: [], maternalyNormalizedFlow: undefined };
  return {
    client,
    async turn(message: string, d: DialogueUnderstanding) {
      vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.text?.format?.name !== "maternaly_dialogue_v1") throw new Error("Unexpected network request blocked");
        return new Response(JSON.stringify({ status: "completed", model: "synthetic-model", output_text: JSON.stringify(d) }));
      }));
      const result = await core.handle({ conversation, inbound: { provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: message },
        env: isolatedDialogueEnv({ NODE_ENV: "test", OPENAI_API_KEY: "synthetic-key" }) });
      conversation = { ...conversation, ...result.conversationPatch, messages: [...conversation.messages,
        { id: `u-${conversation.messages.length}`, conversationId: conversation.id, direction: "inbound", senderType: "user", transport: "whatsapp", body: message, createdAt: new Date().toISOString() },
        { id: `b-${conversation.messages.length}`, conversationId: conversation.id, direction: "outbound", senderType: "bot", transport: "whatsapp", body: result.reply ?? "", createdAt: new Date().toISOString() },
      ] };
      expect(client.appended).toHaveLength(0);
      expect(client.updatedCells).toHaveLength(0);
      return result;
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("service discovery is not a booking or a catalogue loop", () => {
  it.each(["explicit", "contextual"] as const)("maps a focused exploration to service information (%s)", (scope) => {
    const intent = dialogueIntent(interpretation({ scope }));
    expect(intent.intent).toBe("service_question");
    expect(intent.service_candidate).toBe("charla_embarazo_1_20");
    expect(intent.needs_availability_lookup).toBe(false);
  });

  it.each(["Charla informativa", "la primera", "esa charla", "Me interesa la charla gratuita"])("retains the chosen service and answers repeated interest: %s", async (message) => {
    const h = harness();
    await h.turn("Estoy embarazada", interpretation({ serviceId: null, scope: "catalog", updates: [
      { field: "journey_stage", value: "embarazo", evidence: "Estoy embarazada", correction: false },
    ] }));
    for (let repetition = 0; repetition < 2; repetition++) {
      const result = await h.turn(message, interpretation({ scope: message === "la primera" || message === "esa charla" ? "contextual" : "explicit" }));
      expect(result.authorityTrace.policy.action).toBe("service_info");
      expect(result.state).toMatchObject({ serviceKey: "charla_embarazo_1_20", stage: "awaiting_booking_decision", journeyStage: "embarazo" });
      expect(result.reply).toMatch(/matronas/i);
      expect(result.reply).toMatch(/alimentación|autocuidados/i);
      expect(result.reply).not.toMatch(noCatalog);
      expect(result.state?.selectedSessionId).toBeUndefined();
    }
  });

  it.each(["explore", "ask"] as const)("explains a named service with personal context and no explicit question (%s)", async (goal) => {
    const result = await harness().turn("Estoy embarazada y me interesa la charla", interpretation({ goal, updates: [
      { field: "journey_stage", value: "embarazo", evidence: "Estoy embarazada", correction: false },
    ] }));
    expect(result.reply).toMatch(/matronas/i);
    expect(result.reply).not.toMatch(noCatalog);
    expect(result.state?.serviceKey).toBe("charla_embarazo_1_20");
  });

  it("allows returning to the general catalogue deliberately", async () => {
    const h = harness();
    await h.turn("Charla informativa", interpretation());
    const result = await h.turn("¿Qué otros servicios ofrecéis?", interpretation({ scope: "catalog", serviceId: null }));
    expect(result.authorityTrace.policy.action).toBe("catalog_info");
  });

  it("asks for clarification when a service reference is ambiguous", async () => {
    const result = await harness().turn("esa", interpretation({ serviceId: null, scope: "contextual", ambiguities: [
      { field: "service", question: "¿A qué servicio te refieres?", evidence: "esa" },
    ] }));
    expect(result.authorityTrace.policy.action).toBe("dialogue_response");
    expect(result.reply).toMatch(/aclararme el servicio/);
    expect(result.reply).not.toMatch(noCatalog);
  });

  it("can switch the informational topic to BLW without starting a booking", async () => {
    const h = harness();
    await h.turn("Charla informativa", interpretation());
    const result = await h.turn("Ahora cuéntame sobre BLW", interpretation({ serviceId: "taller_blw" }));
    expect(result.authorityTrace.policy.action).toBe("service_info");
    expect(result.reply).toMatch(/alimentación complementaria/i);
    expect(result.reply).not.toMatch(noCatalog);
    expect(result.state?.serviceKey).toBe("taller_blw");
    expect(result.state?.selectedSessionId).toBeUndefined();
  });

  it("answers service interest without replacing a booking already in progress", async () => {
    const result = await harness(false).turn("Cuéntame sobre BLW", interpretation({ serviceId: "taller_blw" }));
    expect(result.state).toMatchObject({ serviceKey: "charla_embarazo_1_20", stage: "collecting_contact", selectedSessionId: "sesion_charla_erandio_20260924" });
    expect(result.reply).toMatch(/alimentación complementaria/i);
    expect(result.reply).not.toMatch(noCatalog);
  });

  it.each(["charla_embarazo_1_20", "taller_blw"])("preserves a confirmed registration while explaining %s", async (serviceId) => {
    const result = await harness(false, { stage: "confirmed", pendingFields: [] }).turn("Quiero información", interpretation({ serviceId }));
    expect(result.state).toMatchObject({ serviceKey: "charla_embarazo_1_20", stage: "confirmed", selectedSessionId: "sesion_charla_erandio_20260924" });
    expect(result.reply).toMatch(serviceId === "taller_blw" ? /alimentación complementaria/i : /matronas/i);
  });
});
