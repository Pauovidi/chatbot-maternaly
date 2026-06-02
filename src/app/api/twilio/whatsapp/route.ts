import { NextResponse } from "next/server";
import {
  buildTwilioMessageResponse,
  redactConversationSensitiveText,
} from "@/lib/hotel/conversations/service";
import { readTwilioWhatsAppConfig } from "@/lib/hotel/twilio/client";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import {
  MATERNALY_SAFE_FALLBACK,
  containsLegacyHotelKnowledge,
} from "@/lib/maternaly/conversation/response-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TWILIO_XML_HEADERS = { "Content-Type": "text/xml; charset=utf-8" };

function buildSafeMaternalyTwilioResponse(twiml?: string): string {
  const message = twiml?.match(/<Message>([\s\S]*?)<\/Message>/)?.[1]?.trim();
  if (!message || containsLegacyHotelKnowledge(twiml ?? "")) {
    return buildTwilioMessageResponse(MATERNALY_SAFE_FALLBACK);
  }

  return twiml ?? buildTwilioMessageResponse(MATERNALY_SAFE_FALLBACK);
}

function getTokenStatus(request: Request): {
  configured: boolean;
  present: boolean;
  valid: boolean;
} {
  const expected = process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();
  if (!expected) {
    return {
      configured: false,
      present: false,
      valid: process.env.NODE_ENV !== "production",
    };
  }

  const url = new URL(request.url);
  const candidates = [
    request.headers.get("x-twilio-webhook-token"),
    request.headers.get("x-hotel-webhook-token"),
    url.searchParams.get("token"),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return {
    configured: true,
    present: candidates.length > 0,
    valid: candidates.some((candidate) => candidate === expected),
  };
}

function getInboundBody(raw: Record<string, string>): string {
  const body = String(raw.Body ?? raw.body ?? "").trim();
  if (body) {
    return body;
  }

  const mediaCount = Number.parseInt(String(raw.NumMedia ?? raw.numMedia ?? "0"), 10);
  if (Number.isFinite(mediaCount) && mediaCount > 0) {
    return `[WhatsApp con ${mediaCount} adjunto${mediaCount === 1 ? "" : "s"}]`;
  }

  return "";
}

function sanitizeTwilioPayload(raw: Record<string, string>): Record<string, string> {
  const allowedKeys = [
    "From",
    "To",
    "Body",
    "MessageSid",
    "SmsMessageSid",
    "ProfileName",
    "NumMedia",
    "WaId",
  ];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => raw[key] !== undefined)
      .map((key) => [
        key,
        redactConversationSensitiveText(raw[key]).slice(0, key === "Body" ? 1000 : 240),
      ]),
  );
}

function getTwilioInboundChannel() {
  const mode = readTwilioWhatsAppConfig().providerMode;
  return mode === "real" ? "twilio" : "twilio_sandbox";
}

function redactPhone(value: string) {
  const normalized = value.replace(/[^\d+]/g, "");
  if (normalized.length <= 5) {
    return normalized ? "[redacted]" : "";
  }

  return `${normalized.slice(0, 3)}…${normalized.slice(-2)}`;
}

function logTwilioWebhook(event: Record<string, unknown>) {
  console.info("[twilio:webhook]", JSON.stringify(event));
}

async function readTwilioPayload(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(json ?? {}).map(([key, value]) => [
        key,
        typeof value === "string" ? value : String(value ?? ""),
      ]),
    );
  }

  try {
    const form = await request.clone().formData();
    return Object.fromEntries(
      Array.from(form.entries()).map(([key, value]) => [
        key,
        typeof value === "string" ? value : String(value ?? ""),
      ]),
    );
  } catch {
    const text = await request.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

export function GET() {
  const twilioConfig = readTwilioWhatsAppConfig();
  return NextResponse.json({
    ok: true,
    endpoint: "/api/twilio/whatsapp",
    expectedMethod: "POST",
    provider: "twilio",
    providerAvailable: true,
    tokenConfigured: Boolean(process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim()),
    mode: twilioConfig.providerMode,
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const tokenStatus = getTokenStatus(request);
  const channel = getTwilioInboundChannel();
  const baseLog = {
    provider: channel,
    contentType,
    tokenPresent: tokenStatus.present,
    tokenValidated: tokenStatus.valid,
  };

  if (!tokenStatus.valid) {
    logTwilioWebhook({
      ...baseLog,
      result: "rejected",
      reason: "invalid_token",
    });
    return new NextResponse(buildTwilioMessageResponse(MATERNALY_SAFE_FALLBACK), {
      status: 401,
      headers: TWILIO_XML_HEADERS,
    });
  }

  let raw: Record<string, string>;
  try {
    raw = await readTwilioPayload(request);
  } catch {
    logTwilioWebhook({
      ...baseLog,
      result: "error",
      reason: "payload_parse_failed",
    });
    return new NextResponse(buildTwilioMessageResponse(MATERNALY_SAFE_FALLBACK), {
      status: 400,
      headers: TWILIO_XML_HEADERS,
    });
  }

  const from = String(raw.From ?? raw.from ?? "");
  const to = String(raw.To ?? raw.to ?? "");
  const body = getInboundBody(raw);
  const messageSid = String(raw.MessageSid ?? raw.messageSid ?? "");
  const requestLog = {
    ...baseLog,
    messageSidPresent: Boolean(messageSid),
    from: redactPhone(from),
    bodyLength: body.length,
  };

  if (!from || !body) {
    logTwilioWebhook({
      ...requestLog,
      result: "accepted",
      reason: "empty_from_or_body",
    });
    return new NextResponse(buildTwilioMessageResponse(MATERNALY_SAFE_FALLBACK), {
      headers: TWILIO_XML_HEADERS,
    });
  }

  try {
    const result = await handleInboundMaternalyWhatsApp({
      from,
      to,
      body,
      messageSid,
      displayName: String(raw.ProfileName ?? raw.profileName ?? ""),
      channel,
      rawPayload: sanitizeTwilioPayload(raw),
    });

    logTwilioWebhook({
      ...requestLog,
      result: "accepted",
      conversationId: result.conversation.id,
      duplicate: Boolean(messageSid && !result.botReply),
    });

    return new NextResponse(buildSafeMaternalyTwilioResponse(result.twiml), {
      headers: TWILIO_XML_HEADERS,
    });
  } catch (error) {
    logTwilioWebhook({
      ...requestLog,
      result: "error",
      reason: "handler_failed",
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return new NextResponse(buildTwilioMessageResponse(MATERNALY_SAFE_FALLBACK), {
      headers: TWILIO_XML_HEADERS,
    });
  }
}
