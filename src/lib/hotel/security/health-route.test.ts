import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.unstubAllEnvs();
  });

  it("returns app, WhatsApp and persistence status without secrets", async () => {
    vi.stubEnv("NODE_ENV", "production");
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
      }),
    );
    expect(json.database.provider).toBe("postgres");
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("password@example");
  });
});
