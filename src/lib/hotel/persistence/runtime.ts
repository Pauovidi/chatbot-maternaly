export type HotelPersistenceProvider = "postgres" | "file-volume" | "file-local" | "file-tmp";
export type ConversationStoreProvider = HotelPersistenceProvider | "google_sheets";

export type RuntimeTarget =
  | "easypanel-container"
  | "local-development"
  | "vercel-demo"
  | "file-tmp-fallback";

export interface HotelPersistenceConfig {
  provider: HotelPersistenceProvider;
  configuredProvider?: string;
  databaseUrlConfigured: boolean;
  durableFileBaseDir?: string;
  isProduction: boolean;
  runtimeTarget: RuntimeTarget;
  productionReady: boolean;
  unsafeReason?: string;
}

export interface ConversationStoreRuntimeConfig {
  provider: ConversationStoreProvider;
  configuredProvider?: string;
  sourceEnv?: "MATERNALY_CONVERSATIONS_STORE_PROVIDER" | "HOTEL_CONVERSATIONS_STORE_PROVIDER";
  databaseUrlConfigured: boolean;
  sheetName?: string;
  spreadsheetIdConfigured: boolean;
  spreadsheetIdSource?: "MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID" | "HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID";
  durable: boolean;
  configured: boolean;
  productionReady: boolean;
  runtimeTarget: RuntimeTarget;
  warning?: string;
  demoVercelMode: boolean;
}

const PRODUCTION_DATA_DIR = "/data";
const DEFAULT_CONVERSATIONS_SHEET_NAME = "CONVERSATIONS";

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

function normalizeConversationStoreProvider(
  value: string | undefined,
): ConversationStoreProvider | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "google_sheets" || normalized === "google-sheets" || normalized === "sheets") {
    return "google_sheets";
  }

  return normalizeProvider(value);
}

function readFirstEnv(
  env: NodeJS.ProcessEnv,
  names: string[],
): { name: string; value: string } | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return { name, value };
    }
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

export function readConversationStoreRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConversationStoreRuntimeConfig {
  const persistence = readHotelPersistenceConfig(env);
  const configuredProviderEntry = readFirstEnv(env, [
    "MATERNALY_CONVERSATIONS_STORE_PROVIDER",
    "HOTEL_CONVERSATIONS_STORE_PROVIDER",
  ]);
  const configuredProvider = configuredProviderEntry?.value;
  const explicitProvider = normalizeConversationStoreProvider(configuredProvider);
  const provider = explicitProvider ?? persistence.provider;
  const sheetName =
    readFirstEnv(env, [
      "MATERNALY_CONVERSATIONS_SHEET_NAME",
      "HOTEL_CONVERSATIONS_SHEET_NAME",
    ])?.value ?? DEFAULT_CONVERSATIONS_SHEET_NAME;
  const spreadsheetIdEntry = readFirstEnv(env, [
    "MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID",
    "HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID",
  ]);
  const productionLike =
    env.NODE_ENV === "production" || env.APP_ENV?.trim().toLowerCase() === "production";
  const demoVercelMode =
    provider === "google_sheets" &&
    env.MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED === "true" &&
    productionLike;
  const runtimeTarget: RuntimeTarget = demoVercelMode
    ? "vercel-demo"
    : provider === "file-tmp"
      ? "file-tmp-fallback"
      : persistence.runtimeTarget;
  const databaseUrlConfigured = Boolean(env.DATABASE_URL?.trim());
  const spreadsheetIdConfigured = Boolean(spreadsheetIdEntry?.value);
  const durable =
    provider === "postgres" ||
    provider === "google_sheets" ||
    provider === "file-volume";
  const configured =
    provider === "google_sheets"
      ? spreadsheetIdConfigured
      : provider === "postgres"
        ? databaseUrlConfigured
        : true;
  const warning =
    provider === "google_sheets" && demoVercelMode
      ? "demo mode, no Postgres"
      : provider === "google_sheets" && !spreadsheetIdConfigured
        ? "Google Sheets conversation store requires MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID or HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID."
        : provider === "file-tmp"
          ? "/tmp is a non-durable fallback and must not be the main panel store."
          : provider === "file-local"
            ? "Local JSON file store is not durable for production containers."
            : undefined;
  const productionReady =
    !productionLike ||
    (provider === "postgres"
      ? databaseUrlConfigured
      : provider === "google_sheets"
        ? spreadsheetIdConfigured
        : provider === "file-volume" && env.MATERNALY_ALLOW_UNSAFE_PRODUCTION_FILE_STORE === "true");

  return {
    provider,
    configuredProvider,
    sourceEnv: configuredProviderEntry?.name as ConversationStoreRuntimeConfig["sourceEnv"],
    databaseUrlConfigured,
    sheetName: provider === "google_sheets" ? sheetName : undefined,
    spreadsheetIdConfigured,
    spreadsheetIdSource:
      spreadsheetIdEntry?.name as ConversationStoreRuntimeConfig["spreadsheetIdSource"],
    durable,
    configured,
    productionReady,
    runtimeTarget,
    warning,
    demoVercelMode,
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
