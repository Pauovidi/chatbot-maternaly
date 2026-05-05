import {
  appendLog,
  findReservationById,
  loadDemoState,
  markReminder,
  replaceRemindersForReservation,
  upsertReservation,
} from "./demo-store";
import {
  buildWhatsAppOutputPayload,
  mapDomainAvailabilityToLegacy,
  mapLegacyWritePlanToDemoPlan,
  toLegacyReservationRecord,
} from "./integration-bridge";
import { processReservationEmail } from "./process-reservation";
import {
  getHotelEmailRuntimeConfig,
  getHotelFeatureFlags,
  getHotelRuntimeConfig,
} from "../config";
import { buildWhatsAppManualReminderMessage } from "../content/whatsapp-templates";
import { createImapEmailSource, pollReservationMailbox } from "../email";
import type { ReminderJob, ReservationRecord } from "../domain/contracts";
import {
  mapLegacyReservationStatusToWorkflowState,
  type ReservationWorkflowState,
} from "../domain/states";
import { createWhatsAppOutputFacade } from "../output";
import { buildGoogleSheetAdapter } from "../sheets";

export interface MailboxWorkflowItem {
  fingerprint: string;
  subject: string;
  status: "processed" | "duplicate" | "ignored" | "failed";
  reservationId?: string;
  workflowState?: ReservationWorkflowState;
}

export interface MailboxWorkflowResult {
  mailbox: string;
  fetched: number;
  relevant: number;
  processed: number;
  duplicates: number;
  ignored: number;
  failed: number;
  reservationsProcessed: number;
  items: MailboxWorkflowItem[];
}

export interface ReservationConfirmationResult {
  reservation: ReservationRecord;
  reminder: ReminderJob;
  sheetWritePlan: ReturnType<typeof mapLegacyWritePlanToDemoPlan> | null;
}

export interface ReservationCancellationRequestResult {
  reservation: ReservationRecord;
  message: string;
}

export interface ReminderDispatchResultSummary {
  due: number;
  sent: number;
  failed: number;
  previewed: number;
  reminders: ReminderJob[];
}

function createWorkflowStep(
  from: ReservationWorkflowState,
  to: ReservationWorkflowState,
  reason: string,
) {
  return {
    from,
    to,
    at: new Date().toISOString(),
    reason,
  };
}

function appendWorkflowState(
  reservation: ReservationRecord,
  to: ReservationWorkflowState,
  reason: string,
): ReservationRecord {
  const from =
    reservation.workflowState ??
    mapLegacyReservationStatusToWorkflowState(reservation.status);

  return {
    ...reservation,
    workflowState: to,
    workflowTrail: [
      ...(reservation.workflowTrail ?? []),
      createWorkflowStep(from, to, reason),
    ],
  };
}

function getSlotStartTime(slot: ReservationRecord["checkInSlot"]): string {
  return slot === "morning" ? "08:00:00" : "16:30:00";
}

function buildReminderJob(reservation: ReservationRecord): ReminderJob {
  const runtimeConfig = getHotelRuntimeConfig();
  const entryDateTime = new Date(
    `${reservation.checkInDate}T${getSlotStartTime(reservation.checkInSlot)}`,
  );
  const scheduledFor = new Date(
    entryDateTime.getTime() - runtimeConfig.reminderLeadHours * 60 * 60 * 1000,
  );
  const createdAt = new Date().toISOString();

  return {
    reminderId: `rem-${reservation.reservationId}`,
    reservationId: reservation.reservationId,
    petName: reservation.petName,
    ownerName: reservation.ownerName,
    scheduledFor: scheduledFor.toISOString(),
    leadHours: runtimeConfig.reminderLeadHours,
    status: "pendiente",
    channel: "whatsapp",
    messagePreview: buildWhatsAppManualReminderMessage(reservation),
    mode: getHotelFeatureFlags().useRemindersReal ? "real" : "preview",
    createdAt,
    updatedAt: createdAt,
    attempts: 0,
    trace: [
      {
        at: createdAt,
        event: "scheduled",
        message: "Recordatorio planificado para 5 dias antes de la entrada.",
      },
    ],
  };
}

function withReminderTrace(
  reminder: ReminderJob,
  event: string,
  message: string,
  overrides: Partial<ReminderJob> = {},
): ReminderJob {
  return {
    ...reminder,
    ...overrides,
    updatedAt: new Date().toISOString(),
    trace: [
      ...(reminder.trace ?? []),
      {
        at: new Date().toISOString(),
        event,
        message,
      },
    ],
  };
}

function getReminderWebhookUrl(): string | undefined {
  return (
    process.env.HOTEL_REMINDERS_WEBHOOK_URL?.trim() ||
    process.env.HOTEL_REMINDER_WEBHOOK_URL?.trim() ||
    process.env.HOTEL_REMINDER_WEBHOOK?.trim() ||
    undefined
  );
}

