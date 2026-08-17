import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresMaternalyReminderRepository } from "./postgres-repository";
import { buildMaternalyCharlaReminder } from "./scheduler";

const NOW = new Date("2026-08-08T17:00:00.000Z");

function reminderRow(overrides: Record<string, unknown> = {}) {
  return {
    reminder_id: "MAT_REM_48H_001",
    idempotency_key: "maternaly:charla:reminder-48h:test",
    registration_id: "INS_CHARLA_001",
    conversation_id: null,
    service_key: "charla_embarazo_1_20",
    session_id: "SES_CHARLA_001",
    session_starts_at: "2026-08-10T17:00:00.000Z",
    scheduled_for: NOW.toISOString(),
    next_attempt_at: NOW.toISOString(),
    lead_hours: 48,
    time_zone: "Europe/Madrid",
    phone_e164: "+34600111222",
    modality: "online",
    location: "Online",
    address: null,
    online_access: {
      joinUrl: "https://zoom.us/j/123456789?pwd=synthetic",
      meetingId: "123 456 789",
      passcode: "MATERNALY",
    },
    status: "scheduled",
    attempts: 0,
    max_attempts: 3,
    lease_token: null,
    lease_expires_at: null,
    provider_message_id: null,
    sent_at: null,
    cancelled_at: null,
    cancel_requested_at: null,
    blocked_reason: null,
    last_error: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("Postgres Maternaly reminder repository", () => {
  it("claims due jobs transactionally with SKIP LOCKED", async () => {
    const statements: string[] = [];
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        statements.push(sql);
        if (sql.includes("SELECT reminder_id")) {
          return { rows: [{ reminder_id: "MAT_REM_48H_001" }], rowCount: 1 };
        }
        if (sql.includes("RETURNING *")) {
          return {
            rows: [
              reminderRow({
                status: "processing",
                attempts: 1,
                lease_token: values?.[1],
                lease_expires_at: values?.[2],
                updated_at: NOW,
              }),
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const repository = new PostgresMaternalyReminderRepository(pool);

    const claimed = await repository.claimDue({ now: NOW, limit: 10, leaseMs: 60_000 });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ status: "processing", attempts: 1 });
    expect(statements.join("\n")).toContain("FOR UPDATE SKIP LOCKED");
    expect(statements.join("\n")).toContain("status = 'sending'");
    expect(statements.join("\n")).toContain("sending_lease_expired_requires_reconciliation");
    expect(statements.join("\n")).toContain("session_starts_at <= $1");
    expect(statements.join("\n")).toContain("'session_elapsed'");
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("cancels only pending jobs for a registration and remains idempotent", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const repository = new PostgresMaternalyReminderRepository({ query } as unknown as Pool);

    expect(await repository.cancelPendingForRegistration("INS_CHARLA_001", NOW)).toBe(2);
    expect(await repository.cancelPendingForRegistration("INS_CHARLA_001", NOW)).toBe(0);
    expect(query.mock.calls[0]?.[0]).toContain("status = 'processing'");
    expect(query.mock.calls[0]?.[0]).toContain("cancel_requested_at IS NULL");
    expect(query.mock.calls[0]?.[0]).toContain("lease_token = CASE");
    expect(query.mock.calls[0]?.[0]).not.toContain("status = 'sending'");
  });

  it("finalizes a requested cancellation during claim revalidation without sending", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      return {
        rows: [
          reminderRow({
            status: "cancelled",
            lease_token: null,
            lease_expires_at: null,
            cancelled_at: NOW,
            cancel_requested_at: NOW,
          }),
        ],
        rowCount: 1,
      };
    });
    const repository = new PostgresMaternalyReminderRepository({ query } as unknown as Pool);

    await expect(
      repository.revalidateClaim({
        reminderId: "MAT_REM_48H_001",
        leaseToken: "lease-owned-by-worker",
        now: NOW,
      }),
    ).resolves.toBeUndefined();
    expect(statements[0]).toContain("cancel_requested_at IS NOT NULL");
    expect(statements[0]).toContain("lease_token = $2");
  });

  it("atomically moves an owned processing claim behind the sending fence", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      return {
        rows: [
          reminderRow({
            status: "sending",
            lease_token: "lease-owned-by-worker",
            lease_expires_at: new Date(NOW.getTime() + 60_000),
          }),
        ],
        rowCount: 1,
      };
    });
    const repository = new PostgresMaternalyReminderRepository({ query } as unknown as Pool);

    await expect(
      repository.revalidateClaim({
        reminderId: "MAT_REM_48H_001",
        leaseToken: "lease-owned-by-worker",
        now: NOW,
      }),
    ).resolves.toMatchObject({ status: "sending", leaseToken: "lease-owned-by-worker" });
    expect(statements[0]).toContain("ELSE 'sending'");
    expect(statements[0]).toContain("status IN ('processing', 'sending')");
  });

  it("blocks an elapsed processing claim during fence revalidation", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      return {
        rows: [
          reminderRow({
            status: "blocked",
            lease_token: null,
            lease_expires_at: null,
            blocked_reason: "session_elapsed",
            last_error: "session_elapsed",
          }),
        ],
        rowCount: 1,
      };
    });
    const repository = new PostgresMaternalyReminderRepository({ query } as unknown as Pool);

    await expect(
      repository.revalidateClaim({
        reminderId: "MAT_REM_48H_001",
        leaseToken: "lease-owned-by-worker",
        now: new Date("2026-08-10T17:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();
    expect(statements[0]).toContain("session_starts_at <= $3");
    expect(statements[0]).toContain("THEN 'session_elapsed'");
  });

  it("reactivates a cancelled idempotency row for a confirmed rebooking", async () => {
    const statements: string[] = [];
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes("idempotency_key = $1 FOR UPDATE")) {
          return { rows: [reminderRow({ status: "cancelled", cancelled_at: NOW })], rowCount: 1 };
        }
        if (sql.includes("status = 'scheduled', attempts = 0")) {
          return {
            rows: [
              reminderRow({
                status: "scheduled",
                cancelled_at: null,
                cancel_requested_at: null,
                attempts: 0,
              }),
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    const repository = new PostgresMaternalyReminderRepository({
      connect: vi.fn(async () => client),
    } as unknown as Pool);
    const record = buildMaternalyCharlaReminder({
      registrationId: "INS_CHARLA_001",
      sessionId: "SES_CHARLA_001",
      sessionStartsAt: "2026-08-10T19:00:00+02:00",
      phoneE164: "+34600111222",
      modality: "online",
      location: "Online",
      onlineAccess: {
        joinUrl: "https://zoom.us/j/123456789?pwd=synthetic",
        meetingId: "123 456 789",
        passcode: "MATERNALY",
      },
      now: new Date("2026-08-05T10:05:00.000Z"),
    });

    await expect(repository.schedule(record)).resolves.toMatchObject({
      created: true,
      reminder: { status: "scheduled", attempts: 0 },
    });
    expect(statements.join("\n")).toContain("provider_message_id = NULL");
    expect(statements.join("\n")).toContain("cancel_requested_at = NULL");
  });

  it("ships the durable schema and due-work indexes in migration 006", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "db", "migrations", "006_maternaly_reminders.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS maternaly_reminders");
    expect(sql).toContain("idempotency_key text NOT NULL UNIQUE");
    expect(sql).toContain("maternaly_reminders_due_idx");
    expect(sql).toContain("maternaly_reminders_expired_lease_idx");
    expect(sql).toContain("cancel_requested_at timestamptz");

    const raceMigration = await readFile(
      path.join(
        process.cwd(),
        "db",
        "migrations",
        "007_maternaly_reminder_cancel_race.sql",
      ),
      "utf8",
    );
    expect(raceMigration).toContain("ADD COLUMN IF NOT EXISTS cancel_requested_at");

    const fenceMigration = await readFile(
      path.join(
        process.cwd(),
        "db",
        "migrations",
        "008_maternaly_reminder_sending_fence.sql",
      ),
      "utf8",
    );
    expect(fenceMigration).toContain("'sending'");
    expect(fenceMigration).toContain("maternaly_reminders_expired_sending_idx");
  });
});
