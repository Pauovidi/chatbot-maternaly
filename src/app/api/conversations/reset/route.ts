import { NextResponse } from "next/server";
import { requirePanelAuth } from "@/lib/hotel/conversations/auth";
import {
  RESET_CONVERSATIONS_CONFIRMATION,
  resetConversations,
} from "@/lib/hotel/conversations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requirePanelAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: string;
    dryRun?: boolean;
  };

  if (!body.dryRun && body.confirm !== RESET_CONVERSATIONS_CONFIRMATION) {
    return NextResponse.json(
      { ok: false, error: "Confirmation is required." },
      { status: 400 },
    );
  }

  const result = await resetConversations({
    dryRun: body.dryRun === true,
    confirm: body.confirm,
  });

  return NextResponse.json({ ok: true, reset: result });
}
