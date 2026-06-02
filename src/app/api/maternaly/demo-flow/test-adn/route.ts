import { NextResponse } from "next/server";
import { advanceTestAdnDemoFlow, type TestAdnDemoState } from "@/lib/maternaly/demo/test-adn-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages)
    ? body.messages.map((message: unknown) => String(message ?? ""))
    : [String(body.message ?? "Quiero reservar Test ADN")];
  let state = body.state as TestAdnDemoState | undefined;
  const replies: string[] = [];

  for (const message of messages) {
    const result = await advanceTestAdnDemoFlow({
      message,
      previousState: state,
      fallbackPhone: typeof body.phone === "string" ? body.phone : undefined,
      executeWrite: body.executeWrite !== false,
    });
    if (!result.handled || !result.reply) {
      return NextResponse.json({ ok: false, message, error: "Message not handled by Test ADN demo flow." }, { status: 400 });
    }
    replies.push(result.reply);
    state = result.state;
  }

  return NextResponse.json({
    ok: true,
    replies,
    state,
  });
}
