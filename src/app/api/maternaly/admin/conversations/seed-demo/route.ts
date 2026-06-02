import { NextResponse } from "next/server";
import {
  MATERNALY_DEMO_PANEL_SEED_BATCH_ID,
  seedMaternalyDemoConversations,
} from "@/lib/hotel/conversations/maternaly-demo-seed";
import { verifyMaternalyAdminTaskRequest } from "@/lib/maternaly/admin/task-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProductionLike(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return env.NODE_ENV === "production" || env.APP_ENV?.trim().toLowerCase() === "production";
}

function authFailureStatus(status: number): number {
  if (status === 503 && isProductionLike()) {
    return 401;
  }

  return status;
}

async function readSeedInput(request: Request): Promise<{
  seedBatchId: string;
  force: boolean;
}> {
  const body = (await request.json().catch(() => ({}))) as {
    seedBatchId?: unknown;
    force?: unknown;
  };
  return {
    seedBatchId:
      typeof body.seedBatchId === "string" && body.seedBatchId.trim()
        ? body.seedBatchId.trim()
        : MATERNALY_DEMO_PANEL_SEED_BATCH_ID,
    force: body.force === true,
  };
}

export async function POST(request: Request) {
  const auth = verifyMaternalyAdminTaskRequest(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: authFailureStatus(auth.status) });
  }

  const input = await readSeedInput(request);
  const result = await seedMaternalyDemoConversations(input);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    result: {
      seedBatchId: result.seedBatchId,
      force: result.force,
      created: result.created,
      skipped: result.skipped,
      replaced: result.replaced,
      totalSeedConversations: result.totalSeedConversations,
      existingConversationCountBefore: result.existingConversationCountBefore,
      existingConversationCountAfter: result.existingConversationCountAfter,
      conversationIds: result.conversationIds,
    },
  });
}
