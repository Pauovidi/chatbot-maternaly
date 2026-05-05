import { HOTEL_SLOT_LABELS, HOTEL_SLOT_WINDOWS } from "@/lib/hotel/domain/slots";
import type { DemoReservationRecord, ReminderJob as PersistedReminderJob } from "@/lib/hotel/integrations/types";
import type { ReminderPlan, ReminderPlanInput, ReminderSelectionResult, ReminderState, ReminderTraceEvent } from "./types";
import { REMINDER_DEFAULT_CONFIG } from "./config";

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function buildReminderDateTime(date: string, time: string): string {
  return `${date}T${time}:00.000Z`;
}

function slotLabel(slot: DemoReservationRecord["entrySlot"]): string {
  return HOTEL_SLOT_LABELS[slot].toLowerCase();
}

function slotTime(slot: DemoReservationRecord["entrySlot"]): string {
  return slot === "morning" ? HOTEL_SLOT_WINDOWS.morning.start : HOTEL_SLOT_WINDOWS.afternoon.start;
}

function createTraceEvent(
  stage: string,
  message: string,
  payload?: Record<string, unknown>,
  now?: Date,
): ReminderTraceEvent {
  return {
    at: nowIso(now),
    stage,
    message,
    payload,
  };
}

export function buildReminderPreviewText(plan: Pick<ReminderPlan, "petName" | "ownerName" | "entryDate" | "entrySlot" | "leadHours">): string {
  const owner = plan.ownerName?.trim() || "familia";
  return [
    `Hola ${owner},`,
    "",
    `Os recordamos que ${plan.petName} entra el ${plan.entryDate} por la ${slotLabel(plan.entrySlot)}.`,
    `Este aviso se ha programado ${plan.leadHours === 120 ? "5 dias" : `${plan.leadHours} horas`} antes de la entrada.`,
    "",
    "Si necesitais cambiar algo, responded a este mensaje cuanto antes.",
  ].join("\n");
}

export function createReminderPlan(
  input: ReminderPlanInput,
): ReminderPlan {
  const leadHours = input.leadHours ?? REMINDER_DEFAULT_CONFIG.defaultLeadHours;
  const entryAt = buildReminderDateTime(input.reservation.entryDate, slotTime(input.reservation.entrySlot));
  const dueAt = new Date(new Date(entryAt).getTime() - leadHours * 60 * 60 * 1000).toISOString();
  const reminderId = input.reminderId ?? crypto.randomUUID();
  const now = input.now ?? new Date();
  const trace = [
    createTraceEvent("created", "Recordatorio creado desde la reserva", {
      reservationId: input.reservation.id,
      entryDate: input.reservation.entryDate,
      entrySlot: input.reservation.entrySlot,
    }, now),
    createTraceEvent("scheduled", "Recordatorio planificado 5 dias antes", {
      dueAt,
      entryAt,
      leadHours,
    }, now),
  ];

  return {
    reminderId,
    reservationId: input.reservation.id,
    petName: input.reservation.petName,
    ownerName: input.reservation.ownerName,
    phoneE164: input.reservation.phoneE164,
    entryDate: input.reservation.entryDate,
    entrySlot: input.reservation.entrySlot,
    entryAt,
    dueAt,
    leadHours,
    channel: input.channel ?? REMINDER_DEFAULT_CONFIG.defaultChannel,
    mode: REMINDER_DEFAULT_CONFIG.defaultMode,
    state: "scheduled",
    previewText: buildReminderPreviewText({
      petName: input.reservation.petName,
      ownerName: input.reservation.ownerName,
      entryDate: input.reservation.entryDate,
      entrySlot: input.reservation.entrySlot,
      leadHours,
    }),
    trace,
    sourceStatus: input.reservation.status,
  };
}

export function transitionReminderState(
  reminder: ReminderPlan,
  state: ReminderState,
  stage: string,
  message: string,
  payload?: Record<string, unknown>,
): ReminderPlan {
  return {
    ...reminder,
    state,
    trace: [
      ...reminder.trace,
      createTraceEvent(stage, message, payload),
    ].slice(-25),
  };
}

export function selectDueReminderPlans(
  plans: ReminderPlan[],
  now: Date = new Date(),
): ReminderSelectionResult {
  const nowIsoValue = now.toISOString();
  const due = plans.filter((plan) => plan.dueAt <= nowIsoValue && plan.state !== "sent" && plan.state !== "skipped");
  const pending = plans.filter((plan) => plan.dueAt > nowIsoValue && plan.state !== "sent" && plan.state !== "skipped");
  const overdue = plans.filter((plan) => plan.dueAt < nowIsoValue && plan.state !== "sent" && plan.state !== "skipped");

  return { due, pending, overdue };
}

export function toPersistedReminderJob(reminder: ReminderPlan): PersistedReminderJob & Record<string, unknown> {
  return {
    id: reminder.reminderId,
    reservationId: reminder.reservationId,
    petName: reminder.petName,
    ownerName: reminder.ownerName,
    phoneE164: reminder.phoneE164,
    dueAt: reminder.dueAt,
    reminderWindowStartsAt: reminder.entryAt,
    entryDate: reminder.entryDate,
    entrySlot: reminder.entrySlot,
    status: reminder.state === "sent" ? "sent" : reminder.state === "paused" ? "paused" : "queued",
    channel: reminder.channel,
    notes: reminder.previewText,
    state: reminder.state,
    mode: reminder.mode,
    leadHours: reminder.leadHours,
    trace: reminder.trace,
  };
}

export function isReservationEligibleForReminder(status: DemoReservationRecord["status"]): boolean {
  return status === "available" || status === "confirmed";
}

export function buildReminderSummary(plans: ReminderPlan[]): string {
  if (plans.length === 0) {
    return "No hay recordatorios en cola";
  }

  return plans
    .slice()
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
    .map((plan) => `${plan.petName} - ${plan.entryDate} ${plan.entrySlot} - ${plan.state}`)
    .join("\n");
}
