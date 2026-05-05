export const RESERVATION_STATUSES = [
  "pendiente",
  "disponible",
  "sin_disponibilidad",
  "confirmada",
  "cancelada",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_WORKFLOW_STATES = [
  "detected",
  "parsed",
  "pending_review",
  "available",
  "no_availability",
  "confirmed",
  "cancelled",
  "reminder_scheduled",
  "reminder_sent",
  "failed",
] as const;

export type ReservationWorkflowState = (typeof RESERVATION_WORKFLOW_STATES)[number];

export const RESERVATION_REVIEW_FLAGS = [
  "falta_nombre_perro",
  "falta_telefono",
  "falta_fecha_entrada",
  "falta_fecha_salida",
  "falta_turno_entrada",
  "falta_turno_salida",
  "invalid_slot",
  "numero_perros_ambiguous",
  "telefono_no_normalizado",
  "fecha_incompleta",
  "requiere_revision_manual",
] as const;

export type ReservationReviewFlag = (typeof RESERVATION_REVIEW_FLAGS)[number];

export type ReservationReviewState = "ok" | "necesita_revision";

export type ReservationSource = "email" | "web" | "manual" | "demo";

export type ProcessingMode = "mock" | "real";

export type IntegrationSwitch = "on" | "off";

export interface ReservationWorkflowTransition {
  from: ReservationWorkflowState;
  to: ReservationWorkflowState;
  at: string;
  reason?: string;
}

export const RESERVATION_WORKFLOW_TRANSITIONS: Record<
  ReservationWorkflowState,
  readonly ReservationWorkflowState[]
> = {
  detected: ["parsed", "failed"],
  parsed: ["pending_review", "available", "no_availability", "failed"],
  pending_review: ["available", "no_availability", "failed"],
  available: ["confirmed", "cancelled", "reminder_scheduled", "failed"],
  no_availability: ["failed"],
  confirmed: ["cancelled", "reminder_scheduled", "reminder_sent", "failed"],
  cancelled: [],
  reminder_scheduled: ["cancelled", "reminder_sent", "failed"],
  reminder_sent: ["cancelled", "failed"],
  failed: [],
} as const;

export function canTransitionWorkflowState(
  from: ReservationWorkflowState,
  to: ReservationWorkflowState,
): boolean {
  return RESERVATION_WORKFLOW_TRANSITIONS[from].includes(to);
}

export function isTerminalWorkflowState(
  state: ReservationWorkflowState,
): boolean {
  return state === "no_availability" || state === "cancelled" || state === "reminder_sent" || state === "failed";
}

export function mapLegacyReservationStatusToWorkflowState(
  status: ReservationStatus,
): ReservationWorkflowState {
  switch (status) {
    case "pendiente":
      return "pending_review";
    case "disponible":
      return "available";
    case "sin_disponibilidad":
      return "no_availability";
    case "confirmada":
      return "confirmed";
    case "cancelada":
      return "cancelled";
  }
}

export function mapWorkflowStateToLegacyReservationStatus(
  state: ReservationWorkflowState,
): ReservationStatus {
  switch (state) {
    case "detected":
    case "parsed":
    case "pending_review":
      return "pendiente";
    case "available":
      return "disponible";
    case "no_availability":
      return "sin_disponibilidad";
    case "cancelled":
      return "cancelada";
    case "confirmed":
    case "reminder_scheduled":
    case "reminder_sent":
      return "confirmada";
    case "failed":
      return "pendiente";
  }
}
