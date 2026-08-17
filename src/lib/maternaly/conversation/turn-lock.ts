import { Pool } from "pg";

interface TurnLockClient {
  query(sql: string, values?: unknown[]): Promise<unknown>;
  release(): void;
}

export interface MaternalyTurnLockPool {
  connect(): Promise<TurnLockClient>;
}

const localTails = new Map<string, Promise<void>>();
let defaultPool: Pool | undefined;
let defaultConnectionString: string | undefined;

function poolFromEnv(connectionString: string): MaternalyTurnLockPool {
  if (!defaultPool || defaultConnectionString !== connectionString) {
    defaultPool = new Pool({ connectionString });
    defaultConnectionString = connectionString;
  }
  return defaultPool as unknown as MaternalyTurnLockPool;
}

async function withLocalLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = localTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current, () => current);
  localTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (localTails.get(key) === tail) {
      localTails.delete(key);
    }
  }
}

export async function withMaternalyConversationTurnLock<T>(
  options: {
    conversationKey: string;
    env?: Partial<NodeJS.ProcessEnv>;
    postgresPool?: MaternalyTurnLockPool;
  },
  task: () => Promise<T>,
): Promise<T> {
  const conversationKey = options.conversationKey.trim();
  if (!conversationKey) {
    throw new Error("conversationKey is required for the Maternaly turn lock.");
  }
  const lockKey = `maternaly:conversation-turn:${conversationKey}`;
  const env = options.env ?? process.env;
  const productionLike =
    env.NODE_ENV?.toLowerCase() === "production" ||
    env.APP_ENV?.toLowerCase() === "production";
  const connectionString = env.DATABASE_URL?.trim();

  return withLocalLock(lockKey, async () => {
    if (!productionLike || !connectionString) {
      return task();
    }

    const client = await (options.postgresPool ?? poolFromEnv(connectionString)).connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
      const result = await task();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
}
