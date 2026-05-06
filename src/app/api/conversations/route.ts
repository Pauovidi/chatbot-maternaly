import { NextResponse } from "next/server";
import { requirePanelAuth } from "@/lib/hotel/conversations/auth";
import {
  listConversationDashboard,
  handleInboundWhatsApp,
} from "@/lib/hotel/conversations/service";
import type { ConversationListFilters } from "@/lib/hotel/conversations/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requirePanelAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const filters: ConversationListFilters = {
    query:
      url.searchParams.get("query") ??
      url.searchParams.get("search") ??
      undefined,
    status: url.searchParams.get("status") ?? undefined,
    unreadOnly: ["1", "true", "yes"].includes(
      (url.searchParams.get("unread") ?? url.searchParams.get("unreadOnly") ?? "").toLowerCase(),
    ),
    mode: (url.searchParams.get("mode") as ConversationListFilters["mode"]) ?? "all",
  };
  const dashboard = await listConversationDashboard(filters);

  return NextResponse.json({ ok: true, ...dashboard });
}

export async function POST(request: Request) {
  const auth = requirePanelAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as {
    from?: string;
    body?: string;
    messageSid?: string;
    displayName?: string;
  };

  if (!body.from || !body.body) {
    return NextResponse.json(
      { ok: false, error: "from and body are required" },
      { status: 400 },
    );
  }

  const result = await handleInboundWhatsApp({
    from: body.from,
    body: body.body,
    messageSid: body.messageSid,
    displayName: body.displayName,
    rawPayload: body,
  });

  return NextResponse.json({ ok: true, ...result });
}
