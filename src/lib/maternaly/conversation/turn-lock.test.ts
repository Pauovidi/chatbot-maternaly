import { describe, expect, it, vi } from "vitest";
import {
  type MaternalyTurnLockPool,
  withMaternalyConversationTurnLock,
} from "./turn-lock";

describe("Maternaly conversation turn lock", () => {
  it("serializes turns for the same conversation", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const events: string[] = [];
    const first = withMaternalyConversationTurnLock(
      { conversationKey: "34600000001", env: { NODE_ENV: "test" } },
      async () => {
        events.push("first:start");
        await gate;
        events.push("first:end");
      },
    );
    await Promise.resolve();
    const second = withMaternalyConversationTurnLock(
      { conversationKey: "34600000001", env: { NODE_ENV: "test" } },
      async () => { events.push("second"); },
    );
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("uses a Postgres advisory transaction lock in production", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => { statements.push(sql); }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) } satisfies MaternalyTurnLockPool;

    await withMaternalyConversationTurnLock(
      {
        conversationKey: "34600000001",
        env: { NODE_ENV: "production", DATABASE_URL: "postgres://test.invalid/db" },
        postgresPool: pool,
      },
      async () => "done",
    );

    expect(statements).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
