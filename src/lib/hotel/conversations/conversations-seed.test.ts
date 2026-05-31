import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertNoSecretLikeValues,
  buildConversationSeed,
  redactConversationText,
  writeConversationSeed,
} from "../../../../scripts/hotel-conversations-seed";

describe("conversations panel seed contract", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("builds deterministic v0 conversations for list and detail views", () => {
    const seed = buildConversationSeed("2026-05-06T08:00:00.000Z");

    expect(seed.updatedAt).toBe("2026-05-06T08:00:00.000Z");
    expect(seed.conversations).toHaveLength(3);
    expect(seed.conversations.map((conversation) => conversation.serviceDetected)).toEqual([
      "AIPAP Agua",
      "Preparacion al Parto",
      "Pilates Embarazo",
    ]);
    expect(
      seed.conversations.some(
        (conversation) => conversation.mode === "human" && conversation.humanRequested,
      ),
    ).toBe(true);
    expect(
      seed.conversations.some(
        (conversation) =>
          conversation.mode === "bot" && conversation.unreadCount === 0,
      ),
    ).toBe(true);

    for (const conversation of seed.conversations) {
      expect(conversation.id).toMatch(/^conv[-_]/);
      expect(conversation.phoneNormalized).toMatch(/^\d+$/);
      expect(conversation.messages.length).toBeGreaterThan(0);
      expect(conversation.updatedAt).toBe(
        conversation.messages.at(-1)?.createdAt,
      );
      expect(conversation.events.length).toBeGreaterThan(0);
    }
  });

  it("redacts direct identifiers and token-shaped values before writing fixtures", () => {
    const redacted = redactConversationText(
      "Email test@example.com phone +34 600 123 456 Bearer abc.def.ghi",
    );

    expect(redacted).toContain("[redacted-email]");
    expect(redacted).toContain("[redacted-phone]");
    expect(redacted).toContain("Bearer [redacted-token]");
    expect(redacted).not.toContain("test@example.com");
    expect(redacted).not.toContain("+34 600 123 456");
    expect(redacted).not.toContain("abc.def.ghi");
  });

  it("fails fast if a seed payload accidentally includes secret-like values", () => {
    expect(() =>
      assertNoSecretLikeValues({
        credentials: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
      }),
    ).toThrow(/secret-like value/);

    expect(() =>
      assertNoSecretLikeValues({
        fileName: "bot-somos-muy-perros-f72ee12e98cb.json",
      }),
    ).toThrow(/secret-like value/);
  });

  it("writes only the synthetic conversations store in an isolated directory", async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hotel-conversations-"));

    const targetFile = await writeConversationSeed(tempDir);
    const payload = JSON.parse(readFileSync(targetFile, "utf8"));

    expect(path.dirname(targetFile)).toBe(tempDir);
    expect(path.basename(targetFile)).toBe("hotel-conversations.json");
    expect(payload.conversations).toHaveLength(
      buildConversationSeed().conversations.length,
    );
    expect(payload.conversations[0].messages[0]).toEqual(
      expect.objectContaining({
        transport: "whatsapp",
        direction: "inbound",
      }),
    );
    expect(JSON.stringify(payload)).not.toMatch(/bot-somos-muy-perros/i);
    expect(JSON.stringify(payload)).not.toMatch(/-----BEGIN PRIVATE KEY-----/i);
  });
});
