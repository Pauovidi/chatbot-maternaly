import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConversationStore, resetConversationStoreForTests } from "@/lib/hotel/conversations/file-store";
import { POST } from "./route";

let tempDir: string;

async function postSeed(input: {
  token?: string;
  body?: unknown;
} = {}) {
  return POST(
    new Request("https://example.test/api/maternaly/admin/conversations/seed-demo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.token ? { "x-maternaly-admin-task-token": input.token } : {}),
      },
      body: JSON.stringify(input.body ?? {}),
    }),
  );
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "maternaly-seed-route-"));
  vi.stubEnv("MATERNALY_CONVERSATIONS_STORE_PROVIDER", "file-local");
  vi.stubEnv("HOTEL_CONVERSATIONS_STORE_PROVIDER", "file-local");
  vi.stubEnv("HOTEL_CONVERSATIONS_STORE_PATH", path.join(tempDir, "conversations.json"));
  resetConversationStoreForTests();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  resetConversationStoreForTests();
  await rm(tempDir, { recursive: true, force: true });
});

describe("Maternaly conversations seed demo route", () => {
  it("requires the admin task token in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("MATERNALY_ADMIN_TASK_TOKEN", "");

    const response = await postSeed();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it("creates five conversations through the protected endpoint", async () => {
    vi.stubEnv("MATERNALY_ADMIN_TASK_TOKEN", "secure-token");

    const response = await postSeed({ token: "secure-token" });
    const body = await response.json();
    const snapshot = await getConversationStore().load();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.created).toBe(5);
    expect(body.result.totalSeedConversations).toBe(5);
    expect(snapshot.conversations).toHaveLength(5);
    expect(snapshot.conversations.map((conversation) => conversation.clientName)).toContain("Laura Demo");
  });

  it("does not duplicate an existing seed batch", async () => {
    vi.stubEnv("MATERNALY_ADMIN_TASK_TOKEN", "secure-token");

    await postSeed({ token: "secure-token" });
    const response = await postSeed({ token: "secure-token" });
    const body = await response.json();
    const snapshot = await getConversationStore().load();

    expect(response.status).toBe(200);
    expect(body.result.created).toBe(0);
    expect(body.result.skipped).toBe(5);
    expect(snapshot.conversations).toHaveLength(5);
  });
});
