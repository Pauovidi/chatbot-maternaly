import { describe, expect, it } from "vitest";
import {
  createMaternalyWhatsAppProvider,
  MockWhatsAppProvider,
  normalizePhone,
  TwilioProvider,
  YCloudProvider,
} from "./provider";

describe("WhatsApp providers", () => {
  it("normalizes Spanish phones", () => {
    expect(normalizePhone("600 000 123")).toBe("+34600000123");
  });

  it("normalizes mock inbound messages", () => {
    const inbound = new MockWhatsAppProvider().normalizeInbound({
      id: "evt_1",
      from: "600000123",
      text: "Hola",
    });

    expect(inbound.id).toBe("evt_1");
    expect(inbound.from).toBe("+34600000123");
  });

  it("does not send through YCloud without api key", async () => {
    const result = await new YCloudProvider("").sendText({ to: "+34600000123", text: "Hola" });
    expect(result.ok).toBe(false);
  });

  it("normalizes Twilio Sandbox inbound messages", () => {
    const inbound = new TwilioProvider().normalizeInbound({
      MessageSid: "SM_test",
      From: "whatsapp:+34 600 000 123",
      To: "whatsapp:+14155238886",
      Body: "Hola",
    });

    expect(inbound).toEqual(
      expect.objectContaining({
        id: "SM_test",
        provider: "twilio",
        from: "+34600000123",
        to: "+14155238886",
        text: "Hola",
      }),
    );
  });

  it("creates the Twilio provider when WHATSAPP_PROVIDER=twilio", () => {
    const previousProvider = process.env.WHATSAPP_PROVIDER;
    process.env.WHATSAPP_PROVIDER = "twilio";

    try {
      expect(createMaternalyWhatsAppProvider()).toBeInstanceOf(TwilioProvider);
    } finally {
      if (previousProvider === undefined) {
        delete process.env.WHATSAPP_PROVIDER;
      } else {
        process.env.WHATSAPP_PROVIDER = previousProvider;
      }
    }
  });
});
