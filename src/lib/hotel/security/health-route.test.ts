import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.unstubAllEnvs();
  });

  it("returns app, WhatsApp and persistence status without secrets", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.APP_ENV = "development";
    process.env.WHATSAPP_PROVIDER = "ycloud";
    process.env.YCLOUD_API_KEY = "super-secret-token";
    process.env.DATABASE_URL = "postgres://user:password@example.test/db";
    process.env.HOTEL_PERSISTENCE_PROVIDER = "postgres";

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.whatsapp).toEqual(
      expect.objectContaining({
        provider: "ycloud",
        ycloudConfigured: true,
        ycloudWebhookSecretConfigured: false,
      }),
    );
    expect(json.database.provider).toBe("postgres");
    expect(json.database.migrations).toEqual(
      expect.objectContaining({
        ready: false,
        missing: expect.arrayContaining([1, 2, 3, 4, 5]),
      }),
    );
    expect(json.panel).toEqual(
      expect.objectContaining({
        route: "/admin/conversations",
        ready: true,
      }),
    );
    expect(json.conversationsStore).toEqual(
      expect.objectContaining({
        provider: "postgres",
      }),
    );
    expect(json.build).toEqual(
      expect.objectContaining({
        source: expect.any(String),
      }),
    );
    expect(json.googleSheets.writeEnabled).toBe(false);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("password@example");
  });

  it("fails production health when EasyPanel Postgres is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ENV = "production";
    process.env.APP_NAME = "Maternaly";
    process.env.WHATSAPP_PROVIDER = "mock";
    delete process.env.DATABASE_URL;

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.runtimeTarget).toBe("easypanel-container");
    expect(json.database.productionReady).toBe(false);
    expect(json.database.warning).toContain("DATABASE_URL");
    expect(json.database.migrations.ready).toBe(false);
    expect(json.panel.ready).toBe(false);
  });
});
