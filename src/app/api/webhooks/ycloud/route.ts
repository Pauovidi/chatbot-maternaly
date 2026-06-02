import { NextResponse } from "next/server";
import {
  redactConversationSensitiveText,
} from "@/lib/hotel/conversations/service";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import { MaternalyConversationInterpreter } from "@/lib/maternaly/llm/interpreter";
import { YCloudProvider } from "@/lib/maternaly/whatsapp/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      typeof value === "string"
        ? redactConversationSensitiveText(value).slice(0, 1000)
        : value,
    ]),
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-ycloud-signature") ?? request.headers.get("x-signature");
  const provider = new YCloudProvider();

  if (!provider.verifyWebhook?.(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const inbound = provider.normalizeInbound(payload);
  if (!inbound.from || !inbound.text) {
    return NextResponse.json({ ok: true, ignored: true, idempotencyKey: inbound.id });
  }

  const interpreter = new MaternalyConversationInterpreter();
  const intent = await interpreter.interpret(inbound.text);
  const result = await handleInboundMaternalyWhatsApp({
    from: inbound.from,
    to: inbound.to,
    body: inbound.text,
    messageSid: inbound.id,
    displayName: inbound.from,
    channel: "ycloud",
    rawPayload: sanitizePayload({
      ...(inbound.raw ?? {}),
      maternalyIntent: intent,
      provider: inbound.provider,
    }),
  });

  return NextResponse.json({
    ok: true,
    idempotencyKey: inbound.id,
    provider: inbound.provider,
    intent,
    conversationId: result.conversation.id,
  });
}
