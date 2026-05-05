import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { confirmReservation, dispatchDueReminders, requestReservationCancellation } from "./operations";
import { loadDemoState } from "./demo-store";
import { processReservationEmail } from "./process-reservation";
import { MANUAL_SAMPLE_EMAIL } from "../parser/sample-emails";

describe("operations workflow", () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hotel-ops-"));
    process.chdir(tempDir);
    process.env.HOTEL_USE_MOCK_EMAIL_INPUT = "true";
    process.env.HOTEL_USE_GOOGLE_SHEETS_REAL = "false";
    process.env.HOTEL_USE_REMINDERS_REAL = "false";
  });

  afterEach(() => {
    delete process.env.HOTEL_USE_MOCK_EMAIL_INPUT;
    delete process.env.HOTEL_USE_GOOGLE_SHEETS_REAL;
    delete process.env.HOTEL_USE_REMINDERS_REAL;
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("confirma una reserva y programa un reminder 5 dias antes", async () => {
    const processed = await processReservationEmail({
      subject: "Solicitud",
      rawText: MANUAL_SAMPLE_EMAIL,
    });

    const confirmation = await confirmReservation(
      processed.reservation?.reservationId ?? "",
    );

    expect(confirmation.reservation.status).toBe("confirmada");
    expect(confirmation.reservation.workflowState).toBe("reminder_scheduled");

    const expectedCheckIn = new Date("2026-04-12T08:00:00");
    const actualReminder = new Date(confirmation.reminder.scheduledFor);
    expect(expectedCheckIn.getTime() - actualReminder.getTime()).toBe(120 * 60 * 60 * 1000);

    const state = await loadDemoState();
    expect(
      state.reminders.some(
        (item) =>
          item.reservationId === confirmation.reservation.reservationId &&
          item.status === "pendiente",
      ),
    ).toBe(true);
  });

  it("despacha recordatorios confirmados de forma idempotente en preview", async () => {
    const processed = await processReservationEmail({
      subject: "Solicitud",
      rawText: MANUAL_SAMPLE_EMAIL,
    });
    const confirmation = await confirmReservation(
      processed.reservation?.reservationId ?? "",
    );
    const first = await dispatchDueReminders(
      new Date(confirmation.reservation.checkInDate + "T08:00:00"),
    );
    const second = await dispatchDueReminders(
      new Date(confirmation.reservation.checkInDate + "T08:00:00"),
    );
    const state = await loadDemoState();
    const reservation = state.reservations.find(
      (item) => item.reservationId === confirmation.reservation.reservationId,
    );

    expect(first.previewed).toBe(1);
    expect(second.due).toBe(0);
    expect(reservation?.reminderSentAt).toBeDefined();
  });

  it("registra una solicitud de cancelacion manual si Sheets real no esta activo", async () => {
    const processed = await processReservationEmail({
      subject: "Solicitud",
      rawText: MANUAL_SAMPLE_EMAIL,
    });
    const result = await requestReservationCancellation(
      processed.reservation?.reservationId ?? "",
    );

    expect(result.message).toContain("sin coste adicional");
    expect(result.reservation.cancellationRequestedAt).toBeDefined();
    expect(result.reservation.manualFollowupRequired).toBe(true);
  });

  it("retira recordatorios cuando se solicita cancelacion", async () => {
    const processed = await processReservationEmail({
      subject: "Solicitud",
      rawText: MANUAL_SAMPLE_EMAIL,
    });
    const confirmation = await confirmReservation(
      processed.reservation?.reservationId ?? "",
    );

    await requestReservationCancellation(confirmation.reservation.reservationId);

    const state = await loadDemoState();
    expect(
      state.reminders.some(
        (item) => item.reservationId === confirmation.reservation.reservationId,
      ),
    ).toBe(false);
  });
});
