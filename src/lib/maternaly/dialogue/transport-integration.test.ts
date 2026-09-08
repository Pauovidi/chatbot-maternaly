import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import { InMemoryNormalizedSheetsClient, createRealTemplateWorkbook } from "@/lib/maternaly/sheets/normalized-test-utils";
import { dialogueTestConversation } from "./evaluation";
import { isolatedDialogueEnv } from "./conversation-evaluation";
import type { DialogueUnderstanding } from "./understanding";

let directory: string | undefined;
afterEach(async () => {
  vi.unstubAllGlobals(); vi.useRealTimers();
  if (directory) {
    const target = path.resolve(directory);
    if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("maternaly-dialogue-inbound-")) throw new Error("unsafe_test_cleanup");
    await rm(target, { recursive: true, force: true }); directory = undefined;
  }
});

it("persists semantic slots in order across a burst and ignores a repeated Twilio SID", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-08T10:00:00Z"));
  directory = await mkdtemp(path.join(os.tmpdir(), "maternaly-dialogue-inbound-"));
  const store = new FileConversationStore(path.join(directory, "conversations.json"));
  await store.seed([dialogueTestConversation()]);
  const client = new InMemoryNormalizedSheetsClient(createRealTemplateWorkbook({ serviceKey: "charla_embarazo_1_20", multiSession: true }));
  const messages = ["elena garcía lópez", "Mi acompañante es Mario", "FPP 5/04/2027"];
  const fields = ["full_name", "partner_name", "fpp_or_due_date"] as const;
  const values = ["elena garcía lópez", "Mario", "2027-04-05"];
  const contexts: string[] = [];
  const fetcher = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const message = body.input.at(-1).content;
    const index = messages.indexOf(message);
    expect(index).toBeGreaterThanOrEqual(0);
    contexts.push(body.input[1].content);
    const d: DialogueUnderstanding = { goal: "continue", authorization: "none", actionEvidence: null, serviceId: "charla_embarazo_1_20", scope: "contextual", clinical: false,
      questions: [], ambiguities: [], selection: { sessionId: null, evidence: null },
      updates: [{ field: fields[index], value: values[index], evidence: message, correction: false }] };
    return new Response(JSON.stringify({ output_text: JSON.stringify(d) }));
  });
  vi.stubGlobal("fetch", fetcher);
  const env = isolatedDialogueEnv({ NODE_ENV: "test", OPENAI_API_KEY: "synthetic-key" });
  const payloads = messages.map((body, index) => ({ from: "whatsapp:+34999000999", body, messageSid: `SM_SYNTHETIC_BURST_${index}`, channel: "twilio_sandbox" }));
  const results = await Promise.all([...payloads, payloads[2]].map((payload) => handleInboundMaternalyWhatsApp(payload, store, { normalizedSheetsClient: client, normalizedEnv: env })));
  const saved = await store.getByPhone("34999000999");
  expect(saved?.maternalyNormalizedFlow).toMatchObject({ fullName: values[0], partnerName: "Mario", fppOrDueDate: "2027-04-05", stage: "confirmed" });
  expect(contexts[1]).toContain('"fullName":"elena garcía lópez"');
  expect(contexts[2]).toContain('"partnerName":"Mario"');
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(client.appended.filter((a) => a.tabTitle === "Inscripciones")).toHaveLength(1);
  expect(results.filter((r) => r.botReply)).toHaveLength(3);
  expect(saved?.messages.filter((m) => m.externalMessageSid === payloads[2].messageSid)).toHaveLength(1);
});
