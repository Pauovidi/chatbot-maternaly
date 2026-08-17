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
    expect(
      readTwilioWhatsAppConfig({
        NODE_ENV: "test",
        TWILIO_ACCOUNT_SID: "AC_test",
        TWILIO_AUTH_TOKEN: "token",
        TWILIO_WHATSAPP_FROM: "whatsapp:+34600111222",
        TWILIO_PROVIDER_MODE: "sandbox",
        HOTEL_CONVERSATIONS_MOCK_TWILIO: "false",
      }).providerMode,
    ).toBe("sandbox");
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

  it("includes a public media URL when sending a WhatsApp message", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ sid: "SM_media" }), { status: 200 }),
    );

    const result = await sendTwilioWhatsAppText(
      {
        to: "+34612345678",
        body: "Hola",
        mediaUrl: "https://maternaly.example.test/poster.jpeg",
      },
      {
        accountSid: "AC_test",
        authToken: "token",
        from: "+15551234567",
        mock: false,
        providerMode: "real",
      },
    );
    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body as URLSearchParams;

    expect(result.ok).toBe(true);
    expect(body.get("MediaUrl")).toBe("https://maternaly.example.test/poster.jpeg");
    fetchMock.mockRestore();
  });

  it("marks a definite pre-send network failure as safe for fallback", async () => {
    const cause = Object.assign(new Error("dns lookup failed"), { code: "ENOTFOUND" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause }));

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
    expect(result.ambiguous).toBe(false);
    expect(result.error).toBe("Twilio network request failed.");
    fetchMock.mockRestore();
  });

  it("marks a connection reset as ambiguous after the POST may have been accepted", async () => {
    const cause = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new TypeError("fetch failed"), { cause }),
    );

    await expect(
      sendTwilioWhatsAppText(
        { to: "+34612345678", body: "Hola" },
        {
          accountSid: "AC_test",
          authToken: "token",
          from: "+15551234567",
          mock: false,
          providerMode: "real",
        },
      ),
    ).resolves.toMatchObject({
      ok: false,
      mode: "real",
      ambiguous: true,
    });
    fetchMock.mockRestore();
  });

  it("aborts a stalled Twilio request before the webhook can hang indefinitely", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );

    const result = await sendTwilioWhatsAppText(
      { to: "+34612345678", body: "Hola" },
      {
        accountSid: "AC_test",
        authToken: "token",
        from: "+15551234567",
        mock: false,
        providerMode: "real",
        requestTimeoutMs: 5,
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: false,
      mode: "real",
      ambiguous: true,
      error: "Twilio request timed out.",
    });
    fetchMock.mockRestore();
  });
});
