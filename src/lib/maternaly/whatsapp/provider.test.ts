import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMaternalyWhatsAppProvider,
  MockWhatsAppProvider,
  normalizePhone,
  TwilioProvider,
  YCloudProvider,
} from "./provider";

describe("WhatsApp providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("sends an image through YCloud with the first-response caption", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "ycloud_image_1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new YCloudProvider("api-key").sendMedia({
      from: "+34940000123",
      to: "+34600000123",
      mediaUrl: "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
      mediaType: "image",
      text: "Aquí tienes la información del taller BLW.",
    });

    expect(result).toMatchObject({ ok: true, provider: "ycloud", sid: "ycloud_image_1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.ycloud.com/v2/whatsapp/messages/sendDirectly",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      from: "+34940000123",
      to: "+34600000123",
      type: "image",
      image: {
        link: "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
        caption: "Aquí tienes la información del taller BLW.",
      },
    });
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
