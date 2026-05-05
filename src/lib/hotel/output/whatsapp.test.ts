import { describe, expect, it, vi } from "vitest";
import type { WhatsappMessagePayload } from "@/lib/hotel/integrations/types";
import {
  buildManualWhatsAppDispatch,
  buildWhatsAppPreview,
  createWhatsAppOutputFacade,
  sendWhatsAppOutput,
} from "./whatsapp";

const payload: WhatsappMessagePayload = {
  reservation: {
    id: "res-123",
    petKey: "pet-luna-123",
    petName: "Luna",
    ownerName: "Ana López",
    phoneE164: "+34612345678",
    entryDate: "2026-04-12",
    entrySlot: "morning",
    exitDate: "2026-04-15",
    exitSlot: "afternoon",
    dogs: 1,
    status: "available",
    source: "email",
    createdAt: "2026-03-25T10:00:00.000Z",
    updatedAt: "2026-03-25T10:00:00.000Z",
  },
  availability: {
    available: true,
    conflicts: [],
    remainingByDate: {},
    monthKey: "2026-04",
    sheetName: "2026-04",
  },
  price: 78,
  reviewReasons: [],
  formUrl: "https://somosmuyperros.com/hotel-canino/",
};

describe("whatsapp output facade", () => {
  it("builds a preview with traceability", () => {
    const result = buildWhatsAppPreview(payload, {
      mode: "preview",
      useMockWhatsApp: true,
      allowManualFallback: true,
      tracePrefix: "demo",
    });

    expect(result.kind).toBe("preview");
    expect(result.preview).toContain("Luna");
    expect(result.trace.traceId).toContain("demo");
    expect(result.trace.reservationId).toBe("res-123");
  });

  it("builds a manual dispatch with copyable text", () => {
    const result = buildManualWhatsAppDispatch(payload, {
      mode: "manual",
      useMockWhatsApp: true,
      allowManualFallback: true,
    });

    expect(result.kind).toBe("manual");
    expect(result.copyableMessage).toContain("formulario");
    expect(result.instructions).toContain("Copie el texto");
  });

  it("falls back to manual dispatch when real mode has no webhook", async () => {
    const result = await sendWhatsAppOutput(payload, {
      mode: "real",
      useMockWhatsApp: false,
      allowManualFallback: true,
    });

    expect(result.kind).toBe("manual");
    expect(result.mode).toBe("manual");
  });

  it("uses the real transport when webhook and real mode are available", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    const result = await sendWhatsAppOutput(payload, {
      mode: "real",
      useMockWhatsApp: false,
      webhookUrl: "https://example.com/webhook",
      allowManualFallback: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("delivery");
    expect(result.mode).toBe("real");

    fetchMock.mockRestore();
  });

  it("exposes a facade with preview/manual/send methods", () => {
    const facade = createWhatsAppOutputFacade({ mode: "manual" });

    expect(facade.config.mode).toBe("manual");
    expect(facade.preview(payload).kind).toBe("preview");
    expect(facade.manual(payload).kind).toBe("manual");
  });
});
