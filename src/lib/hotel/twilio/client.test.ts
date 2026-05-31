import { describe, expect, it, vi } from "vitest";
import { readTwilioWhatsAppConfig, sendTwilioWhatsAppText } from "./client";

describe("twilio whatsapp client", () => {
  it("uses mock mode when credentials are not configured", async () => {
    const result = await sendTwilioWhatsAppText(
      { to: "+34612345678", body: "Hola" },
      { mock: true, providerMode: "mock" },
    );

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("mock");
  });

  it("detects real and sandbox provider modes from env-gated Twilio config", () => {
    expect(
      readTwilioWhatsAppConfig({
        NODE_ENV: "test",
        TWILIO_ACCOUNT_SID: "AC_test",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_WHATSAPP_FROM: "whatsapp:+34600111222",
        HOTEL_CONVERSATIONS_MOCK_TWILIO: "false",
      }).providerMode,
    ).toBe("real");
    expect(
      readTwilioWhatsAppConfig({
        NODE_ENV: "test",
        TWILIO_ACCOUNT_SID: "AC_test",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
        HOTEL_CONVERSATIONS_MOCK_TWILIO: "false",
      }).providerMode,
    ).toBe("sandbox");
    expect(
      readTwilioWhatsAppConfig({
        NODE_ENV: "test",
        TWILIO_ACCOUNT_SID: "AC_test",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_MESSAGING_SERVICE_SID: "MG_test",
        HOTEL_CONVERSATIONS_MOCK_TWILIO: "false",
      }).providerMode,
    ).toBe("real");
  });

  it("returns a non-throwing failure when Twilio rejects", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("bad", { status: 401 }),
    );

    const result = await sendTwilioWhatsAppText(
      { to: "+34612345678", body: "Hola" },
      {
        accountSid: "AC_test",
        authToken: "token",
        from: "+15551234567",
        mock: false,
        providerMode: "real",
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("real");
    fetchMock.mockRestore();
  });

  it("uses MessagingServiceSid instead of From when configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: "SM_real" }), { status: 200 }),
    );

    const result = await sendTwilioWhatsAppText(
      { to: "+34612345678", body: "Hola" },
      {
        accountSid: "AC_test",
        authToken: "token",
        from: "+15551234567",
        messagingServiceSid: "MG_test",
        mock: false,
        providerMode: "real",
      },
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body as URLSearchParams;

    expect(result.ok).toBe(true);
    expect(body.get("MessagingServiceSid")).toBe("MG_test");
    expect(body.has("From")).toBe(false);
    expect(body.get("To")).toBe("whatsapp:+34612345678");
    fetchMock.mockRestore();
  });

  it("returns a non-throwing failure when the network request fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network down"));

    const result = await sendTwilioWhatsAppText(
      { to: "+34612345678", body: "Hola" },
      {
        accountSid: "AC_test",
        authToken: "token",
        from: "+15551234567",
        mock: false,
        providerMode: "real",
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("real");
    expect(result.error).toBe("Twilio network request failed.");
    fetchMock.mockRestore();
  });
});
