#!/usr/bin/env node

import { spawn } from "node:child_process";

const image = process.env.DOCKER_IMAGE ?? "hotel-canino-demo:local";
const name = `hotel-canino-demo-smoke-${Date.now()}`;
const port = process.env.SMOKE_DOCKER_PORT ?? "3000";

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
  const deadline = Date.now() + 30000;
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
    "-d",
    "--name",
    name,
    "-p",
    `${port}:3000`,
    "-e",
    "NODE_ENV=production",
    "-e",
    "HOTEL_PANEL_USERNAME=smoke",
    "-e",
    "HOTEL_PANEL_PASSWORD=smoke",
    "-e",
    "TWILIO_WEBHOOK_AUTH_TOKEN=smoke-token",
    "-e",
    "HOTEL_CONVERSATIONS_STORE_PATH=/data/conversations.json",
    "-e",
    "HOTEL_DEMO_STORE_PATH=/data/hotel-store.json",
    "-e",
    "HOTEL_DOMAIN_STORE_PATH=/data/hotel-domain.json",
    "-e",
    "HOTEL_EMAIL_STATE_STORE_PATH=/data/email-state.json",
    image,
  ]);
  await waitForHealth();
  await run("node", ["scripts/smoke-http.mjs"], {
    env: {
      ...process.env,
      SMOKE_BASE_URL: `http://127.0.0.1:${port}`,
      SMOKE_BASIC_AUTH: Buffer.from("smoke:smoke").toString("base64"),
      TWILIO_WEBHOOK_AUTH_TOKEN: "smoke-token",
    },
  });
} finally {
  await run("docker", ["rm", "-f", name]).catch(() => undefined);
}
