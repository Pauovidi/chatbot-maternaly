import { verifyMaternalyAdminDebugRequest } from "@/lib/maternaly/admin/task-auth";
import { runDialogueEvaluation, DIALOGUE_EVALUATIONS } from "@/lib/maternaly/dialogue/evaluation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let running = false;
export async function POST(request: Request) {
  const auth = verifyMaternalyAdminDebugRequest(request);
  if (!auth.ok) return Response.json(auth.body, { status: auth.status });
  if (process.env.MATERNALY_DIALOGUE_EVAL_ENABLED !== "true") return Response.json({ error: "evaluation_disabled" }, { status: 403 });
  if (running) return Response.json({ error: "evaluation_running" }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const offset = body.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset >= DIALOGUE_EVALUATIONS.length) return Response.json({ error: "invalid_offset" }, { status: 400 });
  running = true;
  try { return Response.json(await runDialogueEvaluation(process.env, offset)); }
  finally { running = false; }
}
