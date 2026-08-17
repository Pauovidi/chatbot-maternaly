import {
  buildMaternalyCharlaReminderMessage,
  MaternalyReminderConfigurationError,
} from "./content";
import { MATERNALY_REMINDER_DEFAULT_LEASE_MS } from "./types";
import type {
  MaternalyReminderDispatchItem,
  MaternalyReminderDispatchResult,
  MaternalyReminderRecord,
  MaternalyReminderRepository,
  MaternalyReminderSourceOfTruth,
  MaternalyReminderTransport,
} from "./types";

export interface DispatchDueMaternalyRemindersInput {
  repository: MaternalyReminderRepository;
  transport: MaternalyReminderTransport;
  now?: Date;
  limit?: number;
  leaseMs?: number;
  retryDelayMs?: (attempt: number) => number;
  sourceOfTruth?: MaternalyReminderSourceOfTruth;
}

function safeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }
  return "Unknown reminder transport failure.";
}

function outcomeAfterRetry(
  record: MaternalyReminderRecord,
): "retry_scheduled" | "cancelled" | "failed" {
  if (record.status === "cancelled") {
    return "cancelled";
  }
  return record.status === "failed" ? "failed" : "retry_scheduled";
}

async function processClaimedReminder(
  reminder: MaternalyReminderRecord,
  input: DispatchDueMaternalyRemindersInput,
  now: Date,
  retryDelayMs: (attempt: number) => number,
): Promise<MaternalyReminderDispatchItem> {
  const leaseToken = reminder.leaseToken;
  if (!leaseToken) {
    return {
      reminderId: reminder.reminderId,
      outcome: "failed",
      error: `Claimed reminder ${reminder.reminderId} has no lease token.`,
    };
  }

  if (new Date(reminder.sessionStartsAt).getTime() <= now.getTime()) {
    try {
      const updated = await input.repository.markBlocked({
        reminderId: reminder.reminderId,
        leaseToken,
        now,
        reason: "session_elapsed",
      });
      return {
        reminderId: reminder.reminderId,
        outcome: updated.status === "cancelled" ? "cancelled" : "blocked",
        error: "session_elapsed",
      };
    } catch (error) {
      return {
        reminderId: reminder.reminderId,
        outcome: "failed",
        error: `Expired-session state update failed: ${safeError(error)}`.slice(0, 300),
      };
    }
  }

  let payload;
  try {
    payload = buildMaternalyCharlaReminderMessage(reminder);
  } catch (error) {
    const message = safeError(error);
    if (!(error instanceof MaternalyReminderConfigurationError)) {
      return { reminderId: reminder.reminderId, outcome: "failed", error: message };
    }
    try {
      const updated = await input.repository.markBlocked({
        reminderId: reminder.reminderId,
        leaseToken,
        now,
        reason: message,
      });
      return {
        reminderId: reminder.reminderId,
        outcome: updated.status === "cancelled" ? "cancelled" : "blocked",
        error: message,
      };
    } catch (repositoryError) {
      return {
        reminderId: reminder.reminderId,
        outcome: "failed",
        error: `${message} State update failed: ${safeError(repositoryError)}`.slice(0, 300),
      };
    }
  }

  if (input.sourceOfTruth) {
    let validation;
    try {
      validation = await input.sourceOfTruth.validate(reminder, now);
    } catch (error) {
      validation = {
        status: "uncertain" as const,
        reason: `source_of_truth_read_failed:${safeError(error)}`.slice(0, 300),
      };
    }
    if (validation.status !== "valid") {
      const reason = `source_of_truth_${validation.status}:${validation.reason}`.slice(0, 300);
      try {
        if (validation.status === "uncertain") {
          const updated = await input.repository.markRetry({
            reminderId: reminder.reminderId,
            leaseToken,
            now,
            retryAt: new Date(now.getTime() + retryDelayMs(reminder.attempts)),
            error: reason,
          });
          return {
            reminderId: reminder.reminderId,
            outcome: outcomeAfterRetry(updated),
            error: reason,
          };
        }
        const updated = await input.repository.markBlocked({
          reminderId: reminder.reminderId,
          leaseToken,
          now,
          reason,
        });
        return {
          reminderId: reminder.reminderId,
          outcome: updated.status === "cancelled" ? "cancelled" : "blocked",
          error: reason,
        };
      } catch (error) {
        return {
          reminderId: reminder.reminderId,
          outcome: "failed",
          error: `${reason} State update failed: ${safeError(error)}`.slice(0, 300),
        };
      }
    }
  }

  try {
    const active = await input.repository.revalidateClaim({
      reminderId: reminder.reminderId,
      leaseToken,
      now,
    });
    if (!active) {
      const current = await input.repository.getById(reminder.reminderId);
      const cancelled = current?.status === "cancelled" || Boolean(current?.cancelRequestedAt);
      const blocked = current?.status === "blocked";
      return {
        reminderId: reminder.reminderId,
        outcome: cancelled ? "cancelled" : blocked ? "blocked" : "failed",
        error: cancelled
          ? undefined
          : blocked
            ? current.blockedReason
            : "Reminder lease was no longer active before delivery.",
      };
    }
  } catch (error) {
    return {
      reminderId: reminder.reminderId,
      outcome: "failed",
      error: `Reminder claim revalidation failed: ${safeError(error)}`.slice(0, 300),
    };
  }

  let response;
  try {
    response = await input.transport.send(payload);
  } catch (error) {
    const message = `ambiguous_delivery_requires_reconciliation: ${safeError(error)}`.slice(
      0,
      300,
    );
    try {
      const updated = await input.repository.markBlocked({
        reminderId: reminder.reminderId,
        leaseToken,
        now,
        reason: message,
      });
      return {
        reminderId: reminder.reminderId,
        outcome: updated.status === "cancelled" ? "cancelled" : "blocked",
        error: message,
      };
    } catch (repositoryError) {
      return {
        reminderId: reminder.reminderId,
        outcome: "failed",
        error: `${message} Reconciliation state update failed: ${safeError(repositoryError)}`.slice(
          0,
          300,
        ),
      };
    }
  }

  if (response.ok) {
    try {
      await input.repository.markSent({
        reminderId: reminder.reminderId,
        leaseToken,
        sentAt: now,
        providerMessageId: response.providerMessageId,
      });
      return { reminderId: reminder.reminderId, outcome: "sent" };
    } catch (error) {
      return {
        reminderId: reminder.reminderId,
        outcome: "failed",
        error: `Provider accepted the reminder but sent-state persistence failed: ${safeError(error)}`.slice(
          0,
          300,
        ),
      };
    }
  }

  const providerError = response.error?.slice(0, 300) || "Reminder provider rejected the message.";
  const error = response.deliveryUncertain
    ? `ambiguous_delivery_requires_reconciliation: ${providerError}`.slice(0, 300)
    : providerError;
  try {
    if (response.deliveryUncertain || response.retryable === false) {
      const updated = await input.repository.markBlocked({
        reminderId: reminder.reminderId,
        leaseToken,
        now,
        reason: error,
      });
      return {
        reminderId: reminder.reminderId,
        outcome: updated.status === "cancelled" ? "cancelled" : "blocked",
        error,
      };
    }
    const updated = await input.repository.markRetry({
      reminderId: reminder.reminderId,
      leaseToken,
      now,
      retryAt: new Date(now.getTime() + retryDelayMs(reminder.attempts)),
      error,
    });
    return {
      reminderId: reminder.reminderId,
      outcome: outcomeAfterRetry(updated),
      error,
    };
  } catch (repositoryError) {
    return {
      reminderId: reminder.reminderId,
      outcome: "failed",
      error: `${error} State update failed: ${safeError(repositoryError)}`.slice(0, 300),
    };
  }
}

