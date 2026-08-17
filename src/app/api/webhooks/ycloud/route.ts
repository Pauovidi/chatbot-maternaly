import { NextResponse } from "next/server";
import {
  redactConversationSensitiveText,
} from "@/lib/hotel/conversations/service";
import {
  handleInboundMaternalyWhatsApp,
  recordMaternalyServiceMediaDispatchOutcome,
} from "@/lib/maternaly/conversation/twilio-inbound";
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

  const result = await handleInboundMaternalyWhatsApp({
    from: inbound.from,
    to: inbound.to,
    body: inbound.text,
    messageSid: inbound.id,
    displayName: inbound.from,
    channel: "ycloud",
    rawPayload: sanitizePayload({
      ...(inbound.raw ?? {}),
      provider: inbound.provider,
    }),
  });

  const media = result.outboundMedia ?? [];
  const mediaResults = [];
  let textDeliveredWithMedia = false;
  for (const [index, item] of media.entries()) {
    const delivery = await provider.sendMedia({
      from: inbound.to,
      to: inbound.from,
      mediaUrl: item.url,
      mediaType: item.type,
      text: index === 0 ? result.botReply?.body : undefined,
    });
    mediaResults.push(delivery);
    textDeliveredWithMedia ||= index === 0 && delivery.ok;
    if (result.botReply) {
      try {
        await recordMaternalyServiceMediaDispatchOutcome({
          conversationId: result.conversation.id,
          messageId: result.botReply.id,
          media: [item],
          outcome: delivery.ok ? "queued" : "failed",
          transport: "ycloud_api",
          prefaceTransport: "not_required",
          posterTransport: "ycloud_api",
          providerSidPresent: Boolean(delivery.messageId),
          error: delivery.error,
        });
      } catch (error) {
        console.error("[ycloud:webhook] media dispatch observability failed", {
          conversationId: result.conversation.id,
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }
  }

  const textResult = result.botReply && !textDeliveredWithMedia
    ? await provider.sendText({ to: inbound.from, text: result.botReply.body })
    : undefined;

  return NextResponse.json({
    ok: true,
    idempotencyKey: inbound.id,
    provider: inbound.provider,
    conversationId: result.conversation.id,
    outbound: result.botReply
      ? {
          textDeliveredWithMedia,
          mediaAttempted: media.length,
          mediaDelivered: mediaResults.filter((delivery) => delivery.ok).length,
          textDelivered: textResult?.ok ?? textDeliveredWithMedia,
        }
      : undefined,
  });
}
