import { verifyMaternalyAdminTaskRequest } from "@/lib/maternaly/admin/task-auth";
import { readMaternalyReminderRuntimeConfig } from "./config";
import { dispatchDueMaternalyReminders } from "./dispatcher";
import { PostgresMaternalyReminderRepository } from "./postgres-repository";
import { TwilioContentMaternalyReminderTransport } from "./twilio-transport";
import { NormalizedSheetsMaternalyReminderSourceOfTruth } from "./source-of-truth";
import type {
  MaternalyReminderRepository,
  MaternalyReminderSourceOfTruth,
  MaternalyReminderTransport,
} from "./types";

export interface MaternalyReminderDispatchHandlerDependencies {
  env?: Partial<NodeJS.ProcessEnv>;
  repository?: MaternalyReminderRepository;
  transport?: MaternalyReminderTransport;
  sourceOfTruth?: MaternalyReminderSourceOfTruth;
  now?: () => Date;
}

async function readLimit(request: Request, maximum: number): Promise<number> {
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  if (typeof body.limit !== "number" || !Number.isFinite(body.limit)) {
    return maximum;
  }
  return Math.min(maximum, Math.max(1, Math.trunc(body.limit)));
}

export async function handleMaternalyReminderDispatch(
  request: Request,
  dependencies: MaternalyReminderDispatchHandlerDependencies = {},
): Promise<Response> {
  const env = dependencies.env ?? process.env;
  const auth = verifyMaternalyAdminTaskRequest(request, env);
  if (!auth.ok) {
    return Response.json(auth.body, { status: auth.status });
  }

  const config = readMaternalyReminderRuntimeConfig(env);
  if (!config.ready) {
    return Response.json(
      {
        ok: false,
        error: "maternaly_reminders_not_ready",
        missing: config.missing,
      },
      { status: 503 },
    );
  }

  const now = (dependencies.now ?? (() => new Date()))();
  try {
    const result = await dispatchDueMaternalyReminders({
      repository:
        dependencies.repository ?? PostgresMaternalyReminderRepository.fromEnv(env),
      transport:
        dependencies.transport ?? new TwilioContentMaternalyReminderTransport(config.twilio),
      sourceOfTruth:
        dependencies.sourceOfTruth ??
        new NormalizedSheetsMaternalyReminderSourceOfTruth(
          undefined,
          { ...process.env, ...env } as NodeJS.ProcessEnv,
        ),
      now,
      limit: await readLimit(request, config.batchSize),
    });
    return Response.json({ ok: true, generatedAt: now.toISOString(), result });
  } catch {
    return Response.json(
      { ok: false, error: "maternaly_reminder_dispatch_failed" },
      { status: 500 },
    );
  }
}
