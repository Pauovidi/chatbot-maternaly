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
  prefaceText?: string;
  triggerKind?: "catalog" | "explicit_service" | "contextual_service";
}

export interface MaternalyOutboxResult {
  ok: true;
  mode: "twiml";
  provider: "twilio" | "twilio_sandbox" | "ycloud" | "api";
  renderedSource: MaternalyRenderedMessage["source"];
  twiml: string;
  media: MaternalyOutboundMedia[];
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
    const acceptedMedia = [...(input.media ?? [])].slice(0, 1);
    return {
      ok: true,
      mode: "twiml",
      provider: input.provider,
      renderedSource: input.rendered.source,
      twiml: buildMaternalyTwiml(input.rendered.text, acceptedMedia),
      media: acceptedMedia,
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

  const posterMessage = buildMaternalyMediaMessageNode(text, media[0].url);
  const prefaceText = media[0].prefaceText?.trim();
  const prefaceMessage = prefaceText
    ? `<Message><Body>${escapeXml(prefaceText)}</Body></Message>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${prefaceMessage}${posterMessage}</Response>`;
}

function buildMaternalyMediaMessageNode(text: string, mediaUrl: string): string {
  return `<Message><Body>${escapeXml(text)}</Body><Media>${escapeXml(mediaUrl)}</Media></Message>`;
}

export function buildMaternalyMediaMessageResponse(text: string, mediaUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${buildMaternalyMediaMessageNode(text, mediaUrl)}</Response>`;
}
