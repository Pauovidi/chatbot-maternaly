import type { DemoReservationRecord, ReminderJob as PersistedReminderJob, ReservationStatus } from "@/lib/hotel/integrations/types";
import { appendDemoLog, upsertReminder } from "@/lib/hotel/persistence/store";
import { createReminderPlan, selectDueReminderPlans, toPersistedReminderJob, transitionReminderState } from "./reminders";
import { REMINDER_DEFAULT_CONFIG } from "./config";
import type {
  ReminderDispatchResult,
  ReminderPersistenceAdapter,
  ReminderPlan,
  ReminderSchedulingOptions,
  ReminderTransportAdapter,
  ReminderTransportResponse,
} from "./types";

function buildDefaultPersistenceAdapter(storeName = REMINDER_DEFAULT_CONFIG.defaultStoreName): ReminderPersistenceAdapter {
  return {
    async saveReminder(reminder) {
      await upsertReminder(reminder as PersistedReminderJob, storeName);
    },
    async appendLog(entry) {
      return appendDemoLog(entry, storeName);
    },
  };
}

function buildDefaultTransport(webhookUrl?: string): ReminderTransportAdapter {
  return {
    async send(plan: ReminderPlan): Promise<ReminderTransportResponse> {
      if (!webhookUrl) {
        return {
          ok: false,
          status: 0,
          statusText: "webhook no configurado",
          bodyText: plan.previewText,
        };
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(plan),
      });

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        bodyText: await response.text().catch(() => undefined),
      };
    },
  };
}

function buildMockReservation(job: PersistedReminderJob): DemoReservationRecord {
  return {
    id: job.reservationId,
    petKey: job.petName,
    petName: job.petName,
    ownerName: job.ownerName,
    phoneE164: job.phoneE164,
    entryDate: job.entryDate,
    entrySlot: job.entrySlot,
    exitDate: job.entryDate,
    exitSlot: job.entrySlot,
    dogs: 1,
    status: "available",
    source: "mock",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: job.notes,
  };
}

export function shouldQueueReminder(status: ReservationStatus): boolean {
  return status === "available" || status === "confirmed";
}

export async function scheduleReminderJob(
  job: PersistedReminderJob,
  options: ReminderSchedulingOptions = {},
): Promise<ReminderDispatchResult> {
  const reminder = createReminderPlan({
    reservation: buildMockReservation(job),
    leadHours: options.leadHours,
    channel: options.channel ?? job.channel,
    reminderId: job.id,
    now: options.now,
  });

  return dispatchReminderPlan(reminder, options);
}

export async function dispatchReminderPlan(
  reminder: ReminderPlan,
  options: ReminderSchedulingOptions = {},
): Promise<ReminderDispatchResult> {
  const mode = options.mode ?? reminder.mode ?? REMINDER_DEFAULT_CONFIG.defaultMode;
  const persistence = options.persistence ?? buildDefaultPersistenceAdapter(options.storeName);
  const transport = options.transport ?? buildDefaultTransport(options.webhookUrl ?? REMINDER_DEFAULT_CONFIG.webhookUrl);

  const logEntry = await persistence.appendLog({
    level: "info",
    event: "reminder_planned",
    message: `Recordatorio ${reminder.reminderId} preparado para ${reminder.entryDate} ${reminder.entrySlot}`,
    payload: {
      reminderId: reminder.reminderId,
      reservationId: reminder.reservationId,
      dueAt: reminder.dueAt,
      mode,
    },
  });

  const queued = transitionReminderState(
    {
      ...reminder,
      mode,
    },
    "queued",
    "queued",
    "Recordatorio puesto en cola",
    { mode },
  );

  if (mode === "mock" || !options.webhookUrl) {
    const preview = transitionReminderState(
      queued,
      "preview",
      "preview",
      "Canal real no disponible, se deja en modo preview",
    );

    await persistence.saveReminder(toPersistedReminderJob(preview));

    return {
      ok: true,
      mode,
      state: "preview",
      delivered: false,
      previewed: true,
      persisted: true,
      reminder: preview,
      logEntry,
    };
  }

  const response = await transport.send(queued);

  if (!response.ok) {
    if (options.fallbackToPreview ?? REMINDER_DEFAULT_CONFIG.fallbackToPreview) {
      const preview = transitionReminderState(
        queued,
        "preview",
        "preview",
        "Fallo el canal real, se deja un preview loggable",
        {
          status: response.status,
          statusText: response.statusText,
        },
      );

      await persistence.saveReminder(toPersistedReminderJob(preview));

      return {
        ok: true,
        mode,
        state: "preview",
        delivered: false,
        previewed: true,
        persisted: true,
        reminder: preview,
        logEntry,
        transportResponse: response,
      };
    }

    const failed = transitionReminderState(
      queued,
      "failed",
      "failed",
      "El recordatorio no pudo enviarse",
      {
        status: response.status,
        statusText: response.statusText,
      },
    );

    await persistence.saveReminder(toPersistedReminderJob(failed));

    return {
      ok: false,
      mode,
      state: "failed",
      delivered: false,
      previewed: false,
      persisted: true,
      reminder: failed,
      logEntry,
      transportResponse: response,
    };
  }

  const sent = transitionReminderState(
    queued,
    "sent",
    "sent",
    "Recordatorio enviado correctamente",
    {
      status: response.status,
      statusText: response.statusText,
    },
  );

  await persistence.saveReminder(toPersistedReminderJob(sent));

  return {
    ok: true,
    mode,
    state: "sent",
    delivered: true,
    previewed: false,
    persisted: true,
    reminder: sent,
    logEntry,
    transportResponse: response,
  };
}

export async function queueReminderFromReservation(
  reservation: DemoReservationRecord,
  options: ReminderSchedulingOptions = {},
): Promise<ReminderDispatchResult> {
  if (!shouldQueueReminder(reservation.status)) {
    const plan = createReminderPlan({
      reservation,
      leadHours: options.leadHours,
      channel: options.channel,
      now: options.now,
    });

    const skipped = transitionReminderState(
      plan,
      "skipped",
      "skipped",
      "La reserva no cumple criterios para cola de recordatorio",
      {
        reservationStatus: reservation.status,
      },
    );

    return {
      ok: true,
      mode: options.mode ?? "mock",
      state: "skipped",
      delivered: false,
      previewed: false,
      persisted: false,
      reminder: skipped,
    };
  }

  const plan = createReminderPlan({
    reservation,
    leadHours: options.leadHours,
    channel: options.channel,
    now: options.now,
  });

  return dispatchReminderPlan(plan, options);
}

export function buildReminderQueueSummary(plans: ReminderPlan[]): string {
  if (plans.length === 0) {
    return "No hay recordatorios pendientes";
  }

  return plans
    .slice()
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    .map((plan) => `${plan.petName} - ${plan.dueAt} - ${plan.state}`)
    .join("\n");
}

export function selectDueReminderJobs(plans: ReminderPlan[], now: Date = new Date()) {
  return selectDueReminderPlans(plans, now);
}
