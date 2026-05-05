import type { DemoReservationRecord } from "@/lib/hotel/integrations/types";
import { buildReminderPreviewText, createReminderPlan } from "./reminders";
import { dispatchReminderPlan, queueReminderFromReservation } from "./scheduler";
import type { ReminderDispatchResult, ReminderPlan, ReminderSchedulingOptions } from "./types";

export function createReminderPreview(reservation: DemoReservationRecord, leadHours = 48): ReminderPlan {
  return createReminderPlan({
    reservation,
    leadHours,
  });
}

export function previewReminderMessage(reservation: DemoReservationRecord, leadHours = 48): string {
  const plan = createReminderPreview(reservation, leadHours);
  return buildReminderPreviewText(plan);
}

export async function scheduleReminderForReservation(
  reservation: DemoReservationRecord,
  options: ReminderSchedulingOptions = {},
): Promise<ReminderDispatchResult> {
  return queueReminderFromReservation(reservation, options);
}

export async function sendReminderPreview(
  plan: ReminderPlan,
  options: ReminderSchedulingOptions = {},
): Promise<ReminderDispatchResult> {
  return dispatchReminderPlan(plan, {
    ...options,
    mode: "mock",
  });
}

