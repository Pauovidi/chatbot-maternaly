import os from "node:os";
import path from "node:path";

export type HotelPersistenceProvider = "postgres" | "file-volume" | "file-local" | "file-tmp";

export interface HotelPersistenceConfig {
  provider: HotelPersistenceProvider;
  configuredProvider?: string;
  databaseUrlConfigured: boolean;
  durableFileBaseDir?: string;
  isProduction: boolean;
}

const PRODUCTION_DATA_DIR = "/data";

function normalizeProvider(value: string | undefined): HotelPersistenceProvider | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "postgres") {
    return "postgres";
  }

  if (normalized === "file" || normalized === "file-volume" || normalized === "volume") {
    return "file-volume";
  }

  if (normalized === "local" || normalized === "file-local") {
    return "file-local";
  }

  if (normalized === "tmp" || normalized === "file-tmp") {
    return "file-tmp";
  }

  return undefined;
}

export function readHotelPersistenceConfig(
  env: NodeJS.ProcessEnv = process.env,
): HotelPersistenceConfig {
  const configuredProvider = env.HOTEL_PERSISTENCE_PROVIDER?.trim();
  const explicitProvider = normalizeProvider(configuredProvider);
  const isProduction = env.NODE_ENV === "production";
  const databaseUrlConfigured = Boolean(env.DATABASE_URL?.trim());
  const durableFileBaseDir =
    env.HOTEL_FILE_STORE_DIR?.trim() ||
    env.HOTEL_STORE_DIR?.trim() ||
    (isProduction ? PRODUCTION_DATA_DIR : undefined);

  return {
    provider:
      explicitProvider ??
      (databaseUrlConfigured && isProduction ? "postgres" : isProduction ? "file-volume" : "file-local"),
    configuredProvider,
    databaseUrlConfigured,
    durableFileBaseDir,
    isProduction,
  };
}

export function resolveJsonStorePath(input: {
  fileName: string;
  pathEnv?: string;
  dirEnv?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  const explicitPath = input.pathEnv ? env[input.pathEnv]?.trim() : undefined;
  if (explicitPath) {
    return explicitPath;
  }

  const explicitDir = input.dirEnv ? env[input.dirEnv]?.trim() : undefined;
  if (explicitDir) {
    return path.join(explicitDir, input.fileName);
  }

  const sharedFilePath = env.HOTEL_FILE_STORE_PATH?.trim();
  if (sharedFilePath && input.fileName === "hotel-demo-state.json") {
    return sharedFilePath;
  }

  const config = readHotelPersistenceConfig(env);
  if (config.provider === "file-volume" || config.isProduction) {
    return path.join(config.durableFileBaseDir ?? PRODUCTION_DATA_DIR, input.fileName);
  }

  if (env.VERCEL) {
    return path.join(os.tmpdir(), "hotel-canino-demo", input.fileName);
  }

  return path.join(".demo-state", input.fileName);
}
