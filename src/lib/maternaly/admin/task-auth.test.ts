import { describe, expect, it } from "vitest";
import { verifyMaternalyAdminTaskRequest } from "@/lib/maternaly/admin/task-auth";

describe("Maternaly admin task auth", () => {
  it("requires the admin task token to be configured", () => {
    const result = verifyMaternalyAdminTaskRequest(new Request("https://example.test"), {});

    expect(result).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("rejects missing or invalid presented tokens", () => {
    const env = { MATERNALY_ADMIN_TASK_TOKEN: "secure-token" };

    expect(verifyMaternalyAdminTaskRequest(new Request("https://example.test"), env)).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      verifyMaternalyAdminTaskRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer wrong-token" },
        }),
        env,
      ),
    ).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("accepts bearer and explicit admin task headers", () => {
    const env = { MATERNALY_ADMIN_TASK_TOKEN: "secure-token" };

    expect(
      verifyMaternalyAdminTaskRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer secure-token" },
        }),
        env,
      ),
    ).toEqual({ ok: true });
    expect(
      verifyMaternalyAdminTaskRequest(
        new Request("https://example.test", {
          headers: { "x-maternaly-admin-task-token": "secure-token" },
        }),
        env,
      ),
    ).toEqual({ ok: true });
  });
});
