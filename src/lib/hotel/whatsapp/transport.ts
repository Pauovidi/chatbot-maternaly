import type { WhatsappMessagePayload } from "@/lib/hotel/integrations/types";
import { buildBookingWhatsAppMessage } from "@/lib/hotel/whatsapp/templates";

export interface WhatsappSendResult {
  ok: boolean;
  mode: "mock" | "real";
  preview: string;
  deliveredTo?: string;
}

export interface WhatsappTransportOptions {
  useMockWhatsApp: boolean;
  webhookUrl?: string;
}

export async function sendWhatsAppBookingMessage(
  payload: WhatsappMessagePayload,
  options: WhatsappTransportOptions,
): Promise<WhatsappSendResult> {
  const preview = buildBookingWhatsAppMessage(payload);

  if (options.useMockWhatsApp || !options.webhookUrl) {
    return {
      ok: true,
      mode: "mock",
      preview,
      deliveredTo: payload.reservation.phoneE164,
    };
  }

  const response = await fetch(options.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone: payload.reservation.phoneE164,
      message: preview,
      reservationId: payload.reservation.id,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo enviar WhatsApp real: ${response.status} ${response.statusText}`,
    );
  }

  return {
    ok: true,
    mode: "real",
    preview,
    deliveredTo: payload.reservation.phoneE164,
  };
}
