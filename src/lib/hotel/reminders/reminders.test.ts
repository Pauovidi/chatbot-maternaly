import { describe, expect, it } from "vitest";

import {
  createReminderPlan,
  selectDueReminderPlans,
  transitionReminderState,
} from "./reminders";

const reservation = {
  id: "res-001",
  petKey: "luna",
  petName: "Luna",
  ownerName: "Ana",
  phoneE164: "+34600111222",
  entryDate: "2026-04-10",
  entrySlot: "afternoon" as const,
  exitDate: "2026-04-12",
  exitSlot: "morning" as const,
  dogs: 1,
  status: "available" as const,
  source: "email" as const,
  createdAt: "2026-04-01T10:00:00.000Z",
  updatedAt: "2026-04-01T10:00:00.000Z",
};

describe("reminders", () => {
  it("planifica el recordatorio 5 dias antes de la entrada", () => {
    const plan = createReminderPlan({
      reservation,
      leadHours: 120,
      now: new Date("2026-04-01T10:00:00.000Z"),
    });

    expect(plan.state).toBe("scheduled");
    expect(plan.entryAt).toBe("2026-04-10T16:30:00.000Z");
    expect(plan.dueAt).toBe("2026-04-05T16:30:00.000Z");
    expect(plan.previewText).toContain("Luna");
    expect(plan.previewText).toContain("tarde");
  });

  it("la transicion de estado deja trazabilidad", () => {
    const plan = createReminderPlan({ reservation });
    const updated = transitionReminderState(plan, "queued", "queued", "En cola");

    expect(updated.state).toBe("queued");
    expect(updated.trace).toHaveLength(plan.trace.length + 1);
    expect(updated.trace.at(-1)?.stage).toBe("queued");
  });

  it("separar planos por due, pending y overdue funciona con orden temporal", () => {
    const due = createReminderPlan({ reservation, reminderId: "due" });
    const pending = createReminderPlan({
      reservation: {
        ...reservation,
        id: "res-002",
        entryDate: "2026-04-20",
      },
      reminderId: "pending",
    });

    const result = selectDueReminderPlans([due, pending], new Date("2026-04-09T00:00:00.000Z"));

    expect(result.due).toHaveLength(1);
    expect(result.pending).toHaveLength(1);
    expect(result.overdue).toHaveLength(1);
  });
});
