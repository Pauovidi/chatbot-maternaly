import { describe, expect, it } from "vitest";

import {
  canTransitionWorkflowState,
  mapLegacyReservationStatusToWorkflowState,
  mapWorkflowStateToLegacyReservationStatus,
  type ReservationStatus,
  type ReservationWorkflowState,
} from "./states";

describe("workflow state machine", () => {
  it("permite el recorrido esperado del workflow", () => {
    expect(canTransitionWorkflowState("detected", "parsed")).toBe(true);
    expect(canTransitionWorkflowState("parsed", "pending_review")).toBe(true);
    expect(canTransitionWorkflowState("pending_review", "available")).toBe(true);
    expect(canTransitionWorkflowState("available", "reminder_scheduled")).toBe(true);
    expect(canTransitionWorkflowState("reminder_scheduled", "reminder_sent")).toBe(true);
    expect(canTransitionWorkflowState("failed", "parsed")).toBe(false);
  });

  it("mapea los estados legados al workflow canónico y viceversa", () => {
    const cases: Array<[ReservationStatus, ReservationWorkflowState, ReservationStatus]> = [
      ["pendiente", "pending_review", "pendiente"],
      ["disponible", "available", "disponible"],
      ["sin_disponibilidad", "no_availability", "sin_disponibilidad"],
      ["confirmada", "confirmed", "confirmada"],
    ];

    for (const [legacy, workflow, roundTrip] of cases) {
      expect(mapLegacyReservationStatusToWorkflowState(legacy)).toBe(workflow);
      expect(mapWorkflowStateToLegacyReservationStatus(workflow)).toBe(roundTrip);
    }
  });
});
