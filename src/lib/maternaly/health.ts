import { Pool } from "pg";
import {
  readConversationStoreRuntimeConfig,
  readHotelPersistenceConfig,
} from "@/lib/hotel/persistence/runtime";
import { readTwilioWhatsAppConfig } from "@/lib/hotel/twilio/client";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import { readMaternalyReminderRuntimeConfig } from "@/lib/maternaly/reminders/config";
import { MATERNALY_ORIGINAL_SHEET_IDS, redactSheetId } from "@/lib/maternaly/sheets/copy-real-write";

const REQUIRED_MIGRATION_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

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
  const reminders = readMaternalyReminderRuntimeConfig(env);
  const twilioConfig = readTwilioWhatsAppConfig(env);
  const persistence = readHotelPersistenceConfig(env);
  const conversationsStore = readConversationStoreRuntimeConfig(env);
  const databaseDiagnostics = await checkDatabaseDiagnostics(env.DATABASE_URL);
  const databaseReachable = databaseDiagnostics.reachable;
  const productionLike =
    env.NODE_ENV === "production" || config.appEnv.toLowerCase() === "production";
  const databaseUrlConfigured = Boolean(env.DATABASE_URL?.trim());
  const provider = persistence.provider;
  const vercelGoogleSheetsDemo =
    productionLike &&
    conversationsStore.provider === "google_sheets" &&
    conversationsStore.demoVercelMode;
  const databaseRequired = !vercelGoogleSheetsDemo;
  const productionReady =
    !productionLike ||
    vercelGoogleSheetsDemo ||
    (provider === "postgres" &&
      databaseUrlConfigured &&
      databaseReachable === true &&
      databaseDiagnostics.migrations.ready);
  const databaseWarning =
    (vercelGoogleSheetsDemo ? "demo mode, no Postgres" : persistence.unsafeReason) ??
    (productionLike && !databaseUrlConfigured
      ? "DATABASE_URL is required for production on EasyPanel."
      : databaseDiagnostics.migrations.warning);
  const databaseReady =
    !productionLike ||
    vercelGoogleSheetsDemo ||
    (provider === "postgres" &&
      databaseUrlConfigured &&
      databaseReachable === true &&
      databaseDiagnostics.migrations.ready);
  const panelReady =
    !productionLike ||
    (conversationsStore.provider === "google_sheets" &&
      conversationsStore.configured &&
      conversationsStore.productionReady) ||
    (provider === "postgres" &&
      databaseUrlConfigured &&
      databaseReachable === true &&
      databaseDiagnostics.migrations.ready);
  const remindersHealthSatisfied = !reminders.enabled || reminders.ready;
  const ok = databaseReady && productionReady && panelReady && remindersHealthSatisfied;
  const twilioWebhookProtected = Boolean(env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim());
  const twilioActiveWithoutWebhookProtection =
    productionLike && config.whatsappProvider === "twilio" && !twilioWebhookProtected;
  const twilioActiveWithoutConfig =
    config.whatsappProvider === "twilio" && !config.configured.twilio;

  return {
    ok,
    app: config.appName,
    version: env.APP_VERSION ?? "0.1.0",
    environment: config.appEnv,
    runtimeTarget: productionLike
      ? conversationsStore.runtimeTarget
      : "local-development",
    build: {
      // Shipped with the code, so deployments remain identifiable even when
      // the hosting platform does not inject a Git commit environment value.
      conversationRevision: "2026-09-08-contact-recovery-v1",
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
      required: databaseRequired,
      databaseUrlConfigured,
      reachable: databaseReachable,
      productionReady,
      warning: databaseWarning,
      migrations: databaseDiagnostics.migrations,
    },
    conversationsStore: {
      provider: conversationsStore.provider,
      runtimeTarget: conversationsStore.runtimeTarget,
      durable: conversationsStore.durable,
      configured: conversationsStore.configured,
      productionReady: conversationsStore.productionReady,
      sheetName: conversationsStore.sheetName,
      spreadsheetIdConfigured: conversationsStore.spreadsheetIdConfigured,
      warning: conversationsStore.warning,
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
    bot: {
      botDomain: "maternaly",
      knowledgeBase: "maternaly",
      legacyHotelKnowledgeEnabled: false,
    },
    whatsapp: {
      provider: config.whatsappProvider,
      ycloudConfigured: config.configured.ycloud,
      ycloudWebhookSecretConfigured: config.configured.ycloudWebhookSecret,
      ycloudAvailable: config.configured.ycloud,
      twilio: {
        configured: config.configured.twilio,
        fromConfigured: config.configured.twilioFrom,
        messagingServiceConfigured: Boolean(env.TWILIO_MESSAGING_SERVICE_SID?.trim()),
        webhookProtected: twilioWebhookProtected,
        mode: config.configured.twilio ? twilioConfig.providerMode : "unknown",
        active: config.whatsappProvider === "twilio",
        warning: twilioActiveWithoutWebhookProtection
          ? "TWILIO_WEBHOOK_AUTH_TOKEN is required when WHATSAPP_PROVIDER=twilio in production."
          : twilioActiveWithoutConfig
            ? "Twilio is active but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and sender configuration are incomplete."
            : undefined,
      },
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
      copyWriteMode: config.realStructureWriteMode,
      copyWriteEnabled: config.realStructureWriteEnabled,
      copySheetsConfigured: config.copySheetIds.length,
      copySheetIdsRedacted: config.copySheetIds.map(redactSheetId),
      originalSheetsProtected: true,
      protectedOriginalSheetIdsRedacted: MATERNALY_ORIGINAL_SHEET_IDS.map(redactSheetId),
      realStructureWriteMode: config.realStructureWriteMode,
      demoPaymentLinkConfigured: config.demoPaymentLinkConfigured,
    },
    normalizedSheets: {
      enabled: config.normalizedSheets.enabled,
      configuredServices: config.normalizedSheets.serviceIds,
      missingSheetIds: config.normalizedSheets.missingSheetIds,
      accessMode: config.sheetsAccessMode,
      writeEnabled: config.liveSheetsWriteEnabled,
      mode: config.normalizedSheets.writeMode,
      liveReady: config.normalizedSheets.liveReady,
      sheetIdsRedacted: config.normalizedSheets.sheetIds.map(redactSheetId),
      lastAuditStatus: null,
    },
    reminders: {
      enabled: reminders.enabled,
      ready: reminders.ready,
      leadHours: 48,
      dispatchRoute: "/api/maternaly/ops/reminders/dispatch",
      missing: reminders.enabled ? reminders.missing : [],
    },
    demoFlow: {
      testAdnInboundEnabled: false,
      activeConversationAuthority: "maternaly_core_policy_copy",
    },
    llm: {
      dialogueMode: ["active", "shadow"].includes(env.MATERNALY_DIALOGUE_MODE ?? "") ? env.MATERNALY_DIALOGUE_MODE : "off",
      dialogueVersion: "dialogue-v1",
      provider: config.llmProvider,
      configured: config.configured.llm,
      modelConfigured: Boolean(config.llmModel),
    },
  };
}