export async function pollReservationMailboxWorkflow(): Promise<MailboxWorkflowResult> {
  const config = getHotelEmailRuntimeConfig();

  if (!config.enabled) {
    return {
      mailbox: config.mailbox,
      fetched: 0,
      relevant: 0,
      processed: 0,
      duplicates: 0,
      ignored: 0,
      failed: 0,
      reservationsProcessed: 0,
      items: [],
    };
  }

  if (!config.host || !config.user || !config.password) {
    throw new Error(
      "Faltan credenciales IMAP reales. Revisa HOTEL_EMAIL_IMAP_HOST, USER y PASSWORD.",
    );
  }

  const source = await createImapEmailSource({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    password: config.password,
    mailbox: config.mailbox,
    markSeen: config.markSeen,
  });

  const poll = await pollReservationMailbox(source, {
    mailbox: config.mailbox,
    limit: config.limit,
    markSeen: config.markSeen,
    storeName: config.storeName,
  });

  const items: MailboxWorkflowItem[] = [];
  let reservationsProcessed = 0;

  for (const item of poll.items) {
    let workflowState: ReservationWorkflowState | undefined;
    let reservationId = item.record.reservationId;

    if (item.record.status === "processed") {
      const result = await processReservationEmail({
        subject: item.normalized.parserInput.subject,
        rawText: item.normalized.parserInput.rawText,
      });
      reservationsProcessed += 1;
      workflowState = result.workflowState;
      reservationId = result.reservation?.reservationId ?? reservationId;
    }

    items.push({
      fingerprint: item.record.fingerprint,
      subject: item.record.subject,
      status: item.record.status,
      reservationId,
      workflowState,
    });
  }

  await appendLog({
    level: poll.failed > 0 ? "warn" : "info",
    event: "mailbox_polled",
    message: `Mailbox ${poll.mailbox}: ${poll.processed} procesados, ${poll.duplicates} duplicados, ${poll.ignored} ignorados.`,
  });

  return {
    ...poll,
    reservationsProcessed,
    items,
  };
}

export async function confirmReservation(
  reservationId: string,
): Promise<ReservationConfirmationResult> {
  const reservation = await findReservationById(reservationId);

  if (!reservation) {
    throw new Error(`No existe la reserva ${reservationId}.`);
  }

  if (reservation.status === "sin_disponibilidad") {
    throw new Error("No se puede confirmar una reserva sin disponibilidad.");
  }

  let confirmed = appendWorkflowState(
    {
      ...reservation,
      status: "confirmada",
      updatedAt: new Date().toISOString(),
    },
    "confirmed",
    "Reserva confirmada manualmente para operación.",
  );

  let sheetWritePlan: ReturnType<typeof mapLegacyWritePlanToDemoPlan> | null = null;
  if (getHotelFeatureFlags().useGoogleSheetsReal) {
    const adapter = await buildGoogleSheetAdapter();
    const legacyReservation = toLegacyReservationRecord(confirmed, "confirmada");
    const plan = await adapter.buildWritePlan(legacyReservation);
    sheetWritePlan = mapLegacyWritePlanToDemoPlan(plan, "confirmada");
  }

  const reminder = buildReminderJob(confirmed);
  confirmed = appendWorkflowState(
    confirmed,
    "reminder_scheduled",
    "Recordatorio 5 dias programado tras la confirmación.",
  );

  await upsertReservation(confirmed);
  await replaceRemindersForReservation(confirmed.reservationId, [reminder]);

  await appendLog({
    level: "info",
    event: "reservation_confirmed",
    message: `Reserva ${confirmed.reservationId} confirmada y recordatorio programado.`,
  });

  return {
    reservation: confirmed,
    reminder,
    sheetWritePlan,
  };
}

export async function sendReservationReply(
  reservationId: string,
) {
  const reservation = await findReservationById(reservationId);

  if (!reservation) {
    throw new Error(`No existe la reserva ${reservationId}.`);
  }

  const facade = createWhatsAppOutputFacade();
  const result = await facade.send(
    buildWhatsAppOutputPayload({
      reservation,
      availability: mapDomainAvailabilityToLegacy(reservation.availability),
      pricing: reservation.pricing ?? null,
      reviewFlags: reservation.reviewFlags,
    }),
  );

  await appendLog({
    level: "info",
    event: "reservation_reply_dispatched",
    message: `Salida WhatsApp preparada para ${reservation.reservationId} en modo ${result.mode}.`,
  });

  return {
    reservationId: reservation.reservationId,
    channel: "whatsapp",
    result,
  };
}

