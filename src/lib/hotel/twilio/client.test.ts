import { describe, expect, it, vi } from "vitest";
import { sendTwilioWhatsAppText } from "./client";

describe("twilio whatsapp client", () => {
  it("uses mock mode when credentials are not configured", async () => {
    const result = await sendTwilioWhatsAppText(
      { to: "+34612345678", body: "Hola" },
      { mock: true },
    );

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("mock");
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
      },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("real");
    fetchMock.mockRestore();
  });
});
