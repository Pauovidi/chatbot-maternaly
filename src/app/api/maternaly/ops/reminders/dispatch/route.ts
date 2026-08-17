import { handleMaternalyReminderDispatch } from "@/lib/maternaly/reminders/dispatch-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleMaternalyReminderDispatch(request);
}
