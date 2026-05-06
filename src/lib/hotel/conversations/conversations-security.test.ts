import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST as postTwilioWebhook } from "../../../app/api/twilio/whatsapp/route";

import {
  buildTwilioMessageResponse,
  normalizePhone,
} from "./service";
import { verifyPanelAuthorization } from "./auth";

describe("conversations security", () => {
  afterEach(() => {
    delete process.env.TWILIO_WEBHOOK_AUTH_TOKEN;
  });

  it("rejects panel access in production when credentials are missing", () => {
    const result = verifyPanelAuthorization(null, {
      NODE_ENV: "production",
    });

    expect(result.ok).toBe(false);
    expect(result.agent).toBe("anonymous");
    expect(result.response?.status).toBe(503);
  });

  it("requires matching basic auth credentials when configured", () => {
    const env = {
      NODE_ENV: "production",
      HOTEL_PANEL_USERNAME: "admin",
      HOTEL_PANEL_PASSWORD: "correct-password",
    };
    const invalid = Buffer.from("admin:wrong-password").toString("base64");
    const valid = Buffer.from("admin:correct-password").toString("base64");

    const rejected = verifyPanelAuthorization(`Basic ${invalid}`, env);
    const accepted = verifyPanelAuthorization(`Basic ${valid}`, env);

    expect(rejected.ok).toBe(false);
    expect(rejected.response?.status).toBe(401);
    expect(rejected.response?.headers.get("WWW-Authenticate")).toContain(
      "Basic",
    );
    expect(accepted.ok).toBe(true);
    expect(accepted.agent).toBe("admin");
  });

  it("normalizes WhatsApp phone values without preserving formatting noise", () => {
    expect(normalizePhone("whatsapp:+34 600 123 456")).toEqual({
      phoneE164: "+34600123456",
      phoneNormalized: "34600123456",
    });
  });

  it("escapes TwiML message bodies before returning XML", () => {
    const twiml = buildTwilioMessageResponse("Hola <admin> & gracias");

    expect(twiml).toContain("Hola &lt;admin&gt; &amp; gracias");
    expect(twiml).not.toContain("Hola <admin> & gracias");
  });

  it("keeps all panel conversation API routes behind panel auth", () => {
    const routeFiles = [
      "src/app/api/conversations/route.ts",
      "src/app/api/conversations/[id]/route.ts",
      "src/app/api/conversations/[id]/reply/route.ts",
      "src/app/api/conversations/[id]/mode/route.ts",
      "src/app/api/conversations/[id]/mark-read/route.ts",
    ];

    for (const routeFile of routeFiles) {
      const source = readFileSync(path.join(process.cwd(), routeFile), "utf8");
      expect(source, routeFile).toContain("requirePanelAuth");
      expect(source, routeFile).toContain("if (!auth.ok)");
    }
  });

  it("rejects Twilio webhook calls with an invalid configured token", async () => {
    process.env.TWILIO_WEBHOOK_AUTH_TOKEN = "expected-token";

    const response = await postTwilioWebhook(
      new Request("https://example.test/api/twilio/whatsapp", {
        method: "POST",
        headers: {
          "x-hotel-webhook-token": "wrong-token",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toContain("text/xml");
    expect(await response.text()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    );
  });

  it.todo("gates the admin conversations page with verifyPanelPageAccess");
});
