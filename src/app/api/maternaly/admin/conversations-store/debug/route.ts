import { NextResponse } from "next/server";
import { diagnoseConversationStore } from "@/lib/hotel/conversations/store-diagnostics";
import { verifyMaternalyAdminDebugRequest } from "@/lib/maternaly/admin/task-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = verifyMaternalyAdminDebugRequest(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const diagnostics = await diagnoseConversationStore();
  return NextResponse.json({
    ok: diagnostics.panelShouldLoad,
    generatedAt: new Date().toISOString(),
    diagnostics,
  });
}
