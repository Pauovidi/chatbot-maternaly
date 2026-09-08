import { writeFileSync } from "node:fs";
import { CONVERSATION_EVALUATIONS, runConversationEvaluation, isolatedDialogueEnv } from "../src/lib/maternaly/dialogue/conversation-evaluation";
import { DIALOGUE_EVALUATIONS, dialogueTestConversation } from "../src/lib/maternaly/dialogue/evaluation";
import { understandDialogue } from "../src/lib/maternaly/dialogue/understanding";
import { ANSWER_EVALUATIONS, runAnswerEvaluation } from "../src/lib/maternaly/dialogue/answer-evaluation";

const value = (name: string, fallback: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const suite = value("suite", "understanding");
const offset = Number(value("offset", "0"));
const count = Number(value("count", "4"));
const repeat = Number(value("repeat", "1"));
if (!["understanding", "conversation", "answers"].includes(suite) || ![offset, count, repeat].every(Number.isInteger) || offset < 0 || count < 1 || count > 40 || repeat < 1 || repeat > 3) throw new Error("Invalid bounded evaluation arguments");
const source = process.env;
const env = isolatedDialogueEnv(source);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
// Network is restricted independently of the in-memory tool dependency.
// The only live requests in this process are model calls with synthetic data.
const realFetch = globalThis.fetch;
let rawOutputs: unknown[] = [];
let modelCalls: Array<{ model?: string; status: number; inputTokens?: number; outputTokens?: number }> = [];
globalThis.fetch = async (input, init) => {
  if (String(input) !== "https://api.openai.com/v1/responses") throw new Error("evaluation_network_boundary");
  const response = await realFetch(input, init);
  const payload = await response.clone().json();
  modelCalls.push({ model: payload.model, status: response.status, inputTokens: payload.usage?.input_tokens, outputTokens: payload.usage?.output_tokens });
  const text = payload.output_text ?? payload.output?.flatMap((o: { content?: Array<{ type: string; text?: string }> }) => o.content ?? []).find((c: { type: string }) => c.type === "output_text")?.text;
  rawOutputs.push(text ? JSON.parse(text) : { status: response.status, code: payload.error?.code });
  return response;
};
async function main() {
  if (!env.OPENAI_API_KEY) throw new Error("missing_key");
  const results: unknown[] = [];
  for (let run = 1; run <= repeat; run++) {
    const cases = suite === "understanding" ? DIALOGUE_EVALUATIONS : suite === "answers" ? ANSWER_EVALUATIONS : CONVERSATION_EVALUATIONS;
    for (const test of cases.slice(offset, offset + count)) {
      rawOutputs = [];
      modelCalls = [];
      let result;
      if (suite === "understanding") {
        const c = DIALOGUE_EVALUATIONS.find((c) => c.id === test.id)!;
        const d = await understandDialogue(c.message, dialogueTestConversation(c.state, c.lastQuestion), env);
        result = { id: c.id, passed: !!d.understanding && c.check(d.understanding), reason: d.reason, understanding: d.understanding, latencyMs: d.latencyMs };
      } else if (suite === "answers") result = await runAnswerEvaluation(ANSWER_EVALUATIONS.find((c) => c.id === test.id)!, env);
      else result = await runConversationEvaluation(CONVERSATION_EVALUATIONS.find((c) => c.id === test.id)!, env);
      results.push({ run, ...result, rawOutputs, modelCalls });
      console.log(JSON.stringify({ run, id: result.id, passed: result.passed,
        ...(result.passed ? {} : { failures: "turns" in result ? result.turns.filter((t) => !t.passed).map((t) => ({ index: t.index, failures: t.failures })) : result.reason }) }));
    }
  }
  const output = { suite, model: env.MATERNALY_DIALOGUE_MODEL || env.LLM_MODEL, offset, count, repeat, generatedAt: new Date().toISOString(), results };
  // Generated report contains synthetic fixtures only, never env or headers.
  const modelTag = (env.MATERNALY_DIALOGUE_MODEL || env.LLM_MODEL || "default").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `/tmp/maternaly-dialogue-${suite}-${offset}-${modelTag}-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ finished: true, suite, total: results.length, passed: results.filter((r) => (r as { passed: boolean }).passed).length, report: path }));
}
main().catch((e) => { console.error(JSON.stringify({ fatal: e instanceof Error ? e.message : "evaluation_failure" })); process.exitCode = 1; });
