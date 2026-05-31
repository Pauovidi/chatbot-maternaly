import { describe, expect, it } from "vitest";
import { MockWhatsAppProvider, normalizePhone, YCloudProvider } from "./provider";

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
});
