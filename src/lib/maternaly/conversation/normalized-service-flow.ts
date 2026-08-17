import type { ConversationRecord, MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import {
  MaternalyCoreAdapter,
  MaternalyToolExecutor,
} from "@/lib/maternaly/conversation/core";
import { findKnowledgeService } from "@/lib/maternaly/knowledge/catalog";
import type { NormalizedSheetsClient } from "@/lib/maternaly/sheets/normalized-client";
import type { MaternalyNormalizedServiceKey } from "@/lib/maternaly/sheets/normalized-template";
import type { MaternalyReminderLifecycle } from "@/lib/maternaly/reminders/lifecycle";

export interface NormalizedFlowEvent {
  eventType: string;
  payload?: unknown;
}

export interface NormalizedServiceFlowResult {
  handled: boolean;
  reply?: string;
  nextState?: MaternalyNormalizedFlowState;
  conversationPatch?: Partial<ConversationRecord>;
  events: NormalizedFlowEvent[];
  needsHuman?: boolean;
}

export function detectNormalizedServiceKey(message: string): MaternalyNormalizedServiceKey | undefined {
  return findKnowledgeService(message)?.normalizedServiceKey;
}

export async function advanceNormalizedServiceFlow(input: {
  conversation: ConversationRecord;
  message: string;
  client?: NormalizedSheetsClient;
  env?: NodeJS.ProcessEnv;
  reminderLifecycle?: MaternalyReminderLifecycle;
}): Promise<NormalizedServiceFlowResult> {
  const serviceKey = detectNormalizedServiceKey(input.message) ?? input.conversation.maternalyNormalizedFlow?.serviceKey;
  if (!serviceKey) {
    return { handled: false, events: [] };
  }

  const adapter = input.client
    ? new MaternalyCoreAdapter(
        undefined,
        undefined,
        undefined,
        new MaternalyToolExecutor(input.client),
        undefined,
        input.reminderLifecycle,
      )
    : new MaternalyCoreAdapter(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        input.reminderLifecycle,
      );
  const result = await adapter.handle({
    conversation: input.conversation,
    inbound: {
      provider: "api",
      from: input.conversation.phoneE164,
      text: input.message,
    },
    env: input.env,
  });

  return {
    handled: result.handled,
    reply: result.reply,
    nextState: result.state,
    conversationPatch: result.conversationPatch,
    events: result.events,
    needsHuman: result.conversationPatch.mode === "human",
  };
}
