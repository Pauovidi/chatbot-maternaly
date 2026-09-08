import { afterEach, describe, expect, it, vi } from "vitest";
import { understandDialogue, validateDialogue, dialogueSchemaForConversation, type DialogueUnderstanding } from "./understanding";
import { CONVERSATION_EVALUATIONS, isolatedDialogueEnv, runConversationEvaluation } from "./conversation-evaluation";
import { dialogueTestConversation } from "./evaluation";
import { MaternalyCoreAdapter, MaternalyToolExecutor } from "@/lib/maternaly/conversation/core";
import { InMemoryNormalizedSheetsClient, createRealTemplateWorkbook } from "@/lib/maternaly/sheets/normalized-test-utils";
import { dialogueFacts, validateDialogueAnswer } from "./answer";

const d = (patch: Partial<DialogueUnderstanding> = {}): DialogueUnderstanding => ({ actionEvidence: null, goal: "continue", serviceId: "charla_embarazo_1_20", scope: "contextual", authorization: "none", clinical: false, updates: [], questions: [], ambiguities: [], selection: { sessionId: null, evidence: null }, ...patch });
const env = () => isolatedDialogueEnv({ NODE_ENV: "test", OPENAI_API_KEY: "synthetic-key" });
describe("dialogue safety regression matrix", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("isolates secrets and destinations even if the host has live credentials", () => {
    const isolated = isolatedDialogueEnv({ NODE_ENV: "test", OPENAI_API_KEY: "synthetic-key", DATABASE_URL: "real-db", TWILIO_AUTH_TOKEN: "real-token", MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "real-sheet", GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: "real-google", MATERNALY_REMINDERS_ENABLED: "true" });
    expect(isolated.DATABASE_URL).toBe("");
    expect(isolated.TWILIO_AUTH_TOKEN).toBeUndefined();
    expect(isolated.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64).toBe("");
    expect(isolated.MATERNALY_CHARLA_EMBARAZO_SHEET_ID).toBe("sheet_charla");
    expect(isolated.WHATSAPP_PROVIDER).toBe("mock");
    expect(isolated.MATERNALY_REMINDERS_ENABLED).toBe("false");
  });
  it("constrains generated session IDs to the actually displayed options", () => {
    const schema = dialogueSchemaForConversation(dialogueTestConversation());
    expect(schema.properties.selection.properties.sessionId.enum).toEqual([null]);
    const withMenu = dialogueSchemaForConversation(dialogueTestConversation({ dialogueMemory: { offeredSessions: [{ sessionId: "shown-1" }], pendingQuestions: [] } }));
    expect(withMenu.properties.selection.properties.sessionId.enum).toEqual(["shown-1", null]);
  });
  it("accepts only punctuation-equivalent evidence, not invented questions", () => {
    const question = { text: "¿Dónde está el centro?", evidence: "¿dónde está el centro?", serviceId: "charla_embarazo_1_20", focus: "locations" as const };
    expect(validateDialogue(d({ questions: [question] }), "solo saber dónde está el centro")).toBeTruthy();
    expect(validateDialogue(d({ questions: [{ ...question, evidence: "¿puedes confirmarla?" }] }), "Perdón, 2027")).toBeUndefined();
  });
  it.each(["hola de nuevo", "Elena García", "Perdón, 2027", "¿Cuánto dura?"])("rejects inherited session selection without current evidence: %s", (message) => {
    expect(validateDialogue(d({ selection: { sessionId: "sesion_charla_erandio_20260924", evidence: "Dime tus datos" } }), message, dialogueTestConversation().maternalyNormalizedFlow)).toBeUndefined();
    expect(validateDialogue(d(), message, dialogueTestConversation().maternalyNormalizedFlow)).toBeTruthy();
  });
  it.each(["No quiero cancelar", "¿Cómo se cancela?", "Si cancelara, ¿me devolveríais el dinero?"])("never authorizes cancellation from a misleading model output: %s", (message) => {
    expect(validateDialogue(d({ goal: "cancel", actionEvidence: message }), message)).toBeUndefined();
  });
  it.each(["Hola", "No empecemos de cero", "¿Se puede reiniciar?"])("does not accept an unjustified reset: %s", (message) => {
    expect(validateDialogue(d({ goal: "reset", actionEvidence: message }), message)).toBeUndefined();
  });
  it.each([401, 429, 500, 503])("fails closed without writes on HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status })));
    const client = new InMemoryNormalizedSheetsClient(createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }));
    const result = await new MaternalyCoreAdapter(undefined, undefined, undefined, new MaternalyToolExecutor(client)).handle({ conversation: dialogueTestConversation({ fullName: "Elena García", partnerName: "Mario", fppOrDueDate: "2027-04-05", phone: "+34999000999", pendingFields: [] }), inbound: { provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: "Sí, confirma" }, env: env() });
    expect(result.reply).toMatch(/No he podido interpretar/);
    expect(result.state?.selectedSessionId).toBe("sesion_charla_erandio_20260924");
    expect(client.appended).toHaveLength(0);
    expect(client.updatedCells).toHaveLength(0);
  });
  it.each([{}, { status: "incomplete" }, { output_text: "not-json" }, { output_text: "null" }])("rejects malformed or incomplete model responses: %j", async (payload) => {
    const result = await understandDialogue("Sí", dialogueTestConversation(), env(), vi.fn(async () => new Response(JSON.stringify(payload))));
    expect(result.reason).toBe("invalid_output");
    expect(result.understanding).toBeUndefined();
  });
  it("recognizes an aborted request as a timeout", async () => {
    const result = await understandDialogue("Sí", dialogueTestConversation(), env(), vi.fn(async () => { throw new DOMException("Timed out", "AbortError"); }));
    expect(result.reason).toBe("timeout");
  });
  it.each(["¿Y si fuésemos tres en vez de dos?", "Podríamos venir tres?"])("rejects fact updates supported only by a question: %s", (message) => {
    expect(validateDialogue(d({ updates: [{ field: "people_count", value: "3", evidence: message, correction: false }] }), message)).toBeUndefined();
  });
  it("retains factual evidence before a separate question", () => {
    expect(validateDialogue(d({ updates: [{ field: "full_name", value: "Ana García", evidence: "Ana García", correction: false }] }), "Ana García. ¿Puede venir mi madre?")).toBeTruthy();
    expect(validateDialogue(d({ updates: [{ field: "full_name", value: "Ana García", evidence: "Ana García", correction: false }] }), "Ana García\ncuánto cuesta?")).toBeTruthy();
  });
  it("discards hypothetical data while retaining the question and independent facts", () => {
    const quote = "Si se apunta mi hermana seríamos 3, ¿se podría?";
    const parsed = validateDialogue(d({ goal: "ask", questions: [{ text: quote, evidence: quote, focus: "eligibility", serviceId: "charla_embarazo_1_20" }], updates: [
      { field: "full_name", value: "Ana García", evidence: "Ana García", correction: false },
      { field: "people_count", value: "3", evidence: quote, correction: false },
    ] }), `Ana García. ${quote}`);
    expect(parsed?.questions).toHaveLength(1);
    expect(parsed?.updates.map((u) => u.field)).toEqual(["full_name"]);
  });
  it("accepts quote delimiters without changing words or cancellation authority", () => {
    const parsed = validateDialogue(d({ goal: "decline", authorization: "decline", actionEvidence: '"no canceles nada"' }), "Mi marido se equivocó; no canceles nada");
    expect(parsed?.goal).toBe("decline");
    expect(validateDialogue(d({ goal: "cancel", actionEvidence: '"canceles"' }), "no canceles nada")).toBeUndefined();
  });
  it("does not let a failed model turn a negated cancellation into a human-mode reset", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const result = await new MaternalyCoreAdapter().handle({ conversation: dialogueTestConversation({ stage: "confirmed" }), inbound: {
      provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: "Mi marido escribió 'quiero cancelar' por error; no canceles nada",
    }, env: env() });
    expect(result.authorityTrace.policy.action).toBe("dialogue_response");
    expect(result.state?.stage).toBe("confirmed");
    expect(result.conversationPatch.mode).not.toBe("human");
  });
  it("never persists a value the model simultaneously marks uncertain", () => {
    const message = "Yo Ana y él Pablo";
    const result = validateDialogue(d({ updates: [
      { field: "full_name", value: "Ana", evidence: "Ana", correction: false },
      { field: "partner_name", value: "Pablo", evidence: "Pablo", correction: false },
    ], ambiguities: [{ field: "full_name", question: "¿Cuáles son tus apellidos?", evidence: "Ana" }] }), message);
    expect(result?.updates).toEqual([{ field: "partner_name", value: "Pablo", evidence: "Pablo", correction: false }]);
    expect(result?.ambiguities).toHaveLength(1);
  });
  it("derives BLW duration from the verified timetable", () => {
    expect(dialogueFacts(d({ serviceId: "taller_blw" })).some((f) => f.text.includes("Duración del taller: 3 horas"))).toBe(true);
  });
  it("allows a sourced talk topic but not medication instructions", () => {
    const facts = [{ id: "topic", service: "Charla", text: "Trata medicación segura para el bebé." }];
    expect(validateDialogueAnswer({ answer: "La charla trata medicación segura para el bebé.", usedFactIds: ["topic"] }, facts)).toBeTruthy();
    expect(validateDialogueAnswer({ answer: "Cambia tu medicación.", usedFactIds: ["topic"] }, facts)).toBeUndefined();
  });
  it("rejects an unsupported company assertion with no source", () => {
    expect(validateDialogueAnswer({ answer: "La empresa para la factura es Maternaly.", usedFactIds: [] }, [])).toBeUndefined();
    expect(validateDialogueAnswer({ answer: "No dispongo de esa información.", usedFactIds: [] }, [])).toBeTruthy();
  });
  it("requires the application's last consent question before bare assent can authorize a booking", () => {
    const candidate = d({ authorization: "confirm", actionEvidence: "sí" });
    const state = dialogueTestConversation().maternalyNormalizedFlow!;
    const unclear = validateDialogue(candidate, "sí", state);
    expect(unclear?.authorization).toBe("none");
    expect(unclear?.ambiguities[0].field).toBe("booking_consent");
    const explicit = validateDialogue(candidate, "sí", { ...state, dialogueMemory: { offeredSessions: [], pendingQuestions: [], awaitingBookingConsent: true } });
    expect(explicit?.authorization).toBe("confirm");
  });
  it("asks for clear consent and only books after that question is accepted", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const message = JSON.parse(String(init?.body)).input.at(-1).content;
      return new Response(JSON.stringify({ output_text: JSON.stringify(d({ authorization: "confirm", actionEvidence: message })) }));
    }));
    const scenario = CONVERSATION_EVALUATIONS.find((c) => c.id === "bare_yes_requires_clear_consent")!;
    const result = await runConversationEvaluation({ ...scenario, turns: [scenario.turns[0], { message: "sí", expect: { registrations: 1, state: { stage: "confirmed" } } }] }, env());
    expect(result.turns[0].state?.dialogueMemory?.awaitingBookingConsent).toBe(true);
    expect(result.turns[0].registrations).toBe(0);
    expect(result.passed).toBe(true);
    expect(result.turns[1].state?.dialogueMemory?.awaitingBookingConsent).toBe(false);
  });
  it("keeps an uncertain correction blocking a booking across later data messages", async () => {
    const scenario = CONVERSATION_EVALUATIONS.find((c) => c.id === "unresolved_companion_survives_next_data")!;
    const outputs = [
      d({ ambiguities: [{ field: "partner_name", question: "¿Cómo se llama?", evidence: scenario.turns[0].message }] }),
      d({ updates: [{ field: "fpp_or_due_date", value: "2027-04-05", evidence: "5/04/2027", correction: false }] }),
      d({ updates: [{ field: "partner_name", value: "Lucía", evidence: "Lucía", correction: true }] }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(outputs.shift()) }))));
    const result = await runConversationEvaluation(scenario, env());
    expect(result.passed).toBe(true);
    expect(result.turns[1].state?.dialogueMemory?.unresolvedFields).toEqual(["partner_name"]);
    expect(result.turns[2].state?.dialogueMemory?.unresolvedFields).toEqual([]);
  });
  it("routes discovery with a question to the verified catalogue", async () => {
    const interpretation = d({ goal: "explore", scope: "catalog", serviceId: null, questions: [{ text: "¿Qué ofrecéis?", evidence: "qué ofrecéis", serviceId: null, focus: "general" }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify(interpretation) }))));
    const conversation = dialogueTestConversation(); conversation.maternalyNormalizedFlow = undefined; conversation.messages = [];
    const result = await new MaternalyCoreAdapter().handle({ conversation, inbound: { provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: "Estoy embarazada y me gustaría saber qué ofrecéis" }, env: env() });
    expect(result.authorityTrace.policy.action).toBe("catalog_info");
    expect(result.reply).toMatch(/charla|pilates|preparación/i);
    expect(result.reply).not.toMatch(/No tengo información verificada/i);
  });
  it("does not answer a BLW schedule detour with the current talk calendar", async () => {
    const message = "¿Qué fechas hay de BLW?";
    const interpretation = d({ goal: "ask", questions: [{ text: message, evidence: message, serviceId: "taller_blw", focus: "schedule" }] });
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ output_text: JSON.stringify(body.text.format.name === "maternaly_dialogue_v1" ? interpretation : { answer: "No puedo confirmar las fechas de BLW sin consultar su agenda.", usedFactIds: [] }) }));
    }));
    const client = new InMemoryNormalizedSheetsClient(createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }));
    const result = await new MaternalyCoreAdapter(undefined, undefined, undefined, new MaternalyToolExecutor(client)).handle({ conversation: dialogueTestConversation(), inbound: { provider: "twilio_sandbox", from: "whatsapp:+34999000999", text: message }, env: env() });
    expect(result.authorityTrace.policy.action).toBe("dialogue_response");
    expect(result.state?.selectedSessionId).toBe("sesion_charla_erandio_20260924");
    expect(result.reply).not.toMatch(/septiembre|octubre/);
    expect(client.appended).toHaveLength(0);
  });
  it("does not call the model or write in human mode", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const result = await runConversationEvaluation(CONVERSATION_EVALUATIONS.find((c) => c.id === "human_mode_silent")!, env());
    expect(result.passed).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
