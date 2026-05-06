import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("secret hygiene", () => {
  it("keeps local env, token, demo-state, Vercel, and service-account files ignored", () => {
    const gitignore = readFileSync(
      path.join(process.cwd(), ".gitignore"),
      "utf8",
    );

    expect(gitignore).toMatch(/^\.env\*/m);
    expect(gitignore).toMatch(/^\.tokens\/$/m);
    expect(gitignore).toMatch(/^\.demo-state\/$/m);
    expect(gitignore).toMatch(/^\.vercel$/m);
    expect(gitignore).toMatch(/^bot-somos-muy-perros-\*\.json$/m);
    expect(gitignore).toMatch(/^\*.pem$/m);
  });

  it("documents the conversations seed as synthetic data without raw credentials", () => {
    const seedScript = readFileSync(
      path.join(process.cwd(), "scripts", "hotel-conversations-seed.ts"),
      "utf8",
    );

    expect(seedScript).toContain("hotel-conversations.json");
    expect(seedScript).toContain("redactConversationText");
    expect(seedScript).not.toMatch(
      /process\.env\.[A-Z0-9_]*(PASSWORD|TOKEN|SECRET|KEY)/,
    );
    expect(seedScript).not.toContain(".env.local");
    expect(seedScript).not.toContain("bot-somos-muy-perros-f72ee12e98cb.json");
  });
});
