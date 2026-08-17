import { describe, expect, it, vi } from "vitest";
import { buildMaternalyCharlaReminderMessage } from "./content";
import { dispatchDueMaternalyReminders } from "./dispatcher";
import { createMaternalyReminderLifecycle } from "./lifecycle";
import { InMemoryMaternalyReminderRepository } from "./memory-repository";
import { buildMaternalyCharlaReminder, scheduleMaternalyCharlaReminder } from "./scheduler";
import type {
  MaternalyReminderOutboundMessage,
  MaternalyReminderTransport,
  ScheduleMaternalyCharlaReminderInput,
} from "./types";

const NOW = new Date("2026-08-01T10:00:00.000Z");

function onlineInput(
  overrides: Partial<ScheduleMaternalyCharlaReminderInput> = {},
): ScheduleMaternalyCharlaReminderInput {
  return {
    registrationId: "INS_CHARLA_001",
    sessionId: "SES_CHARLA_ONLINE_20260810",
    sessionStartsAt: "2026-08-10T19:00:00+02:00",
    phoneE164: "+34600111222",
    modality: "online",
    location: "Online",
    onlineAccess: {
      joinUrl: "https://zoom.us/j/123456789?pwd=synthetic",
      meetingId: "123 456 789",
      passcode: "MATERNALY",
    },
    now: NOW,
    ...overrides,
  };
}

function successfulTransport(send = vi.fn()): MaternalyReminderTransport {
  return {
    async send(payload) {
      send(payload);
      return { ok: true, providerMessageId: "SM_SYNTHETIC_REMINDER" };
    },
  };
}

