import crypto from "node:crypto";
import type { OutboundSender } from "@/lib/hotel/conversations/service";
import { sendTwilioWhatsAppText } from "@/lib/hotel/twilio/client";
import { createTwilioWhatsAppSender } from "@/lib/hotel/twilio/whatsapp";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import type { InternalMessage } from "@/lib/maternaly/domain/types";

export interface WhatsAppSendInput {
  to: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "document";
  linkUrl?: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  provider: "ycloud" | "mock" | "twilio";
  mode: "mock" | "real";
  messageId?: string;
  sid?: string;
  error?: string;
}

export interface WhatsAppProvider {
  sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
  sendMedia(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
  normalizeInbound(payload: unknown): InternalMessage;
  verifyWebhook?(rawBody: string, signature?: string | null): boolean;
}

export function normalizePhone(input: string): string {
  const withoutWhatsapp = input.replace(/^whatsapp:/i, "").trim();
  if (withoutWhatsapp.startsWith("+")) {
    return withoutWhatsapp.replace(/[^\d+]/g, "");
  }

  const digits = withoutWhatsapp.replace(/\D/g, "");
  return digits.startsWith("34") ? `+${digits}` : `+34${digits}`;
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendText(): Promise<WhatsAppSendResult> {
    return {
      ok: true,
      provider: "mock",
      mode: "mock",
      messageId: `mock_${Date.now()}`,
    };
  }

  async sendMedia(): Promise<WhatsAppSendResult> {
    return {
      ok: true,
      provider: "mock",
      mode: "mock",
      messageId: `mock_${Date.now()}`,
    };
  }

  normalizeInbound(payload: unknown): InternalMessage {
    const raw = (payload ?? {}) as Record<string, unknown>;
    return {
      id: String(raw.id ?? raw.messageId ?? `mock_${Date.now()}`),
      provider: "mock",
      from: normalizePhone(String(raw.from ?? "")),
      to: raw.to ? normalizePhone(String(raw.to)) : undefined,
      text: typeof raw.text === "string" ? raw.text : undefined,
      occurredAt: new Date().toISOString(),
      raw,
    };
  }
}

export class YCloudProvider implements WhatsAppProvider {
  constructor(
    private readonly apiKey = process.env.YCLOUD_API_KEY,
    private readonly webhookSecret = process.env.YCLOUD_WEBHOOK_SECRET,
  ) {}

  async sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        provider: "ycloud",
        mode: "mock",
        error: "YCLOUD_API_KEY is not configured.",
      };
    }

    const response = await fetch("https://api.ycloud.com/v2/whatsapp/messages/sendText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        to: normalizePhone(input.to),
        text: input.text,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        provider: "ycloud",
        mode: "real",
        error: `YCloud send failed with ${response.status}`,
      };
    }

    const body = (await response.json()) as { id?: string; messageId?: string };
    return {
      ok: true,
      provider: "ycloud",
      mode: "real",
      messageId: body.id ?? body.messageId,
      sid: body.id ?? body.messageId,
    };
  }

  async sendMedia(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    if (!input.mediaUrl && !input.linkUrl) {
      return {
        ok: false,
        provider: "ycloud",
        mode: "mock",
        error: "Missing mediaUrl or linkUrl.",
      };
    }

    return this.sendText({
      to: input.to,
      text: input.text ?? input.linkUrl ?? input.mediaUrl,
    });
  }

  normalizeInbound(payload: unknown): InternalMessage {
    const raw = (payload ?? {}) as Record<string, unknown>;
    const message = (raw.message ?? raw.data ?? raw) as Record<string, unknown>;
    const textObject = (message.text ?? {}) as Record<string, unknown>;

    return {
      id: String(message.id ?? message.messageId ?? raw.id ?? `ycloud_${Date.now()}`),
      provider: "ycloud",
      from: normalizePhone(String(message.from ?? raw.from ?? "")),
      to: message.to ? normalizePhone(String(message.to)) : undefined,
      text: typeof message.text === "string" ? message.text : String(textObject.body ?? ""),
      occurredAt: String(message.timestamp ?? raw.createTime ?? new Date().toISOString()),
      raw,
    };
  }

  verifyWebhook(rawBody: string, signature?: string | null): boolean {
    if (!this.webhookSecret) {
      return true;
    }

    if (!signature) {
      return false;
    }

    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const received = signature.replace(/^sha256=/, "");
    if (received.length !== expected.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }
}

export class TwilioProvider implements WhatsAppProvider {
  async sendText(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    const result = await sendTwilioWhatsAppText({
      to: input.to,
      body: input.text ?? "",
    });

    return {
      ok: result.ok,
      provider: "twilio",
      mode: result.mode,
      messageId: result.sid,
      sid: result.sid,
      error: result.error,
    };
  }

  async sendMedia(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    return this.sendText({
      to: input.to,
      text: input.text ?? input.linkUrl ?? input.mediaUrl ?? "",
    });
  }

  normalizeInbound(payload: unknown): InternalMessage {
    const raw = (payload ?? {}) as Record<string, unknown>;
    return {
      id: String(raw.MessageSid ?? raw.SmsMessageSid ?? raw.messageSid ?? `twilio_${Date.now()}`),
      provider: "twilio",
      from: normalizePhone(String(raw.From ?? raw.from ?? "")),
      to: raw.To || raw.to ? normalizePhone(String(raw.To ?? raw.to)) : undefined,
      text: typeof raw.Body === "string" ? raw.Body : String(raw.body ?? ""),
      occurredAt: new Date().toISOString(),
      raw,
    };
  }
}

export function createMaternalyWhatsAppProvider(): WhatsAppProvider {
  const config = readMaternalyRuntimeConfig();
  if (config.whatsappProvider === "twilio") {
    return new TwilioProvider();
  }

  if (config.whatsappProvider === "ycloud") {
    return new YCloudProvider();
  }

  return new MockWhatsAppProvider();
}

export function createMaternalyWhatsAppSender(): OutboundSender {
  const config = readMaternalyRuntimeConfig();
  if (config.whatsappProvider === "twilio") {
    return createTwilioWhatsAppSender();
  }

  const provider = createMaternalyWhatsAppProvider();
  return {
    async sendText(input) {
      const result = await provider.sendText({ to: input.to, text: input.body });
      return {
        ok: result.ok,
        mode: result.mode,
        sid: result.sid ?? result.messageId,
        error: result.error,
      };
    },
  };
}
