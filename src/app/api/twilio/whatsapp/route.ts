import { NextResponse } from "next/server";
import { buildTwilioMessageResponse, handleInboundWhatsApp } from "@/lib/hotel/conversations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validateWebhookToken(request: Request): boolean {
  const expected = process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
  if (!expected) {
    return true;
  }

  const url = new URL(request.url);
  return (
    request.headers.get("x-hotel-webhook-token") === expected ||
    url.searchParams.get("token") === expected
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
  const raw = form
    ? Object.fromEntries(form.entries())
    : Object.fromEntries(
        Object.entries(json ?? {}).map(([key, value]) => [key, String(value ?? "")]),
      );
  const from = String(raw.From ?? raw.from ?? "");
  const to = String(raw.To ?? raw.to ?? "");
  const body = String(raw.Body ?? raw.body ?? "");
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
    rawPayload: raw,
  });

  return new NextResponse(result.twiml ?? buildTwilioMessageResponse(), {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
