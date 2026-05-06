import { NextResponse } from "next/server";
import { requirePanelAuth } from "@/lib/hotel/conversations/auth";
import { sendManualReply } from "@/lib/hotel/conversations/service";
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
  const body = (await request.json()) as { text?: string; body?: string };
  const text = (body.text ?? body.body ?? "").trim();

  if (!text) {
    return NextResponse.json(
      { ok: false, error: "Message text is required" },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof sendManualReply>>;
  try {
    result = await sendManualReply(
      id,
      text,
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
