import { Pool } from "pg";
import type { NormalizedSheetsWriteMode } from "@/lib/maternaly/config/env";

export interface NormalizedRegistrationLockClient {
  query(sql: string, values?: unknown[]): Promise<unknown>;
  release(): void;
}

export interface NormalizedRegistrationLockPool {
  connect(): Promise<NormalizedRegistrationLockClient>;
}

export interface NormalizedRegistrationSessionLockOptions {
  sheetId: string;
  sessionId: string;
  mode: NormalizedSheetsWriteMode;
  env?: Partial<NodeJS.ProcessEnv>;
  /** Test/composition seam. Production callers normally leave this unset. */
  postgresPool?: NormalizedRegistrationLockPool;
}

const localLockTails = new Map<string, Promise<void>>();

let defaultPool: Pool | undefined;
let defaultPoolConnectionString: string | undefined;

function requiredIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required for the normalized registration session lock.`);
  }
  return normalized;
}

export function buildNormalizedRegistrationSessionLockKey(input: {
  sheetId: string;
  sessionId: string;
}): string {
  const sheetId = requiredIdentifier(input.sheetId, "sheetId");
  const sessionId = requiredIdentifier(input.sessionId, "sessionId");
  return `maternaly:normalized-registration:${sheetId}:${sessionId}`;
}

function isProduction(env: Partial<NodeJS.ProcessEnv>): boolean {
  return (
    env.NODE_ENV?.trim().toLowerCase() === "production" ||
    env.APP_ENV?.trim().toLowerCase() === "production"
  );
}

function poolFromConnectionString(connectionString: string): NormalizedRegistrationLockPool {
  if (!defaultPool || defaultPoolConnectionString !== connectionString) {
    defaultPool = new Pool({ connectionString });
    defaultPoolConnectionString = connectionString;
  }
  return defaultPool as unknown as NormalizedRegistrationLockPool;
}

async function withLocalSessionLock<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
  const previous = localLockTails.get(lockKey) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.then(
    () => current,
    () => current,
  );
  localLockTails.set(lockKey, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    releaseCurrent();
    if (localLockTails.get(lockKey) === tail) {
      localLockTails.delete(lockKey);
    }
  }
}

async function withPostgresSessionLock<T>(input: {
  pool: NormalizedRegistrationLockPool;
  lockKey: string;
  task: () => Promise<T>;
}): Promise<T> {
  const client = await input.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      input.lockKey,
    ]);
    const result = await input.task();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Serializes the complete re-read -> capacity plan -> append critical section for one
 * normalized workbook session. Live production writes use a Postgres transaction-level
 * advisory lock so the guarantee also holds across processes and replicas.
 */
export async function withNormalizedRegistrationSessionLock<T>(
  options: NormalizedRegistrationSessionLockOptions,
  task: () => Promise<T>,
): Promise<T> {
  const lockKey = buildNormalizedRegistrationSessionLockKey(options);
  const env = options.env ?? process.env;

  return withLocalSessionLock(lockKey, async () => {
    const requiresDistributedLock = options.mode === "live" && isProduction(env);
    if (!requiresDistributedLock) {
      return task();
    }

    const connectionString = env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required for live normalized registration locking in production.",
      );
    }

    return withPostgresSessionLock({
      pool: options.postgresPool ?? poolFromConnectionString(connectionString),
      lockKey,
      task,
    });
  });
}
