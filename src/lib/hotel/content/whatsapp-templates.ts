import { HOTEL_DEMO_CONFIG } from "../config";
import type { AvailabilityResult, PricingQuote, ReservationRecord } from "../domain/contracts";

function formatReceptionWindow(): string {
  return "08:00-11:00 y 16:30-19:30";
}

function buildTimeAdjustmentLines(record?: ReservationRecord): string[] {
  if (!record) {
    return [];
  }

  return [
    record.checkInTimeWasAdjusted && record.checkInTimeAdjustmentMessage
      ? `Entrada: hora solicitada ${record.originalRequestedCheckInTime}, hora aplicada ${record.normalizedCheckInTime}. ${record.checkInTimeAdjustmentMessage}`
      : undefined,
    record.checkOutTimeWasAdjusted && record.checkOutTimeAdjustmentMessage
      ? `Salida: hora solicitada ${record.originalRequestedCheckOutTime}, hora aplicada ${record.normalizedCheckOutTime}. ${record.checkOutTimeAdjustmentMessage}`
      : undefined,
  ].filter((line): line is string => Boolean(line));
}

export function buildWhatsAppAvailabilityMessage(input: {
  petName?: string;
  ownerName?: string;
  availability: AvailabilityResult;
  pricing?: PricingQuote;
  reservation?: ReservationRecord;
}): string {
  const greeting = input.ownerName ? `Hola ${input.ownerName}` : "Hola";

  if (!input.availability.isAvailable) {
    return [
      `${greeting}, gracias por escribirnos.`,
      `En este momento no tenemos hueco para esas fechas.`,
      `Si quieres, puedes revisar otra fecha en el formulario: ${HOTEL_DEMO_CONFIG.bookingFormUrl}`,
    ].join(" ");
  }

  const pricingText = input.pricing
    ? `El precio estimado es de ${input.pricing.total.toFixed(2)} EUR.`
    : "Ya tenemos disponibilidad y estamos revisando el precio.";

  const petText = input.petName ? ` para ${input.petName}` : "";

  const timeAdjustmentLines = buildTimeAdjustmentLines(input.reservation);
  const isSheetConfirmed =
    input.reservation?.status === "confirmada" &&
    Boolean(input.reservation.sheetRegistration);
  const confirmationLine = isSheetConfirmed
    ? `La reserva ya queda anotada en nuestro cuadrante con referencia ${input.reservation?.reservationId}.`
    : "Si te encaja, completa el formulario web para dejar la reserva cerrada.";

  return [
    `${greeting}, sí tenemos disponibilidad${petText}.`,
    pricingText,
    confirmationLine,
    ...timeAdjustmentLines,
    "El pago se realiza a la llegada en efectivo, Bizum o transferencia. La señal no es obligatoria, aunque se acepta por Bizum o transferencia.",
    isSheetConfirmed ? undefined : HOTEL_DEMO_CONFIG.bookingFormUrl,
  ].filter((line): line is string => Boolean(line)).join(" ");
}

export function buildWhatsAppCancellationConfirmedMessage(record: ReservationRecord): string {
  const petText = record.petName ? ` de ${record.petName}` : "";
  return [
    `Hola ${record.ownerName ?? "familia"}, la reserva${petText} queda anulada sin coste adicional.`,
    `Referencia: ${record.reservationId}.`,
    "Ya no queda ningun recordatorio pendiente asociado a esta reserva.",
  ].join(" ");
}

export function buildWhatsAppManualReminderMessage(record: ReservationRecord): string {
  const petText = record.petName ? ` de ${record.petName}` : "";
  return [
    `Hola ${record.ownerName ?? "familia"}, os recordamos la reserva${petText}.`,
    `Fecha de entrada: ${record.checkInDate}.`,
    `Fecha de salida: ${record.checkOutDate}.`,
    `Horario de recepción: ${formatReceptionWindow()}.`,
    "Recordad traer microchip/cartilla sanitaria, rabia anual y desparasitación interna y externa al día.",
    "Si hay medicación o tratamiento, traed la posología por escrito y la medicación o instrumentos necesarios.",
    `Para cualquier ajuste podéis contactar por WhatsApp: ${HOTEL_DEMO_CONFIG.whatsappPhone}.`,
  ].join(" ");
}
