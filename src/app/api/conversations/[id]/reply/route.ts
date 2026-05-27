import { NextResponse } from "next/server";
import { requirePanelAuth } from "@/lib/hotel/conversations/auth";
import { MANUAL_REPLY_MAX_CHARS, sendManualReply } from "@/lib/hotel/conversations/service";
import { createTwilioWhatsAppSender } from "@/lib/hotel/twilio/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = requirePanelAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json()) as { body?: string };

  if (!body.body?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Reply body is required" },
      { status: 400 },
    );
  }

  const replyBody = body.body.trim();

  if (replyBody.length > MANUAL_REPLY_MAX_CHARS) {
    return NextResponse.json(
      { ok: false, error: `Reply body must be ${MANUAL_REPLY_MAX_CHARS} characters or fewer` },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof sendManualReply>>;
  try {
    result = await sendManualReply(
      id,
      replyBody,
      createTwilioWhatsAppSender(),
      auth.agent,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Conversation not found") {
      return NextResponse.json(
        { ok: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    throw error;
  }
  const status = result.ok ? 200 : 207;

  return NextResponse.json({ ...result, ok: result.ok }, { status });
}
