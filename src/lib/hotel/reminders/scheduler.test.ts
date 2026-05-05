import { describe, expect, it } from "vitest";

import { createReminderPlan } from "./reminders";
import {
  dispatchReminderPlan,
  queueReminderFromReservation,
  shouldQueueReminder,
} from "./scheduler";
import type { ReminderPersistenceAdapter, ReminderTransportAdapter } from "./types";

const reservation = {
  id: "res-101",
  petKey: "nala",
  petName: "Nala",
  ownerName: "Marta",
  phoneE164: "+34699111222",
  entryDate: "2026-05-10",
  entrySlot: "morning" as const,
  exitDate: "2026-05-12",
  exitSlot: "morning" as const,
  dogs: 1,
  status: "available" as const,
  source: "email" as const,
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
};

describe("scheduler", () => {
  it("shouldQueueReminder acepta los estados operativos", () => {
    expect(shouldQueueReminder("available")).toBe(true);
    expect(shouldQueueReminder("confirmed")).toBe(true);
    expect(shouldQueueReminder("pending")).toBe(false);
  });

  it("en modo mock se deja preview y se guarda trazabilidad", async () => {
    let savedReminder: unknown;
    let savedLog: unknown;

    const persistence: ReminderPersistenceAdapter = {
      async saveReminder(reminder) {
        savedReminder = reminder;
      },
      async appendLog(entry) {
        savedLog = entry;
        return {
          id: "log-1",
          at: "2026-05-01T12:00:00.000Z",
          ...entry,
        };
      },
    };

    const result = await queueReminderFromReservation(reservation, {
      mode: "mock",
      persistence,
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBe("preview");
    expect(result.previewed).toBe(true);
    expect(savedReminder).toBeDefined();
    expect(savedLog).toBeDefined();
  });

  it("en modo real sin webhook se hace fallback a preview", async () => {
    const persistence: ReminderPersistenceAdapter = {
      async saveReminder() {},
      async appendLog(entry) {
        return {
          id: "log-2",
          at: "2026-05-01T12:00:00.000Z",
          ...entry,
        };
      },
    };

    const transport: ReminderTransportAdapter = {
      async send() {
        return {
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          bodyText: "offline",
        };
      },
    };

    const plan = createReminderPlan({ reservation });
    const result = await dispatchReminderPlan(plan, {
      mode: "real",
      persistence,
      transport,
      fallbackToPreview: true,
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBe("preview");
    expect(result.delivered).toBe(false);
    expect(result.previewed).toBe(true);
  });
});
