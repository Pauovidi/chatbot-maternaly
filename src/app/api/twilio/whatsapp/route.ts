import { NextResponse } from "next/server";
import { buildTwilioMessageResponse, handleInboundWhatsApp } from "@/lib/hotel/conversations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validateWebhookToken(request: Request): boolean {
  const expected = process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
  if (!expected) {
    return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
  }

  const url = new URL(request.url);
  return (
    request.headers.get("x-twilio-webhook-token") === expected ||
    request.headers.get("x-hotel-webhook-token") === expected ||
    url.searchParams.get("token") === expected
  );
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
      .map((key) => [key, raw[key].slice(0, key === "Body" ? 1000 : 240)]),
  );
}

export async function POST(request: Request) {
  if (!validateWebhookToken(request)) {
    return new NextResponse(buildTwilioMessageResponse(), {
      status: 401,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const form =
    contentType.includes("application/json")
      ? undefined
      : await request.formData();
  const json = form ? undefined : ((await request.json()) as Record<string, unknown>);
  const raw = Object.fromEntries(
    (form
      ? Array.from(form.entries())
      : Object.entries(json ?? {})).map(([key, value]) => [
      key,
      typeof value === "string" ? value : String(value ?? ""),
    ]),
  );
  const from = String(raw.From ?? raw.from ?? "");
  const to = String(raw.To ?? raw.to ?? "");
  const body = getInboundBody(raw);
  const messageSid = String(raw.MessageSid ?? raw.messageSid ?? "");

  if (!from || !body) {
    return new NextResponse(buildTwilioMessageResponse(), {
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const result = await handleInboundWhatsApp({
    from,
    to,
    body,
    messageSid,
    displayName: String(raw.ProfileName ?? raw.profileName ?? ""),
    rawPayload: sanitizeTwilioPayload(raw),
  });

  return new NextResponse(result.twiml ?? buildTwilioMessageResponse(), {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
