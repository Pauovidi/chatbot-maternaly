import type { Message } from "@/lib/hotel/conversations/types";
import { buildTwilioMessageResponse } from "@/lib/hotel/conversations/service";

export interface MaternalyRenderedMessage {
  kind: "text";
  text: string;
  source: "copy_renderer";
  renderer: "MaternalyCopyRenderer";
}

export interface MaternalyOutboxResult {
  ok: true;
  mode: "twiml";
  provider: "twilio" | "twilio_sandbox" | "ycloud" | "api";
  renderedSource: MaternalyRenderedMessage["source"];
  twiml: string;
  messageDraft: Omit<Message, "id" | "createdAt" | "transport">;
}

export class MaternalyConversationOutbox {
  buildEmpty(input: {
    provider: MaternalyOutboxResult["provider"];
  }): Pick<MaternalyOutboxResult, "ok" | "mode" | "provider" | "twiml"> {
    return {
      ok: true,
      mode: "twiml",
      provider: input.provider,
      twiml: buildTwilioMessageResponse(),
    };
  }

  buildText(input: {
    conversationId: string;
    provider: MaternalyOutboxResult["provider"];
    rendered: MaternalyRenderedMessage;
  }): MaternalyOutboxResult {
    return {
      ok: true,
      mode: "twiml",
      provider: input.provider,
      renderedSource: input.rendered.source,
      twiml: buildTwilioMessageResponse(input.rendered.text),
      messageDraft: {
        conversationId: input.conversationId,
        direction: "outbound",
        senderType: "bot",
        body: input.rendered.text,
      },
    };
  }
}
