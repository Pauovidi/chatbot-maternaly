import { Pool } from "pg";
import { readHotelPersistenceConfig } from "@/lib/hotel/persistence/runtime";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";

const REQUIRED_MIGRATION_IDS = [1, 2, 3, 4, 5] as const;

interface DatabaseDiagnostics {
  reachable: boolean | null;
  migrations: {
    checked: boolean;
    applied: number[];
    missing: number[];
    ready: boolean;
    warning?: string;
  };
}

function emptyMigrationStatus(warning?: string): DatabaseDiagnostics["migrations"] {
  return {
    checked: false,
    applied: [],
    missing: [...REQUIRED_MIGRATION_IDS],
    ready: false,
    warning,
  };
}

async function checkDatabaseDiagnostics(
  databaseUrl: string | undefined,
): Promise<DatabaseDiagnostics> {
  if (!databaseUrl?.trim()) {
    return {
      reachable: null,
      migrations: emptyMigrationStatus("DATABASE_URL is not configured."),
    };
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 1500,
  });

  try {
    await pool.query("SELECT 1");
    try {
      const result = await pool.query<{ id: number }>(
        "SELECT id FROM hotel_schema_migrations ORDER BY id ASC",
      );
      const applied = result.rows.map((row) => Number(row.id));
      const missing = REQUIRED_MIGRATION_IDS.filter((id) => !applied.includes(id));

      return {
        reachable: true,
        migrations: {
          checked: true,
          applied,
          missing,
          ready: missing.length === 0,
        },
      };
    } catch {
      return {
        reachable: true,
        migrations: {
          checked: true,
          applied: [],
          missing: [...REQUIRED_MIGRATION_IDS],
          ready: false,
          warning: "migration_table_unavailable_run_node_scripts_db_migrate_mjs",
        },
      };
    }
  } catch {
    return {
      reachable: false,
      migrations: emptyMigrationStatus("database_unreachable"),
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function getMaternalyHealth(env: NodeJS.ProcessEnv = process.env) {
  const config = readMaternalyRuntimeConfig(env);
  const persistence = readHotelPersistenceConfig(env);
  const databaseDiagnostics = await checkDatabaseDiagnostics(env.DATABASE_URL);
  const databaseReachable = databaseDiagnostics.reachable;
  const productionLike =
    env.NODE_ENV === "production" || config.appEnv.toLowerCase() === "production";
  const databaseUrlConfigured = Boolean(env.DATABASE_URL?.trim());
  const provider = persistence.provider;
  const productionReady =
    !productionLike ||
    (provider === "postgres" &&
      databaseUrlConfigured &&
      databaseReachable === true &&
      databaseDiagnostics.migrations.ready);
  const databaseWarning =
    persistence.unsafeReason ??
    (productionLike && !databaseUrlConfigured
      ? "DATABASE_URL is required for production on EasyPanel."
      : databaseDiagnostics.migrations.warning);
  const databaseReady =
    !productionLike ||
    (provider === "postgres" &&
      databaseUrlConfigured &&
      databaseReachable === true &&
      databaseDiagnostics.migrations.ready);
  const panelReady =
    !productionLike ||
    (provider === "postgres" &&
      databaseUrlConfigured &&
      databaseReachable === true &&
      databaseDiagnostics.migrations.ready);
  const ok = databaseReady && productionReady && panelReady;

  return {
    ok,
    app: config.appName,
    version: env.APP_VERSION ?? "0.1.0",
    environment: config.appEnv,
    runtimeTarget: productionLike ? "easypanel-container" : "local-development",
    build: {
      commit:
        env.GIT_COMMIT ??
        env.EASYPANEL_GIT_COMMIT_SHA ??
        null,
      source:
        env.EASYPANEL_GIT_COMMIT_SHA
          ? "easypanel"
          : env.GIT_COMMIT
            ? "env"
            : "unknown",
    },
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
      migrations: databaseDiagnostics.migrations,
    },
    conversationsStore: {
      provider: persistence.provider,
      runtimeTarget: persistence.runtimeTarget,
      productionReady: persistence.productionReady,
      unsafeReason: persistence.unsafeReason,
    },
    panel: {
      route: "/admin/conversations",
      ready: panelReady,
      fallback: "empty_dashboard_on_store_error",
      notes: panelReady
        ? "Panel can load."
        : "Run database migrations before exposing the panel in production.",
    },
    whatsapp: {
      provider: config.whatsappProvider,
      ycloudConfigured: config.configured.ycloud,
      ycloudWebhookSecretConfigured: config.configured.ycloudWebhookSecret,
    },
    googleSheets: {
      configured: config.configured.googleSheets,
      accessMode: config.sheetsAccessMode,
      readStatus:
        config.configured.googleSheets || config.sheetIds.length > 0
          ? "configured_or_public_read_candidate"
          : "not_configured",
      writeEnabled: config.liveSheetsWriteEnabled,
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
