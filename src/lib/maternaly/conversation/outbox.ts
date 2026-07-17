import type { Message } from "@/lib/hotel/conversations/types";
import { buildTwilioMessageResponse } from "@/lib/hotel/conversations/service";

export interface MaternalyRenderedMessage {
  kind: "text";
  text: string;
  source: "copy_renderer";
  renderer: "MaternalyCopyRenderer";
}

export interface MaternalyOutboundMedia {
  serviceId: "charla_embarazo_1_20" | "taller_blw";
  alt: string;
  url: string;
  triggerKind?: "catalog" | "explicit_service" | "contextual_service";
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
    media?: readonly MaternalyOutboundMedia[];
  }): MaternalyOutboxResult {
    return {
      ok: true,
      mode: "twiml",
      provider: input.provider,
      renderedSource: input.rendered.source,
      twiml: buildMaternalyTwiml(input.rendered.text, input.media),
      messageDraft: {
        conversationId: input.conversationId,
        direction: "outbound",
        senderType: "bot",
        body: input.rendered.text,
      },
    };
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMaternalyTwiml(
  text: string,
  media: readonly MaternalyOutboundMedia[] | undefined,
): string {
  if (!media?.length) {
    return buildTwilioMessageResponse(text);
  }

  const mediaNodes = media.map((item) => `<Media>${escapeXml(item.url)}</Media>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${escapeXml(text)}</Body>${mediaNodes}</Message></Response>`;
}
