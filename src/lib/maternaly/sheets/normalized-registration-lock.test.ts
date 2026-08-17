import { describe, expect, it, vi } from "vitest";
import {
  buildNormalizedRegistrationSessionLockKey,
  type NormalizedRegistrationLockPool,
  withNormalizedRegistrationSessionLock,
} from "./normalized-registration-lock";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function productionEnv(): Partial<NodeJS.ProcessEnv> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://synthetic.invalid/maternaly",
  };
}

describe("normalized registration session lock", () => {
  it("serializes local critical sections for the same sheet and session", async () => {
    const firstMayFinish = deferred();
    const firstStarted = deferred();
    const events: string[] = [];
    const options = {
      sheetId: "sheet-charla",
      sessionId: "SES-001",
      mode: "live" as const,
      env: { NODE_ENV: "test" },
    };

    const first = withNormalizedRegistrationSessionLock(options, async () => {
      events.push("first:start");
      firstStarted.resolve();
      await firstMayFinish.promise;
      events.push("first:end");
      return "first";
    });
    await firstStarted.promise;

    const second = withNormalizedRegistrationSessionLock(options, async () => {
      events.push("second:start");
      return "second";
    });
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    firstMayFinish.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("uses a stable Postgres advisory transaction lock for live production writes", async () => {
    const events: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        events.push(sql);
        if (sql.includes("pg_advisory_xact_lock")) {
          expect(values).toEqual([
            "maternaly:normalized-registration:sheet-charla:SES-001",
          ]);
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(() => {
        events.push("RELEASE");
      }),
    };
    const pool = {
      connect: vi.fn(async () => client),
    } satisfies NormalizedRegistrationLockPool;

    await expect(
      withNormalizedRegistrationSessionLock(
        {
          sheetId: " sheet-charla ",
          sessionId: " SES-001 ",
          mode: "live",
          env: productionEnv(),
          postgresPool: pool,
        },
        async () => {
          events.push("TASK");
          return "written";
        },
      ),
    ).resolves.toBe("written");

    expect(events).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      "TASK",
      "COMMIT",
      "RELEASE",
    ]);
    expect(pool.connect).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back, releases, and propagates a critical-section failure", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) } satisfies NormalizedRegistrationLockPool;

    await expect(
      withNormalizedRegistrationSessionLock(
        {
          sheetId: "sheet-charla",
          sessionId: "SES-001",
          mode: "live",
          env: productionEnv(),
          postgresPool: pool,
        },
        async () => {
          throw new Error("sheet append failed");
        },
      ),
    ).rejects.toThrow("sheet append failed");

    expect(statements).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      "ROLLBACK",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("fails closed before running the task when the distributed lock cannot be acquired", async () => {
    const task = vi.fn(async () => "must-not-run");
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          throw new Error("postgres unavailable");
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) } satisfies NormalizedRegistrationLockPool;

    await expect(
      withNormalizedRegistrationSessionLock(
        {
          sheetId: "sheet-charla",
          sessionId: "SES-001",
          mode: "live",
          env: productionEnv(),
          postgresPool: pool,
        },
        task,
      ),
    ).rejects.toThrow("postgres unavailable");

    expect(task).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("requires DATABASE_URL for live production instead of silently using a local-only lock", async () => {
    const task = vi.fn(async () => "must-not-run");

    await expect(
      withNormalizedRegistrationSessionLock(
        {
          sheetId: "sheet-charla",
          sessionId: "SES-001",
          mode: "live",
          env: { NODE_ENV: "production" },
        },
        task,
      ),
    ).rejects.toThrow("DATABASE_URL is required");
    expect(task).not.toHaveBeenCalled();
  });

  it("builds distinct local lock keys for distinct sessions", () => {
    expect(
      buildNormalizedRegistrationSessionLockKey({
        sheetId: "sheet-charla",
        sessionId: "SES-001",
      }),
    ).not.toBe(
      buildNormalizedRegistrationSessionLockKey({
        sheetId: "sheet-charla",
        sessionId: "SES-002",
      }),
    );
  });
});
