import { getHotelFeatureFlags, getHotelRuntimeConfig } from "../config";
import { buildWhatsAppManualReminderMessage } from "../content/whatsapp-templates";
import type { ReminderJob, ReservationRecord } from "../domain/contracts";

function getSlotStartTime(slot: ReservationRecord["checkInSlot"]): string {
  return slot === "morning" ? "08:00:00" : "16:30:00";
}

export function buildReservationReminderJob(reservation: ReservationRecord): ReminderJob {
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
