#!/usr/bin/env node

import { spawn } from "node:child_process";

const image = process.env.DOCKER_IMAGE ?? "chatbot-maternaly:local";
const name = `maternaly-smoke-${Date.now()}`;
const port = process.env.SMOKE_DOCKER_PORT ?? "3000";
const databaseUrl = process.env.SMOKE_DATABASE_URL ?? process.env.DATABASE_URL;
const dockerNetwork = process.env.SMOKE_DOCKER_NETWORK;

if (!databaseUrl?.trim()) {
  console.error("SMOKE_DATABASE_URL or DATABASE_URL is required for production-like Docker smoke.");
  process.exit(1);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

async function waitForHealth() {
  const url = `http://127.0.0.1:${port}/api/health`;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the container is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Container healthcheck did not become ready.");
}

try {
  await run("docker", ["build", "-t", image, "."]);
  await run("docker", [
    "run",
    "--rm",
    ...(dockerNetwork ? ["--network", dockerNetwork] : []),
    "-e",
    `DATABASE_URL=${databaseUrl}`,
    image,
    "node",
    "scripts/db-migrate.mjs",
  ]);
  await run("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    ...(dockerNetwork ? ["--network", dockerNetwork] : []),
    "-p",
    `${port}:3000`,
    "-e",
    "APP_NAME=Maternaly",
    "-e",
    "APP_ENV=production",
    "-e",
    "NODE_ENV=production",
    "-e",
    "WHATSAPP_PROVIDER=mock",
    "-e",
    "GOOGLE_SHEETS_ACCESS_MODE=read_only",
    "-e",
    "BOT_SHEETS_LIVE_WRITE_ENABLED=false",
    "-e",
    "LLM_PROVIDER=mock",
    "-e",
    "PANEL_ADMIN_USERNAME=smoke",
    "-e",
    "PANEL_ADMIN_PASSWORD=smoke",
    "-e",
    `DATABASE_URL=${databaseUrl}`,
    image,
  ]);
  await waitForHealth();
  await run("node", ["scripts/smoke-http.mjs"], {
    env: {
      ...process.env,
      SMOKE_BASE_URL: `http://127.0.0.1:${port}`,
      SMOKE_BASIC_AUTH: Buffer.from("smoke:smoke").toString("base64"),
      SMOKE_REQUIRE_PRODUCTION_SAFE: "true",
    },
  });
} finally {
  await run("docker", ["rm", "-f", name]).catch(() => undefined);
}
