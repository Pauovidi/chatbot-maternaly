import { Pool } from "pg";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";

async function checkDatabaseReachability(databaseUrl: string | undefined): Promise<boolean | null> {
  if (!databaseUrl?.trim()) {
    return null;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 1500,
  });

  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function getMaternalyHealth(env: NodeJS.ProcessEnv = process.env) {
  const config = readMaternalyRuntimeConfig(env);
  const databaseReachable = await checkDatabaseReachability(env.DATABASE_URL);
  const productionLike =
    env.NODE_ENV === "production" || config.appEnv.toLowerCase() === "production";
  const databaseUrlConfigured = Boolean(env.DATABASE_URL?.trim());
  const provider = productionLike || databaseUrlConfigured ? "postgres" : "file-local";
  const productionReady = !productionLike || (databaseUrlConfigured && databaseReachable === true);
  const databaseWarning =
    productionLike && !databaseUrlConfigured
      ? "DATABASE_URL is required for production on EasyPanel."
      : undefined;
  const databaseReady =
    !productionLike ||
    (provider === "postgres" && databaseUrlConfigured && databaseReachable === true);
  const ok = databaseReady && productionReady;

  return {
    ok,
    app: config.appName,
    version: env.APP_VERSION ?? "0.1.0",
    environment: config.appEnv,
    runtimeTarget: productionLike ? "easypanel-container" : "local-development",
    commit:
      env.GIT_COMMIT ??
      env.EASYPANEL_GIT_COMMIT_SHA ??
      null,
    uptime: Math.round(process.uptime()),
    database: {
      configured: config.configured.database,
      provider,
      databaseUrlConfigured,
      reachable: databaseReachable,
      productionReady,
      warning: databaseWarning,
    },
    whatsapp: {
      provider: config.whatsappProvider,
      ycloudConfigured: config.configured.ycloud,
    },
    googleSheets: {
      configured: config.configured.googleSheets,
      accessMode: config.sheetsAccessMode,
      readStatus:
        config.configured.googleSheets || config.sheetIds.length > 0
          ? "configured_or_public_read_candidate"
          : "not_configured",
      liveWriteEnabled: config.liveSheetsWriteEnabled,
      sheetIdsConfigured: config.sheetIds.length,
    },
    llm: {
      provider: config.llmProvider,
      configured: config.configured.llm,
      modelConfigured: Boolean(config.llmModel),
    },
  };
}