describe("Maternaly Charla reminders", () => {
  it("plans the reminder exactly 48 hours before the session", () => {
    const reminder = buildMaternalyCharlaReminder(onlineInput());

    expect(reminder.leadHours).toBe(48);
    expect(reminder.sessionStartsAt).toBe("2026-08-10T17:00:00.000Z");
    expect(reminder.scheduledFor).toBe("2026-08-08T17:00:00.000Z");
    expect(reminder.nextAttemptAt).toBe(reminder.scheduledFor);
    expect(reminder.status).toBe("scheduled");
  });

  it("schedules immediately when a valid registration arrives inside the 48-hour window", () => {
    const reminder = buildMaternalyCharlaReminder(
      onlineInput({
        now: new Date("2026-08-09T12:00:00.000Z"),
      }),
    );

    expect(reminder.scheduledFor).toBe("2026-08-09T12:00:00.000Z");
  });

  it("requires an absolute session timestamp and a valid destination", () => {
    expect(() =>
      buildMaternalyCharlaReminder(onlineInput({ sessionStartsAt: "2026-08-10T19:00:00" })),
    ).toThrow(/explicit UTC offset/i);
    expect(() => buildMaternalyCharlaReminder(onlineInput({ phoneE164: "600111222" }))).toThrow(
      /E\.164/i,
    );
  });

  it("is idempotent when the same registration and session are scheduled concurrently", async () => {
    const repository = new InMemoryMaternalyReminderRepository();

    const results = await Promise.all([
      scheduleMaternalyCharlaReminder(onlineInput(), repository),
      scheduleMaternalyCharlaReminder(onlineInput(), repository),
    ]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.reminder.reminderId))).toHaveLength(1);
    expect(repository.list()).toHaveLength(1);
  });

  it("cancels the older pending reminder when the registration changes session", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const first = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const replacement = await scheduleMaternalyCharlaReminder(
      onlineInput({
        sessionId: "SES_CHARLA_ONLINE_20260811",
        sessionStartsAt: "2026-08-11T19:00:00+02:00",
      }),
      repository,
    );

    expect(replacement.created).toBe(true);
    expect(replacement.supersededCount).toBe(1);
    expect((await repository.getById(first.reminder.reminderId))?.status).toBe("cancelled");
    expect((await repository.getById(replacement.reminder.reminderId))?.status).toBe("scheduled");
  });

  it("renders modality-specific online and in-person instructions", () => {
    const online = buildMaternalyCharlaReminderMessage(
      buildMaternalyCharlaReminder(onlineInput()),
    );
    const presencial = buildMaternalyCharlaReminderMessage(
      buildMaternalyCharlaReminder(
        onlineInput({
          registrationId: "INS_CHARLA_002",
          sessionId: "SES_CHARLA_BILBAO_20261006",
          sessionStartsAt: "2026-10-06T17:00:00+02:00",
          modality: "presencial",
          location: "Bilbao",
          address: "Paseo Uribitarte 22, primero F, Bilbao",
          onlineAccess: undefined,
        }),
      ),
    );

    expect(online.body).toMatch(/Zoom|Enlace|ID de reuni[oó]n|Clave de acceso/i);
    expect(online.body).toContain("https://zoom.us/j/123456789?pwd=synthetic");
    expect(presencial.body).toMatch(/presencial en Bilbao/i);
    expect(presencial.body).toContain("Paseo Uribitarte 22, primero F, Bilbao");
    expect(presencial.body).not.toMatch(/Zoom|ID de reuni[oó]n|Clave de acceso/i);
  });

  it("does not claim or send a reminder before its due time", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const send = vi.fn();

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: successfulTransport(send),
      now: new Date("2026-08-08T16:59:59.000Z"),
    });

    expect(result.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("retries a transient source-of-truth read failure without sending", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const send = vi.fn();
    const now = new Date("2026-08-08T17:00:00.000Z");

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: successfulTransport(send),
      sourceOfTruth: {
        validate: vi.fn(async () => ({
          status: "uncertain" as const,
          reason: "registration_read_error",
        })),
      },
      now,
      retryDelayMs: () => 60_000,
    });

    expect(result).toMatchObject({ claimed: 1, retryScheduled: 1, sent: 0, blocked: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(await repository.getById(scheduled.reminder.reminderId)).toMatchObject({
      status: "scheduled",
      nextAttemptAt: "2026-08-08T17:01:00.000Z",
    });
  });

  it("blocks an elapsed session in the repository without claiming it", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const send = vi.fn();

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: successfulTransport(send),
      now: new Date("2026-08-10T17:00:00.000Z"),
    });

    expect(result).toMatchObject({ claimed: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(await repository.getById(scheduled.reminder.reminderId)).toMatchObject({
      status: "blocked",
      blockedReason: "session_elapsed",
    });
  });

  it("rechecks session time in the dispatcher before calling the transport", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const claimDue = repository.claimDue.bind(repository);
    vi.spyOn(repository, "claimDue").mockImplementationOnce((input) =>
      claimDue({
        ...input,
        now: new Date("2026-08-10T16:59:59.999Z"),
      }),
    );
    const send = vi.fn();

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: successfulTransport(send),
      now: new Date("2026-08-10T17:00:00.000Z"),
    });

    expect(result).toMatchObject({ claimed: 1, blocked: 1, sent: 0 });
    expect(result.items[0]).toMatchObject({ outcome: "blocked", error: "session_elapsed" });
    expect(send).not.toHaveBeenCalled();
    expect(await repository.getById(scheduled.reminder.reminderId)).toMatchObject({
      status: "blocked",
      blockedReason: "session_elapsed",
    });
  });

  it("claims concurrently but sends only once and never resends a sent reminder", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const send = vi.fn();
    const options = {
      repository,
      transport: successfulTransport(send),
      now: new Date("2026-08-08T17:00:00.000Z"),
    };

    const [first, second] = await Promise.all([
      dispatchDueMaternalyReminders(options),
      dispatchDueMaternalyReminders(options),
    ]);
    const later = await dispatchDueMaternalyReminders({
      ...options,
      now: new Date("2026-08-09T17:00:00.000Z"),
    });

    expect(first.sent + second.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(later.claimed).toBe(0);
    expect((await repository.getById(scheduled.reminder.reminderId))?.status).toBe("sent");
  });

  it("revalidates a processing cancellation immediately before delivery", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const revalidate = repository.revalidateClaim.bind(repository);
    vi.spyOn(repository, "revalidateClaim").mockImplementationOnce(async (input) => {
      await repository.cancelPendingForRegistration(
        scheduled.reminder.registrationId,
        new Date("2026-08-08T17:00:00.000Z"),
      );
      return revalidate(input);
    });
    const send = vi.fn();

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: successfulTransport(send),
      now: new Date("2026-08-08T17:00:00.000Z"),
    });

    expect(result).toMatchObject({ claimed: 1, cancelled: 1, sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect((await repository.getById(scheduled.reminder.reminderId))?.status).toBe("cancelled");
  });

  it("fences cancellation once an external send has started", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    await scheduleMaternalyCharlaReminder(
      onlineInput({
        registrationId: "INS_CHARLA_002",
        sessionId: "SES_CHARLA_ONLINE_20260811",
        sessionStartsAt: "2026-08-11T19:00:00+02:00",
        phoneE164: "+34600111223",
      }),
      repository,
    );
    const cancellationCounts: number[] = [];
    const send = vi.fn(async (payload: MaternalyReminderOutboundMessage) => {
      if (send.mock.calls.length === 1) {
        const inFlight = await repository.getById(payload.reminderId);
        cancellationCounts.push(
          await repository.cancelPendingForRegistration(
            inFlight?.registrationId ?? "missing",
            new Date("2026-08-09T17:00:00.001Z"),
          ),
        );
      }
      return { ok: true, providerMessageId: `SM_${send.mock.calls.length}` };
    });

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: { send },
      now: new Date("2026-08-09T17:00:00.000Z"),
      limit: 10,
    });

    expect(result).toMatchObject({ claimed: 2, sent: 2, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(cancellationCounts).toEqual([0]);
    expect(repository.list().filter((record) => record.status === "sent")).toHaveLength(2);
  });

  it("blocks an expired sending lease for reconciliation instead of reclaiming it", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const dueAt = new Date("2026-08-08T17:00:00.000Z");
    const [claimed] = await repository.claimDue({ now: dueAt, limit: 1, leaseMs: 1_000 });
    expect(claimed?.leaseToken).toBeTruthy();
    if (!claimed) {
      throw new Error("Expected a claimed reminder.");
    }
    await repository.revalidateClaim({
      reminderId: claimed.reminderId,
      leaseToken: claimed.leaseToken ?? "missing",
      now: dueAt,
    });

    const reclaimed = await repository.claimDue({
      now: new Date("2026-08-08T17:00:01.001Z"),
      limit: 1,
      leaseMs: 1_000,
    });

    expect(reclaimed).toEqual([]);
    expect(await repository.getById(scheduled.reminder.reminderId)).toMatchObject({
      status: "blocked",
      blockedReason: "sending_lease_expired_requires_reconciliation",
    });
  });

  it("isolates one item state failure and continues the rest of the batch", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    await scheduleMaternalyCharlaReminder(
      onlineInput({
        registrationId: "INS_CHARLA_002",
        sessionId: "SES_CHARLA_ONLINE_20260811",
        sessionStartsAt: "2026-08-11T19:00:00+02:00",
        phoneE164: "+34600111223",
      }),
      repository,
    );
    vi.spyOn(repository, "markBlocked").mockRejectedValueOnce(
      new Error("synthetic persistence failure"),
    );
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, retryable: false, error: "invalid template" })
      .mockResolvedValueOnce({ ok: true, providerMessageId: "SM_SECOND_OK" });

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: { send },
      now: new Date("2026-08-09T17:00:00.000Z"),
      limit: 10,
    });

    expect(result).toMatchObject({ claimed: 2, sent: 1, failed: 1 });
    expect(result.items).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("starts every claimed delivery without making later items wait on the same lease", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    for (let index = 1; index <= 3; index += 1) {
      await scheduleMaternalyCharlaReminder(
        onlineInput({
          registrationId: `INS_CHARLA_00${index}`,
          phoneE164: `+3460011122${index}`,
        }),
        repository,
      );
    }
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = vi.fn(async () => {
      await gate;
      return { ok: true, providerMessageId: "SM_BATCH_OK" };
    });

    const pending = dispatchDueMaternalyReminders({
      repository,
      transport: { send },
      now: new Date("2026-08-08T17:00:00.000Z"),
      limit: 3,
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    release?.();

    await expect(pending).resolves.toMatchObject({ claimed: 3, sent: 3, failed: 0 });
  });

  it("blocks an incomplete online reminder without calling a transport", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(
      onlineInput({ onlineAccess: undefined }),
      repository,
    );
    const send = vi.fn();

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: successfulTransport(send),
      now: new Date("2026-08-08T17:00:00.000Z"),
    });

    expect(result).toMatchObject({ claimed: 1, blocked: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect((await repository.getById(scheduled.reminder.reminderId))?.status).toBe("blocked");
  });

  it("retries a transient failure and stops after a successful retry", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, retryable: true, error: "temporary outage" })
      .mockResolvedValueOnce({ ok: true, providerMessageId: "SM_RETRY_OK" });
    const transport: MaternalyReminderTransport = { send };

    const failed = await dispatchDueMaternalyReminders({
      repository,
      transport,
      now: new Date("2026-08-08T17:00:00.000Z"),
      retryDelayMs: () => 60_000,
    });
    const tooEarly = await dispatchDueMaternalyReminders({
      repository,
      transport,
      now: new Date("2026-08-08T17:00:59.000Z"),
    });
    const retried = await dispatchDueMaternalyReminders({
      repository,
      transport,
      now: new Date("2026-08-08T17:01:00.000Z"),
    });

    expect(failed.retryScheduled).toBe(1);
    expect(tooEarly.claimed).toBe(0);
    expect(retried.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await repository.getById(scheduled.reminder.reminderId))?.status).toBe("sent");
  });

  it("blocks an ambiguous thrown transport error instead of retrying it", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const send = vi.fn().mockRejectedValue(new Error("socket closed after POST"));

    const first = await dispatchDueMaternalyReminders({
      repository,
      transport: { send },
      now: new Date("2026-08-08T17:00:00.000Z"),
    });
    const later = await dispatchDueMaternalyReminders({
      repository,
      transport: { send },
      now: new Date("2026-08-08T17:05:00.000Z"),
    });

    expect(first).toMatchObject({ claimed: 1, blocked: 1, retryScheduled: 0 });
    expect(later.claimed).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await repository.getById(scheduled.reminder.reminderId)).toMatchObject({
      status: "blocked",
      blockedReason: expect.stringContaining("ambiguous_delivery_requires_reconciliation"),
    });
  });

  it("prioritizes delivery uncertainty over a retryable provider flag", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const send = vi.fn(async () => ({
      ok: false,
      retryable: true,
      deliveryUncertain: true,
      error: "provider outcome unknown",
    }));

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: { send },
      now: new Date("2026-08-08T17:00:00.000Z"),
    });

    expect(result).toMatchObject({ claimed: 1, blocked: 1, retryScheduled: 0 });
    expect(await repository.getById(scheduled.reminder.reminderId)).toMatchObject({
      status: "blocked",
      blockedReason: expect.stringContaining("ambiguous_delivery_requires_reconciliation"),
    });
  });

  it("does not send a reminder after cancellation", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    await repository.cancel(scheduled.reminder.reminderId, new Date("2026-08-05T10:00:00.000Z"));
    const send = vi.fn();

    const result = await dispatchDueMaternalyReminders({
      repository,
      transport: successfulTransport(send),
      now: new Date("2026-08-08T17:00:00.000Z"),
    });

    expect(result.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("idempotently cancels pending reminders by registration", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const scheduled = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    const now = new Date("2026-08-05T10:00:00.000Z");

    expect(await repository.cancelPendingForRegistration("INS_CHARLA_001", now)).toBe(1);
    expect(await repository.cancelPendingForRegistration("INS_CHARLA_001", now)).toBe(0);
    expect((await repository.getById(scheduled.reminder.reminderId))?.status).toBe("cancelled");
  });

  it("reactivates a safely terminal reminder when the same session is booked again", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const first = await scheduleMaternalyCharlaReminder(onlineInput(), repository);
    await repository.cancel(first.reminder.reminderId, new Date("2026-08-05T10:00:00.000Z"));
    const newer = await scheduleMaternalyCharlaReminder(
      onlineInput({
        sessionId: "SES_CHARLA_ONLINE_20260907",
        sessionStartsAt: "2026-09-07T19:00:00+02:00",
        now: new Date("2026-08-05T10:01:00.000Z"),
      }),
      repository,
    );

    const reactivated = await scheduleMaternalyCharlaReminder(
      onlineInput({ now: new Date("2026-08-05T10:05:00.000Z") }),
      repository,
    );

    expect(reactivated).toMatchObject({ created: true, supersededCount: 1 });
    expect(reactivated.reminder).toMatchObject({
      reminderId: first.reminder.reminderId,
      status: "scheduled",
      attempts: 0,
    });
    expect(reactivated.reminder.cancelledAt).toBeUndefined();
    expect((await repository.getById(newer.reminder.reminderId))?.status).toBe("cancelled");
  });

  it("exposes a lifecycle port without coupling callers to PostgreSQL", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const lifecycle = createMaternalyReminderLifecycle(repository);

    const scheduled = await lifecycle.scheduleCharla(onlineInput());
    const cancelled = await lifecycle.cancelPendingForRegistration(
      scheduled.reminder.registrationId,
      new Date("2026-08-05T10:00:00.000Z"),
    );

    expect(scheduled.created).toBe(true);
    expect(cancelled).toBe(1);
  });
});
