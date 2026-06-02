import { describe, expect, it } from "vitest";
import {
  readConversationStoreRuntimeConfig,
  readHotelPersistenceConfig,
  resolveJsonStorePath,
} from "./runtime";

describe("production persistence runtime", () => {
  it("selects postgres in production when DATABASE_URL is configured", () => {
    const config = readHotelPersistenceConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://example",
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("postgres");
    expect(config.databaseUrlConfigured).toBe(true);
    expect(config.runtimeTarget).toBe("easypanel-container");
    expect(config.productionReady).toBe(true);
  });

  it("requires DATABASE_URL in production instead of silently choosing a file store", () => {
    const config = readHotelPersistenceConfig({
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("postgres");
    expect(config.databaseUrlConfigured).toBe(false);
    expect(config.productionReady).toBe(false);
    expect(config.unsafeReason).toContain("DATABASE_URL");
    expect(() =>
      resolveJsonStorePath({
        fileName: "hotel-store.json",
        env: {
          NODE_ENV: "production",
        } as NodeJS.ProcessEnv,
      }),
    ).toThrow(/JSON file store is disabled/);
  });

  it("does not switch to tmp storage for Vercel Preview", () => {
    const config = readHotelPersistenceConfig({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("postgres");
    expect(config.runtimeTarget).toBe("easypanel-container");
    expect(config.productionReady).toBe(false);
  });

  it("blocks explicit file-volume in production unless the unsafe opt-in is set", () => {
    const config = readHotelPersistenceConfig({
      NODE_ENV: "production",
      HOTEL_PERSISTENCE_PROVIDER: "file-volume",
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("postgres");
    expect(config.productionReady).toBe(false);
    expect(config.unsafeReason).toContain("Postgres");
  });

  it("allows explicit production file store only with unsafe opt-in", () => {
    const filePath = resolveJsonStorePath({
      fileName: "hotel-conversations.json",
      pathEnv: "HOTEL_CONVERSATIONS_STORE_PATH",
      env: {
        NODE_ENV: "production",
        HOTEL_CONVERSATIONS_STORE_PATH: "/data/conversations.json",
        MATERNALY_ALLOW_UNSAFE_PRODUCTION_FILE_STORE: "true",
      } as NodeJS.ProcessEnv,
    });

    expect(filePath).toBe("/data/conversations.json");
  });

  it("honors explicit durable file paths in development", () => {
    const filePath = resolveJsonStorePath({
      fileName: "hotel-store.json",
      pathEnv: "HOTEL_DEMO_STORE_PATH",
      env: {
        NODE_ENV: "development",
        HOTEL_DEMO_STORE_PATH: "/data/hotel-store.json",
      } as NodeJS.ProcessEnv,
    });

    expect(filePath).toBe("/data/hotel-store.json");
  });

  it("selects Google Sheets conversations store from Maternaly aliases first", () => {
    const config = readConversationStoreRuntimeConfig({
      NODE_ENV: "production",
      APP_ENV: "production",
      MATERNALY_CONVERSATIONS_STORE_PROVIDER: "google_sheets",
      HOTEL_CONVERSATIONS_STORE_PROVIDER: "postgres",
      MATERNALY_CONVERSATIONS_SHEET_NAME: "CONVERSATIONS",
      HOTEL_CONVERSATIONS_SHEET_NAME: "HOTEL_CONVERSATIONS",
      MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID: "maternaly-sheet-id",
      HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID: "hotel-sheet-id",
      MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED: "true",
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("google_sheets");
    expect(config.sourceEnv).toBe("MATERNALY_CONVERSATIONS_STORE_PROVIDER");
    expect(config.sheetName).toBe("CONVERSATIONS");
    expect(config.spreadsheetIdConfigured).toBe(true);
    expect(config.spreadsheetIdSource).toBe("MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID");
    expect(config.runtimeTarget).toBe("vercel-demo");
    expect(config.durable).toBe(true);
    expect(config.warning).toContain("demo mode");
  });

  it("keeps legacy HOTEL conversation store variables compatible", () => {
    const config = readConversationStoreRuntimeConfig({
      NODE_ENV: "production",
      APP_ENV: "production",
      HOTEL_CONVERSATIONS_STORE_PROVIDER: "google_sheets",
      HOTEL_CONVERSATIONS_SHEET_NAME: "CONVERSATIONS",
      HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID: "legacy-sheet-id",
      MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED: "true",
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("google_sheets");
    expect(config.sourceEnv).toBe("HOTEL_CONVERSATIONS_STORE_PROVIDER");
    expect(config.sheetName).toBe("CONVERSATIONS");
    expect(config.spreadsheetIdSource).toBe("HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID");
    expect(config.productionReady).toBe(true);
  });
});
