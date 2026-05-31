import packageJson from "../../../package.json";
import { readHotelPersistenceConfig } from "@/lib/hotel/persistence/runtime";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";

export function getMaternalyHealth(env: NodeJS.ProcessEnv = process.env) {
  const config = readMaternalyRuntimeConfig(env);
  const persistence = readHotelPersistenceConfig(env);

  return {
    ok: true,
    app: config.appName,
    version: packageJson.version,
    environment: config.appEnv,
    commit:
      env.GIT_COMMIT ??
      env.EASYPANEL_GIT_COMMIT_SHA ??
      env.VERCEL_GIT_COMMIT_SHA ??
      null,
    uptime: Math.round(process.uptime()),
    database: {
      configured: config.configured.database,
      provider: persistence.provider,
      databaseUrlConfigured: persistence.databaseUrlConfigured,
    },
    whatsapp: {
      provider: config.whatsappProvider,
      ycloudConfigured: config.configured.ycloud,
    },
    googleSheets: {
      configured: config.configured.googleSheets,
      accessMode: config.sheetsAccessMode,
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
