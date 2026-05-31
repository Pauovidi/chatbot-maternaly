export type HotelPersistenceProvider = "postgres" | "file-volume" | "file-local" | "file-tmp";

export interface HotelPersistenceConfig {
  provider: HotelPersistenceProvider;
  configuredProvider?: string;
  databaseUrlConfigured: boolean;
  durableFileBaseDir?: string;
  isProduction: boolean;
  runtimeTarget: "easypanel-container" | "local-development";
  productionReady: boolean;
  unsafeReason?: string;
}

const PRODUCTION_DATA_DIR = "/data";

function joinStorePath(dir: string, fileName: string): string {
  const separator = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${separator}${fileName}`;
}

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
    (!isProduction ? undefined : PRODUCTION_DATA_DIR);
  const allowUnsafeProductionFileStore =
    env.MATERNALY_ALLOW_UNSAFE_PRODUCTION_FILE_STORE === "true";
  const provider =
    explicitProvider ??
    (databaseUrlConfigured || isProduction ? "postgres" : "file-local");
  const unsafeReason =
    isProduction && provider !== "postgres"
      ? "Production on EasyPanel requires Postgres. File stores are disabled unless MATERNALY_ALLOW_UNSAFE_PRODUCTION_FILE_STORE=true."
      : isProduction && provider === "postgres" && !databaseUrlConfigured
        ? "DATABASE_URL is required for production on EasyPanel."
        : undefined;

  return {
    provider: unsafeReason && provider !== "postgres" && !allowUnsafeProductionFileStore ? "postgres" : provider,
    configuredProvider,
    databaseUrlConfigured,
    durableFileBaseDir,
    isProduction,
    runtimeTarget: isProduction ? "easypanel-container" : "local-development",
    productionReady: !unsafeReason || (provider !== "postgres" && allowUnsafeProductionFileStore),
    unsafeReason,
  };
}

export function resolveJsonStorePath(input: {
  fileName: string;
  pathEnv?: string;
  dirEnv?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  const config = readHotelPersistenceConfig(env);
  const unsafeFileStoreAllowed =
    !config.isProduction || env.MATERNALY_ALLOW_UNSAFE_PRODUCTION_FILE_STORE === "true";

  if (!unsafeFileStoreAllowed) {
    throw new Error(
      "JSON file store is disabled in production for Maternaly. Configure DATABASE_URL and run migrations.",
    );
  }

  const explicitPath = input.pathEnv ? env[input.pathEnv]?.trim() : undefined;
  if (explicitPath) {
    return explicitPath;
  }

  const explicitDir = input.dirEnv ? env[input.dirEnv]?.trim() : undefined;
  if (explicitDir) {
    return joinStorePath(explicitDir, input.fileName);
  }

  const sharedFilePath = env.HOTEL_FILE_STORE_PATH?.trim();
  if (sharedFilePath && input.fileName === "hotel-demo-state.json") {
    return sharedFilePath;
  }

  if (config.provider === "file-volume" || config.isProduction) {
    return joinStorePath(config.durableFileBaseDir ?? PRODUCTION_DATA_DIR, input.fileName);
  }

  return joinStorePath(".demo-state", input.fileName);
}
