import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("dialogue evaluation access boundary", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("requires admin authorization even for the fixed synthetic cases", async () => {
    vi.stubEnv("MATERNALY_ADMIN_TASK_TOKEN", "synthetic-admin-token");
    vi.stubEnv("MATERNALY_DIALOGUE_EVAL_ENABLED", "true");
    const result = await POST(new Request("https://example.test/api/evaluate", { method: "POST", body: "{}" }));
    expect(result.status).toBe(401);
  });
  it("stays disabled unless explicitly enabled", async () => {
    vi.stubEnv("MATERNALY_ADMIN_TASK_TOKEN", "synthetic-admin-token");
    vi.stubEnv("MATERNALY_DIALOGUE_EVAL_ENABLED", "false");
    const result = await POST(new Request("https://example.test/api/evaluate", { method: "POST", headers: { authorization: "Bearer synthetic-admin-token" }, body: "{}" }));
    expect(result.status).toBe(403);
  });
  it("rejects an arbitrary offset before making any model call", async () => {
    vi.stubEnv("MATERNALY_ADMIN_TASK_TOKEN", "synthetic-admin-token");
    vi.stubEnv("MATERNALY_DIALOGUE_EVAL_ENABLED", "true");
    const result = await POST(new Request("https://example.test/api/evaluate", { method: "POST", headers: { authorization: "Bearer synthetic-admin-token" }, body: '{"offset":-1}' }));
    expect(result.status).toBe(400);
  });
});
