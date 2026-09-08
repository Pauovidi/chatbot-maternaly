import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDialogueContext, dialogueIntent, validateDialogue, redactDialogueContact, type DialogueUnderstanding } from "./understanding";
import { dialogueTestConversation } from "./evaluation";
import { validateDialogueAnswer } from "./answer";
import { MaternalyCoreAdapter, MaternalyToolExecutor } from "@/lib/maternaly/conversation/core";
import { InMemoryNormalizedSheetsClient, createRealTemplateWorkbook, normalizedTestEnv } from "@/lib/maternaly/sheets/normalized-test-utils";

function understanding(overrides: Partial<DialogueUnderstanding> = {}): DialogueUnderstanding {
  return { actionEvidence: null, goal: "ask", serviceId: "charla_embarazo_1_20", scope: "contextual", authorization: "none", clinical: false,
    updates: [], questions: [], ambiguities: [], selection: { sessionId: null, evidence: null }, ...overrides };
}
const env = () => normalizedTestEnv({ MATERNALY_DIALOGUE_MODE: "active", OPENAI_API_KEY: "synthetic-key", LLM_PROVIDER: "openai" });
function mockModel(d: DialogueUnderstanding) {
  return vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const result = body.text.format.name === "maternaly_dialogue_v1" ? d : { answer: "La charla permite acudir con acompañante.", usedFactIds: ["charla_embarazo_1_20:2"] };
    return new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify(result) }));
  }));
}
describe("semantic dialogue boundary and flow", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-08T10:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("rejects invented evidence, names, duplicate fields and unoffered session ids", () => {
    expect(validateDialogue(understanding({ updates: [{ field: "full_name", value: "Ana García", evidence: "Ana García", correction: false }] }), "hola")).toBeUndefined();
    expect(validateDialogue(understanding({ selection: { sessionId: "invented", evidence: "la segunda" } }), "la segunda")).toBeUndefined();
    const update = { field: "full_name" as const, value: "Ana García", evidence: "Ana García", correction: false };
    expect(validateDialogue(understanding({ updates: [update, update] }), "Ana García")).toBeUndefined();
    expect(validateDialogue(understanding({ updates: [{ ...update, value: "Otra Persona" }] }), "Ana García")).toBeUndefined();
  });
  it("does not erase dates when masking contact details", () => {
    expect(redactDialogueContact("FPP 2027-04-05; +34 600 111 222; ana@example.test")).toBe("FPP 2027-04-05; [telefono]; [email]");
  });
  it("supplies confirmed facts even when they are outside the recent history", () => {
    const context = buildDialogueContext(dialogueTestConversation({ fullName: "Ana García", fppOrDueDate: "2027-04-05" }));
    expect(context.memory).toMatchObject({ fullName: "Ana García", fppOrDueDate: "2027-04-05" });
    expect(context.memory).not.toHaveProperty("phone");
  });
  it("does not replace the booking service when answering about Pilates", () => {
    const state = dialogueTestConversation().maternalyNormalizedFlow;
    const d = understanding({ serviceId: "pilates", scope: "explicit", questions: [{ text: "¿Es presencial?", evidence: "¿Es presencial?", serviceId: "pilates", focus: "locations" }] });
    expect(dialogueIntent(d, state).slots.normalized_service_key).toBe("charla_embarazo_1_20");
  });
  it("rejects generated prices, unknown sources and fabricated confirmations", () => {
    const facts = [{ id: "blw:1", service: "BLW", text: "45 € por persona." }];
    expect(validateDialogueAnswer({ answer: "Cuesta 99 €", usedFactIds: ["blw:1"] }, facts)).toBeUndefined();
    expect(validateDialogueAnswer({ answer: "He reservado tu plaza", usedFactIds: ["blw:1"] }, facts)).toBeUndefined();
    expect(validateDialogueAnswer({ answer: "Cuesta 45 €", usedFactIds: ["invented"] }, facts)).toBeUndefined();
    expect(validateDialogueAnswer({ answer: "Cuesta 45 € por persona.", usedFactIds: ["blw:1"] }, facts)).toBeTruthy();
  });
  it("persists semantic names without capitalization rules, gets phone from transport and asks to correct a past FPP", async () => {
    const d = understanding({ goal: "continue", updates: [
      { field: "full_name", value: "elena garcía lópez", evidence: "elena garcía lópez", correction: false },
      { field: "partner_name", value: "Mario", evidence: "Mario", correction: false },
      { field: "fpp_or_due_date", value: "2026-04-05", evidence: "5/04/2026", correction: false },
    ] });
    mockModel(d);
    const client = new InMemoryNormalizedSheetsClient(createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }));
    const result = await new MaternalyCoreAdapter(undefined, undefined, undefined, new MaternalyToolExecutor(client)).handle({ conversation: dialogueTestConversation(), inbound: { provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: "elena garcía lópez\nMario\n5/04/2026" }, env: env() });
    expect(result.state).toMatchObject({ fullName: "elena garcía lópez", partnerName: "Mario", phone: "+34999000999", pendingFields: ["fppOrDueDate"], stage: "collecting_contact" });
    expect(result.reply).toMatch(/pasada/);
    expect(client.appended).toHaveLength(0);
  });
  it("saves corrections and answers an intermediate question without writing a reservation", async () => {
    const d = understanding({ goal: "continue", updates: [{ field: "fpp_or_due_date", value: "2027-04-05", evidence: "2027", correction: true }],
      questions: [{ text: "¿Puede venir mi madre?", evidence: "¿Puede venir mi madre?", serviceId: "charla_embarazo_1_20", focus: "eligibility" }] });
    mockModel(d);
    const client = new InMemoryNormalizedSheetsClient(createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20" }));
    const result = await new MaternalyCoreAdapter(undefined, undefined, undefined, new MaternalyToolExecutor(client)).handle({ conversation: dialogueTestConversation({ fullName: "Elena García", partnerName: "Mario", fppOrDueDate: "2026-04-05" }), inbound: { provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: "Perdón, 2027. ¿Puede venir mi madre?" }, env: env() });
    expect(result.state).toMatchObject({ selectedSessionId: "sesion_charla_erandio_20260924", fppOrDueDate: "2027-04-05", fullName: "Elena García", peopleCount: 2 });
    expect(result.authorityTrace.policy.action).toBe("dialogue_response");
    expect(result.reply).toMatch(/acompañante/);
    expect(client.appended).toHaveLength(0);
  });
  it("fails closed on model failure and retains the selected session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const result = await new MaternalyCoreAdapter().handle({ conversation: dialogueTestConversation(), inbound: { provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: "sí" }, env: env() });
    expect(result.authorityTrace.policy.action).toBe("dialogue_response");
    expect(result.state?.selectedSessionId).toBe("sesion_charla_erandio_20260924");
    expect(result.reply).toMatch(/No he podido interpretar/);
    expect(result.reply).not.toMatch(/Soy Ane/);
  });
});