export async function requestReservationCancellation(
  reservationId: string,
): Promise<ReservationCancellationRequestResult> {
  const reservation = await findReservationById(reservationId);

  if (!reservation) {
    throw new Error(`No existe la reserva ${reservationId}.`);
  }

  const requestedAt = new Date().toISOString();
  const updatedReservation = {
    ...reservation,
    cancellationRequestedAt: requestedAt,
    manualFollowupRequired: true,
    updatedAt: requestedAt,
    specialNotes: [
      reservation.specialNotes,
      "Solicitud de cancelacion registrada para gestion manual. No se ejecuta cancelacion operativa ni escritura en Sheets en esta fase.",
    ].filter(Boolean).join(" "),
  } satisfies ReservationRecord;

  await upsertReservation(updatedReservation);
  await appendLog({
    level: "info",
    event: "reservation_cancellation_requested",
    message: `Solicitud de cancelacion registrada para ${reservationId}; pendiente de gestion manual.`,
  });

  return {
    reservation: updatedReservation,
    message:
      "La reserva puede cancelarse sin coste adicional. Hemos dejado la solicitud registrada para que el equipo la gestione manualmente; en esta fase no se cancela operativamente en Sheets.",
  };
}

export async function dispatchDueReminders(
  now = new Date(),
): Promise<ReminderDispatchResultSummary> {
  const state = await loadDemoState();
  const flags = getHotelFeatureFlags();
  const webhookUrl = getReminderWebhookUrl();
  const dueReminders = state.reminders.filter(
    (item) =>
      item.status === "pendiente" &&
      new Date(item.scheduledFor).getTime() <= now.getTime(),
  );

  const reminders: ReminderJob[] = [];
  let sent = 0;
  let failed = 0;
  let previewed = 0;

  for (const reminder of dueReminders) {
    const reservation = await findReservationById(reminder.reservationId);

    if (!reservation || reservation.status !== "confirmada") {
      const skippedReminder = await markReminder(reminder.reminderId, (current) =>
        withReminderTrace(current, "skipped", "Recordatorio omitido: la reserva no esta confirmada.", {
          status: "fallido",
          mode: "preview",
          lastError: "reservation_not_confirmed",
        }),
      );

      if (skippedReminder) {
        reminders.push(skippedReminder);
      }

      failed += 1;
      continue;
    }

    if (reservation.reminderSentAt || reminder.sentAt) {
      const skippedReminder = await markReminder(reminder.reminderId, (current) =>
        withReminderTrace(current, "duplicate_skipped", "Recordatorio ya enviado; se evita duplicado.", {
          status: "enviado",
          sentAt: reservation.reminderSentAt ?? current.sentAt ?? new Date().toISOString(),
        }),
      );

      if (skippedReminder) {
        reminders.push(skippedReminder);
      }

      continue;
    }

    if (!flags.useRemindersReal || !webhookUrl) {
      const sentAt = new Date().toISOString();
      const previewReminder = await markReminder(
        reminder.reminderId,
        (current) =>
          withReminderTrace(
            current,
            "preview",
            "Recordatorio preparado en preview; se marca como enviado para mantener idempotencia en modo no real.",
            {
              status: "enviado",
              mode: "preview",
              attempts: (current.attempts ?? 0) + 1,
              sentAt,
            },
          ),
      );

      if (previewReminder) {
        reminders.push(previewReminder);
      }

      const updatedReservation = appendWorkflowState(
        {
          ...reservation,
          reminderSentAt: sentAt,
          updatedAt: sentAt,
        },
        "reminder_sent",
        "Recordatorio preparado en preview y marcado como enviado para idempotencia.",
      );
      await upsertReservation(updatedReservation);
      previewed += 1;
      continue;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reservationId: reminder.reservationId,
          reminderId: reminder.reminderId,
          scheduledFor: reminder.scheduledFor,
          message: reminder.messagePreview,
          channel: reminder.channel,
        }),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const sentReminder = await markReminder(reminder.reminderId, (current) =>
        withReminderTrace(current, "sent", "Recordatorio enviado correctamente.", {
          status: "enviado",
          mode: "real",
          attempts: (current.attempts ?? 0) + 1,
          sentAt: new Date().toISOString(),
        }),
      );

      if (sentReminder) {
        reminders.push(sentReminder);
      }

      const sentAt = sentReminder?.sentAt ?? new Date().toISOString();
      const updatedReservation = appendWorkflowState(
        {
          ...reservation,
          reminderSentAt: sentAt,
          updatedAt: sentAt,
        },
        "reminder_sent",
        "Recordatorio enviado por webhook real.",
      );
      await upsertReservation(updatedReservation);

      sent += 1;
    } catch (error) {
      const failedReminder = await markReminder(reminder.reminderId, (current) =>
        withReminderTrace(current, "failed", "No se pudo enviar el recordatorio.", {
          status: "fallido",
          mode: "real",
          attempts: (current.attempts ?? 0) + 1,
          failedAt: new Date().toISOString(),
          lastError: error instanceof Error ? error.message : "unknown_error",
        }),
      );

      if (failedReminder) {
        reminders.push(failedReminder);
      }

      failed += 1;
    }
  }

  if (dueReminders.length > 0) {
    await appendLog({
      level: failed > 0 ? "warn" : "info",
      event: "reminders_dispatch_run",
      message: `Dispatch de recordatorios: ${sent} enviados, ${failed} fallidos, ${previewed} en preview.`,
    });
  }

  return {
    due: dueReminders.length,
    sent,
    failed,
    previewed,
    reminders,
  };
}
