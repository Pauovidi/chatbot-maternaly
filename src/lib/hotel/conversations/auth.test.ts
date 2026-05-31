import { describe, expect, it } from "vitest";
import { verifyPanelAuthorization } from "./auth";

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("panel auth", () => {
  it("protects production access when credentials are missing", () => {
    const result = verifyPanelAuthorization(null, { NODE_ENV: "production" });
    expect(result.ok).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("accepts valid basic credentials", () => {
    const result = verifyPanelAuthorization(basic("ops", "secret"), {
      NODE_ENV: "production",
      PANEL_ADMIN_USERNAME: "ops",
      PANEL_ADMIN_PASSWORD: "secret",
    });
    expect(result.ok).toBe(true);
    expect(result.agent).toBe("ops");
  });

  it("does not allow preview review when panel credentials are not configured", () => {
    const result = verifyPanelAuthorization(null, {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    });
    expect(result.ok).toBe(false);
    expect(result.response?.status).toBe(503);
  });

  it("rejects invalid basic credentials", () => {
    const result = verifyPanelAuthorization(basic("ops", "bad"), {
      NODE_ENV: "production",
      PANEL_ADMIN_USERNAME: "ops",
      PANEL_ADMIN_PASSWORD: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.response?.status).toBe(401);
    expect(result.response?.headers.get("WWW-Authenticate")).toContain("Maternaly");
  });
});
