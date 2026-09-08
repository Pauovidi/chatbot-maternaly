import { afterEach, describe, expect, it, vi } from "vitest";
import { understandDialogue, validateDialogue, dialogueSchemaForConversation, type DialogueUnderstanding } from "./understanding";
import { CONVERSATION_EVALUATIONS, isolatedDialogueEnv, runConversationEvaluation } from "./conversation-evaluation";
import { dialogueTestConversation } from "./evaluation";
import { MaternalyCoreAdapter, MaternalyToolExecutor } from "@/lib/maternaly/conversation/core";
import { InMemoryNormalizedSheetsClient, createRealTemplateWorkbook } from "@/lib/maternaly/sheets/normalized-test-utils";

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
  it("does not call the model or write in human mode", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const result = await runConversationEvaluation(CONVERSATION_EVALUATIONS.find((c) => c.id === "human_mode_silent")!, env());
    expect(result.passed).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