export async function dispatchDueMaternalyReminders(
  input: DispatchDueMaternalyRemindersInput,
): Promise<MaternalyReminderDispatchResult> {
  const now = input.now ?? new Date();
  const retryDelayMs = input.retryDelayMs ?? ((attempt: number) => 5 * 60_000 * 2 ** (attempt - 1));
  const claimed = await input.repository.claimDue({
    now,
    limit: input.limit ?? 50,
    leaseMs: Math.max(
      MATERNALY_REMINDER_DEFAULT_LEASE_MS,
      input.leaseMs ?? MATERNALY_REMINDER_DEFAULT_LEASE_MS,
    ),
  });
  // Claimed jobs share the same lease start. Begin every external operation
  // immediately so later batch items cannot spend their lease waiting behind
  // earlier Twilio timeouts.
  const items: MaternalyReminderDispatchItem[] = await Promise.all(
    claimed.map(async (reminder) => {
      try {
        return await processClaimedReminder(reminder, input, now, retryDelayMs);
      } catch (error) {
        return {
          reminderId: reminder.reminderId,
          outcome: "failed" as const,
          error: `Unexpected reminder item failure: ${safeError(error)}`.slice(0, 300),
        };
      }
    }),
  );

  return {
    claimed: claimed.length,
    sent: items.filter((item) => item.outcome === "sent").length,
    retryScheduled: items.filter((item) => item.outcome === "retry_scheduled").length,
    cancelled: items.filter((item) => item.outcome === "cancelled").length,
    blocked: items.filter((item) => item.outcome === "blocked").length,
    failed: items.filter((item) => item.outcome === "failed").length,
    items,
  };
}
