import { scheduleMaternalyCharlaReminder } from "./scheduler";
import type {
  MaternalyReminderRepository,
  MaternalyReminderScheduleResult,
  ScheduleMaternalyCharlaReminderInput,
} from "./types";

/**
 * Application-facing port. Conversation and Sheets code can depend on this
 * contract without importing PostgreSQL, Twilio or the dispatcher.
 */
export interface MaternalyReminderLifecycle {
  scheduleCharla(
    input: ScheduleMaternalyCharlaReminderInput,
  ): Promise<MaternalyReminderScheduleResult>;
  cancelPendingForRegistration(registrationId: string, now?: Date): Promise<number>;
}

export function createMaternalyReminderLifecycle(
  repository: MaternalyReminderRepository,
): MaternalyReminderLifecycle {
  return {
    scheduleCharla(input) {
      return scheduleMaternalyCharlaReminder(input, repository);
    },
    cancelPendingForRegistration(registrationId, now = new Date()) {
      return repository.cancelPendingForRegistration(registrationId, now);
    },
  };
}
