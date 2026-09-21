import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const validBody = {
  action: "reserve",
  source: "hermes",
  confirmed: true,
  sessionId: "CHARLA_2026_10_06_BILBAO_1700",
  fullName: "Ana García",
  phone: "+34600000123",
  peopleCount: 1,
  fppOrDueDate: "2027-03-01",
};

describe("Hermes Charla Informativa integration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires the dedicated integration secret", async () => {
    vi.stubEnv("MATERNALY_HERMES_INTEGRATION_TOKEN", "hermes-secret");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(401);
  });

  it("never writes without explicit confirmation", async () => {
    vi.stubEnv("MATERNALY_HERMES_INTEGRATION_TOKEN", "hermes-secret");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ...validBody, confirmed: false }),
      headers: {
        authorization: "Bearer hermes-secret",
        "content-type": "application/json",
      },
    }));
    expect(response.status).toBe(400);
  });

  it("requires the pregnancy due date in ISO format", async () => {
    vi.stubEnv("MATERNALY_HERMES_INTEGRATION_TOKEN", "hermes-secret");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ...validBody, fppOrDueDate: "01/03/2027" }),
      headers: {
        authorization: "Bearer hermes-secret",
        "content-type": "application/json",
      },
    }));
    expect(response.status).toBe(400);
  });

  it("requires the companion name when two people attend", async () => {
    vi.stubEnv("MATERNALY_HERMES_INTEGRATION_TOKEN", "hermes-secret");
    const response = await POST(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ...validBody, peopleCount: 2 }),
      headers: {
        authorization: "Bearer hermes-secret",
        "content-type": "application/json",
      },
    }));
    expect(response.status).toBe(400);
  });
});
