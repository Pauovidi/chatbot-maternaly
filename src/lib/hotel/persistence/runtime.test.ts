import { describe, expect, it } from "vitest";
import { readHotelPersistenceConfig, resolveJsonStorePath } from "./runtime";

describe("production persistence runtime", () => {
  it("selects postgres in production when DATABASE_URL is configured", () => {
    const config = readHotelPersistenceConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://example",
    } as NodeJS.ProcessEnv);

    expect(config.provider).toBe("postgres");
    expect(config.databaseUrlConfigured).toBe(true);
  });

  it("falls back to /data file-volume in production instead of /tmp", () => {
    const filePath = resolveJsonStorePath({
      fileName: "hotel-store.json",
      env: {
        NODE_ENV: "production",
        HOTEL_PERSISTENCE_PROVIDER: "file-volume",
      } as NodeJS.ProcessEnv,
    });

    const normalized = filePath.replaceAll("\\", "/");
    expect(normalized).toBe("/data/hotel-store.json");
    expect(normalized).not.toContain("/tmp");
  });

  it("honors explicit durable file paths", () => {
    const filePath = resolveJsonStorePath({
      fileName: "hotel-store.json",
      pathEnv: "HOTEL_DEMO_STORE_PATH",
      env: {
        NODE_ENV: "production",
        HOTEL_DEMO_STORE_PATH: "/data/hotel-store.json",
      } as NodeJS.ProcessEnv,
    });

    expect(filePath).toBe("/data/hotel-store.json");
  });
});
