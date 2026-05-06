import { NextResponse } from "next/server";
import { requirePanelAuth } from "@/lib/hotel/conversations/auth";
import { setConversationMode } from "@/lib/hotel/conversations/service";
import type { ConversationMode } from "@/lib/hotel/conversations/types";

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
  const body = (await request.json()) as { mode?: ConversationMode };

  if (body.mode !== "bot" && body.mode !== "human") {
    return NextResponse.json({ ok: false, error: "Invalid mode" }, { status: 400 });
  }

  const conversation = await setConversationMode(id, body.mode, auth.agent);
  return NextResponse.json({ ok: true, conversation });
}

export const PATCH = POST;
