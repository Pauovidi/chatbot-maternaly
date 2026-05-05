import type {
  DemoReservationRecord,
  SheetsAvailabilityResult,
  WhatsappMessagePayload,
} from "@/lib/hotel/integrations/types";

function formatSlot(slot: string): string {
  return slot === "morning" ? "turno de manana" : "turno de tarde";
}

function formatPrice(price: number | null): string {
  if (price === null) {
    return "Precio pendiente de revision";
  }

  return `${price.toFixed(2).replace(".", ",")} EUR`;
}

function buildTimeAdjustmentLines(reservation: DemoReservationRecord): string[] {
  return [
    reservation.checkInTimeWasAdjusted
      ? `Entrada ajustada por horario: solicitada ${reservation.originalRequestedCheckInTime}, aplicada ${reservation.normalizedCheckInTime}.`
      : undefined,
    reservation.checkOutTimeWasAdjusted
      ? `Salida ajustada por horario: solicitada ${reservation.originalRequestedCheckOutTime}, aplicada ${reservation.normalizedCheckOutTime}.`
      : undefined,
  ].filter((line): line is string => Boolean(line));
}

export function buildBookingWhatsAppMessage(
  payload: WhatsappMessagePayload,
): string {
  const { reservation, availability, price, reviewReasons, formUrl } = payload;
  const adjustmentLines = buildTimeAdjustmentLines(reservation);
  const lines = [
    `Hola ${reservation.ownerName ?? "familia"},`,
    "",
    `Hemos recibido la solicitud de ${reservation.petName}.`,
    availability?.available
      ? `Hay disponibilidad para ${formatSlot(reservation.entrySlot)} y ${formatSlot(reservation.exitSlot)}.`
      : "Ahora mismo no tenemos hueco para esas fechas y turnos.",
    `Precio estimado: ${formatPrice(price)}`,
  ];

  if (adjustmentLines.length > 0) {
    lines.push(
      "",
      "La hora introducida estaba fuera del horario operativo del centro.",
      ...adjustmentLines,
      "Horario correcto: 08:00-11:00 y 16:30-19:30.",
    );
  }

  if (reviewReasons.length > 0) {
    lines.push(
      "",
      "La solicitud queda marcada para revision manual:",
      ...reviewReasons.map((reason) => `- ${reason}`),
    );
  }

  lines.push(
    "",
    `Para completar la reserva, debe enviarla desde el formulario: ${formUrl}`,
    "El pago se realiza a la llegada en efectivo, Bizum o transferencia; la señal no es obligatoria, aunque se acepta por Bizum o transferencia.",
    "",
    "Gracias por confiar en Somos Muy Perros.",
  );

  return lines.join("\n");
}

export function buildAvailabilityConfirmationMessage(
  reservation: DemoReservationRecord,
  price: number,
  formUrl: string,
): string {
  return [
    `Hola ${reservation.ownerName ?? "familia"},`,
    "",
    `Tenemos hueco para ${reservation.petName}.`,
    `Importe estimado: ${price.toFixed(2).replace(".", ",")} EUR`,
    "",
    `Para cerrar la reserva, use el formulario oficial: ${formUrl}`,
  ].join("\n");
}

export function buildNoAvailabilityMessage(
  reservation: DemoReservationRecord,
  formUrl: string,
): string {
  return [
    `Hola ${reservation.ownerName ?? "familia"},`,
    "",
    `Ahora mismo no tenemos disponibilidad para ${reservation.petName} en esas fechas.`,
    "",
    `Si quiere, puede probar otra combinacion desde el formulario oficial: ${formUrl}`,
  ].join("\n");
}

export function buildFAQRedirectMessage(formUrl: string): string {
  return `Para reservar, siempre hay que completar el formulario oficial: ${formUrl}`;
}

export function describeAvailabilityResult(
  result: SheetsAvailabilityResult | null,
): string {
  if (!result) {
    return "Disponibilidad no evaluada";
  }

  return result.available ? "Hay disponibilidad" : "No hay disponibilidad";
}
