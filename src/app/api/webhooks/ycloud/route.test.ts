import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConversationStoreForTests } from "@/lib/hotel/conversations/file-store";
import { POST } from "./route";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "maternaly-ycloud-"));
  vi.stubEnv("MATERNALY_CONVERSATIONS_STORE_PROVIDER", "file-local");
  vi.stubEnv("HOTEL_CONVERSATIONS_STORE_PROVIDER", "file-local");
  vi.stubEnv("HOTEL_CONVERSATIONS_STORE_PATH", path.join(tempDir, "conversations.json"));
  vi.stubEnv("LLM_PROVIDER", "mock");
  vi.stubEnv("YCLOUD_API_KEY", "test-api-key");
  vi.stubEnv("YCLOUD_WEBHOOK_SECRET", "");
  vi.stubEnv("APP_BASE_URL", "https://maternaly.example.test");
  resetConversationStoreForTests();
});

afterEach(async () => {
  resetConversationStoreForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});

describe("YCloud Maternaly webhook", () => {
  it("sends the BLW poster as a WhatsApp image with the reply as caption", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "ycloud_blw_1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("https://maternaly.example.test/api/webhooks/ycloud", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "evt_blw_1",
          from: "+34600000123",
          to: "+34940000123",
          text: "Quiero información del taller BLW",
        }),
      }),
    );
    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      outbound: {
        textDeliveredWithMedia: true,
        mediaAttempted: 1,
        mediaDelivered: 1,
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      from: "+34940000123",
      to: "+34600000123",
      type: "image",
      image: {
        link: "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
      },
    });
  });
});
