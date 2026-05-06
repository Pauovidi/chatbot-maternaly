import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("conversation panel security guardrails", () => {
  it("keeps sensitive reference artifact patterns ignored", () => {
    const gitignore = readFileSync(".gitignore", "utf8");

    expect(gitignore).toContain(".env*");
    expect(gitignore).toContain(".vercel");
    expect(gitignore).toContain("bot-somos-muy-perros-*.json");
  });
});
