import type { ConversationRecord } from "@/lib/hotel/conversations/types";
import { MaternalyCoreAdapter } from "@/lib/maternaly/conversation/core";
import { MaternalyCopyRenderer } from "@/lib/maternaly/conversation/copy-renderer";
import {
  MATERNALY_SAFE_FALLBACK,
  containsLegacyHotelKnowledge,
  ensureMaternalySafeReply,
} from "@/lib/maternaly/conversation/safety";
import { getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import { MaternalyConversationInterpreter } from "@/lib/maternaly/llm/interpreter";
import type { StructuredIntent } from "@/lib/maternaly/llm/interpreter";

const renderer = new MaternalyCopyRenderer();

export { MATERNALY_SAFE_FALLBACK, containsLegacyHotelKnowledge, ensureMaternalySafeReply };

export function buildMaternalyReplyFromIntent(intent: StructuredIntent): string {
  if (intent.intent === "greeting") {
    return ensureMaternalySafeReply(renderer.render({ decision: { action: "greeting" } }));
  }

  if (intent.intent === "handoff_request" || intent.should_handoff) {
    return ensureMaternalySafeReply(
      renderer.render({
        decision: {
          action: "handoff",
          reason: intent.safety_flags.includes("clinical_or_diagnostic_escalation")
            ? "clinical_safety_requires_professional"
            : undefined,
        },
      }),
    );
  }

  if (intent.intent === "privacy_question") {
    return ensureMaternalySafeReply(renderer.render({ decision: { action: "privacy" } }));
  }

  if (intent.intent === "payment_question") {
    return ensureMaternalySafeReply(renderer.render({ decision: { action: "payment" } }));
  }

  if (intent.intent === "invoice_question") {
    return ensureMaternalySafeReply(renderer.render({ decision: { action: "invoice" } }));
  }

  if (intent.intent === "reset") {
    return ensureMaternalySafeReply(renderer.render({ decision: { action: "reset" } }));
  }

  const service = getKnowledgeService(intent.service_candidate);
  if (service) {
    return ensureMaternalySafeReply(
      renderer.render({ decision: { action: "service_info", service } }),
    );
  }

  return ensureMaternalySafeReply(renderer.render({ decision: { action: "general" } }));
}

function fakeConversation(): ConversationRecord {
  const now = new Date().toISOString();
  return {
    id: "maternaly_reply_only",
    phoneE164: "+000000000",
    phoneNormalized: "000000000",
    sourceType: "whatsapp",
    status: "open",
    tags: ["maternaly"],
    mode: "bot",
    humanRequested: false,
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
  };
}

export async function buildMaternalyWhatsAppReply(
  message: string,
  interpreter = new MaternalyConversationInterpreter(),
): Promise<{ reply: string; intent: StructuredIntent }> {
  const adapter = new MaternalyCoreAdapter(interpreter);
  const result = await adapter.handle({
    conversation: fakeConversation(),
    inbound: {
      provider: "api",
      from: "+000000000",
      text: message,
    },
  });

  return {
    intent: result.intent,
    reply: ensureMaternalySafeReply(result.reply),
  };
}
