import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("EasyPanel production readiness", () => {
  it("enables Next standalone output and basic security headers", () => {
    const source = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

    expect(source).toContain('output: "standalone"');
    expect(source).toContain("X-Frame-Options");
    expect(source).toContain("X-Content-Type-Options");
    expect(source).toContain("Referrer-Policy");
  });

  it("ships a Dockerfile that starts the standalone server as a non-root user", () => {
    const dockerfile = readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toContain("npm ci");
    expect(dockerfile).toContain("npm run build");
    expect(dockerfile).toContain("USER nextjs");
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
    expect(dockerfile).toContain("EXPOSE 3000");
    expect(dockerfile).toContain("rm -rf .next/standalone/.demo-state");
    expect(dockerfile).toContain(".next/standalone/bot-maternaly-*.json");
    expect(dockerfile).toContain(".next/standalone/bot-somos-muy-perros-*.json");
    expect(dockerfile).toContain("/app/db/migrations ./db/migrations");
    expect(dockerfile).toContain("/app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs");
  });

  it("does not copy env files or local credentials into the Docker build context", () => {
    const dockerignore = readFileSync(path.join(process.cwd(), ".dockerignore"), "utf8");

    expect(dockerignore).toMatch(/^\.env$/m);
    expect(dockerignore).toMatch(/^\.env\.\*$/m);
    expect(dockerignore).toMatch(/^\.tokens$/m);
    expect(dockerignore).toMatch(/^bot-maternaly-\*\.json$/m);
    expect(dockerignore).toMatch(/^bot-somos-muy-perros-f72ee12e98cb\.json$/m);
    expect(dockerignore).toMatch(/\*credential\*/);
    expect(dockerignore).toMatch(/\*secret\*/);
  });

  it("exposes production helper scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["docker:build"]).toContain("docker build");
    expect(packageJson.scripts["smoke:docker"]).toContain("smoke-docker");
    expect(packageJson.scripts["db:migrate"]).toContain("db-migrate");
    expect(packageJson.scripts["easypanel:check"]).toContain("check-easypanel-env");
  });

  it("uses Maternaly panel auth names in proxy and docs", () => {
    const proxy = readFileSync(path.join(process.cwd(), "src/proxy.ts"), "utf8");
    const docs = readFileSync(path.join(process.cwd(), "docs/easypanel.md"), "utf8");

    expect(proxy).toContain("PANEL_ADMIN_USERNAME");
    expect(proxy).toContain("PANEL_ADMIN_PASSWORD");
    expect(proxy).toContain('Basic realm="Maternaly operaciones"');
    expect(docs).toContain("PANEL_ADMIN_USERNAME");
    expect(docs).toContain("PANEL_ADMIN_PASSWORD");
    expect(docs).not.toContain("hotel-canino-demo.vercel.app");
  });
});
