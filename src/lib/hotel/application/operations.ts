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
import { buildReservationReminderJob } from "./reminder-job";
import { processReservationEmail } from "./process-reservation";
import {
  getHotelEmailRuntimeConfig,
  getHotelFeatureFlags,
} from "../config";
import { createImapEmailSource, pollReservationMailbox } from "../email";
import type { ReminderJob, ReservationRecord } from "../domain/contracts";
import {
  mapLegacyReservationStatusToWorkflowState,
  type ReservationWorkflowState,
} from "../domain/states";
import { createWhatsAppOutputFacade } from "../output";
import { buildGoogleSheetAdapter } from "../sheets";
import type { SheetsWriteResult } from "../sheets/types";

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

function buildSheetRegistration(
  result: SheetsWriteResult,
): NonNullable<ReservationRecord["sheetRegistration"]> {
  return {
    sheetName: result.sheetName,
    reservationId: result.reservationId,
    rowHint: result.rowHint,
    cells: result.cellUpdates.map((update) => update.cell),
    writtenAt: new Date().toISOString(),
  };
}

function appendSpecialNote(
  current: string | undefined,
  note: string,
): string {
  return [current, note].filter(Boolean).join(" ");
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

  if (reservation.status === "cancelada") {
    throw new Error("No se puede confirmar una reserva cancelada.");
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
  if (getHotelFeatureFlags().useGoogleSheetsReal && !confirmed.sheetRegistration) {
    const adapter = await buildGoogleSheetAdapter();
    const legacyReservation = toLegacyReservationRecord(confirmed, "confirmada");
    try {
      const writeResult = await adapter.writeReservation(legacyReservation);
      sheetWritePlan = mapLegacyWritePlanToDemoPlan(writeResult, "confirmada");
      confirmed = {
        ...confirmed,
        sheetRegistration: buildSheetRegistration(writeResult),
      };
    } catch (error) {
      await appendLog({
        level: "error",
        event: "reservation_sheet_write_failed",
        message:
          error instanceof Error
            ? `No se pudo escribir la reserva ${reservationId} en Sheets: ${error.message}`
            : `No se pudo escribir la reserva ${reservationId} en Sheets por un error desconocido.`,
      });
      throw error;
    }
  } else if (confirmed.sheetRegistration) {
    sheetWritePlan = {
      sheetName: confirmed.sheetRegistration.sheetName,
      monthKey: confirmed.sheetRegistration.sheetName,
      prepared: true,
      colorKey: "reservado",
      colorHex: "#00B0F0",
      petName: confirmed.petName,
      notes: [
        `Reserva ya escrita en Sheets con referencia ${confirmed.sheetRegistration.reservationId}.`,
      ],
      cellUpdates: confirmed.sheetRegistration.cells.map((cell) => ({
        field: cell,
        value: confirmed.petName ?? "",
      })),
    };
  }

  const reminder = buildReservationReminderJob(confirmed);
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

  if (reservation.status === "cancelada") {
    await replaceRemindersForReservation(reservationId, []);
    return {
      reservation,
      message:
        "La reserva ya figura cancelada sin coste adicional. No queda ningun recordatorio pendiente.",
    };
  }

  if (getHotelFeatureFlags().useGoogleSheetsReal) {
    try {
      const adapter = await buildGoogleSheetAdapter();
      const cancellation = await adapter.cancelReservation(reservationId);
      const cancelled = appendWorkflowState(
        {
          ...reservation,
          status: "cancelada",
          cancellationRequestedAt: reservation.cancellationRequestedAt ?? requestedAt,
          cancellationCompletedAt: cancellation.cancelledAt,
          manualFollowupRequired: false,
          updatedAt: cancellation.cancelledAt,
          specialNotes: appendSpecialNote(
            reservation.specialNotes,
            `Cancelacion ejecutada en Sheets sin coste adicional. Celdas liberadas: ${cancellation.clearedCells.join(", ")}.`,
          ),
        },
        "cancelled",
        "Reserva cancelada operativamente en Google Sheets.",
      );

      await upsertReservation(cancelled);
      await replaceRemindersForReservation(reservationId, []);
      await appendLog({
        level: "info",
        event: "reservation_cancelled",
        message: `Reserva ${reservationId} cancelada en Sheets y recordatorios retirados.`,
      });

      return {
        reservation: cancelled,
        message:
          "La reserva ha quedado anulada sin coste adicional y ya se ha liberado en nuestro cuadrante.",
      };
    } catch (error) {
      const pendingFollowup = {
        ...reservation,
        cancellationRequestedAt: reservation.cancellationRequestedAt ?? requestedAt,
        manualFollowupRequired: true,
        updatedAt: requestedAt,
        specialNotes: appendSpecialNote(
          reservation.specialNotes,
          error instanceof Error
            ? `Cancelacion solicitada, pero no se pudo ejecutar automaticamente en Sheets: ${error.message}.`
            : "Cancelacion solicitada, pero no se pudo ejecutar automaticamente en Sheets.",
        ),
      } satisfies ReservationRecord;

      await upsertReservation(pendingFollowup);
      await replaceRemindersForReservation(reservationId, []);
      await appendLog({
        level: "warn",
        event: "reservation_cancellation_followup_required",
        message:
          error instanceof Error
            ? `Cancelacion de ${reservationId} pendiente de revision: ${error.message}`
            : `Cancelacion de ${reservationId} pendiente de revision por error desconocido.`,
      });

      return {
        reservation: pendingFollowup,
        message:
          "La reserva puede cancelarse sin coste adicional, pero no hemos podido localizarla de forma segura en Sheets por reservationId. La dejamos marcada para revisión manual y sin recordatorios pendientes.",
      };
    }
  }

  const updatedReservation = {
    ...reservation,
    cancellationRequestedAt: requestedAt,
    manualFollowupRequired: true,
    updatedAt: requestedAt,
    specialNotes: [
      reservation.specialNotes,
      "Solicitud de cancelacion registrada para gestion manual; Google Sheets real no esta activo en este entorno.",
    ].filter(Boolean).join(" "),
  } satisfies ReservationRecord;

  await upsertReservation(updatedReservation);
  await replaceRemindersForReservation(reservationId, []);
  await appendLog({
    level: "info",
    event: "reservation_cancellation_requested",
    message: `Solicitud de cancelacion registrada para ${reservationId}; pendiente de gestion manual.`,
  });

  return {
    reservation: updatedReservation,
    message:
      "La reserva puede cancelarse sin coste adicional. Google Sheets real no esta activo en este entorno, asi que queda registrada para gestion manual y sin recordatorios pendientes.",
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
