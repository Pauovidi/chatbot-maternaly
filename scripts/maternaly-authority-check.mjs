#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const maternalyRoot = path.join(repoRoot, "src", "lib", "maternaly");
const allowedOpenAiFile = path.join("src", "lib", "maternaly", "llm", "interpreter.ts");
const allowedTwimlFiles = new Set([
  path.join("src", "lib", "maternaly", "conversation", "outbox.ts"),
]);
const forbiddenNluVisibleFields = ["reply", "replyText", "message", "botReply", "visibleText"];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    return stats.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function rel(file) {
  return path.relative(repoRoot, file);
}

const findings = [];
const files = walk(maternalyRoot).filter((file) => /\.(ts|tsx|mjs)$/.test(file));

for (const file of files) {
  const relative = rel(file);
  const source = readFileSync(file, "utf8");

  if (source.includes("https://api.openai.com") && relative !== allowedOpenAiFile) {
    findings.push(`${relative}: OpenAI direct call outside structured NLU interpreter`);
  }

  if (source.includes("buildTwilioMessageResponse(") && !allowedTwimlFiles.has(relative)) {
    findings.push(`${relative}: TwiML construction outside Maternaly Outbox`);
  }

  if (relative === allowedOpenAiFile) {
    const structuredIntentBody = source.match(/export interface StructuredIntent \{([\s\S]*?)\n\}/)?.[1] ?? "";
    for (const field of forbiddenNluVisibleFields) {
      const visibleFieldPattern = new RegExp(`\\b${field}\\??\\s*:`);
      if (visibleFieldPattern.test(structuredIntentBody)) {
        findings.push(`${relative}: NLU visible field '${field}' appears as an output property`);
      }
    }
  }
}

const corePath = path.join(maternalyRoot, "conversation", "core.ts");
const core = readFileSync(corePath, "utf8");
for (const required of [
  "MaternalyAuthorityTurnTrace",
  "maternaly_authority_timing_completed",
  "maternaly_authority_turn_completed",
  "pendingFieldsFromStateAfter",
  "MaternalyCopyRenderer",
]) {
  if (!core.includes(required)) {
    findings.push(`src/lib/maternaly/conversation/core.ts: missing authority marker ${required}`);
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checkedFiles: files.length }, null, 2));
}
