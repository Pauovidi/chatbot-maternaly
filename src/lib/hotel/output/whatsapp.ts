import { randomUUID } from "node:crypto";
import type { WhatsappMessagePayload } from "@/lib/hotel/integrations/types";
import { buildBookingWhatsAppMessage } from "@/lib/hotel/whatsapp/templates";
import {
  sendWhatsAppBookingMessage,
  type WhatsappSendResult,
} from "@/lib/hotel/whatsapp/transport";
import {
  readWhatsAppOutputConfig,
  type WhatsAppOutputConfig,
  type WhatsAppOutputMode,
} from "./config";

export interface WhatsAppOutputTrace {
  traceId: string;
  channel: "whatsapp";
  mode: WhatsAppOutputMode;
  createdAt: string;
  reservationId: string;
  petKey: string;
  transportMode: "mock" | "real" | "hybrid";
  webhookConfigured: boolean;
  manualFallback: boolean;
}

export interface WhatsAppPreviewResult {
  ok: true;
  kind: "preview";
  channel: "whatsapp";
  mode: "preview";
  preview: string;
  trace: WhatsAppOutputTrace;
}

export interface WhatsAppManualDispatchResult {
  ok: true;
  kind: "manual";
  channel: "whatsapp";
  mode: "manual";
  preview: string;
  copyableMessage: string;
  instructions: string;
  trace: WhatsAppOutputTrace;
}

export interface WhatsAppDeliveryResult {
  ok: true;
  kind: "delivery";
  channel: "whatsapp";
  mode: "mock" | "real";
  preview: string;
  deliveredTo?: string;
  providerMode: "mock" | "real";
  trace: WhatsAppOutputTrace;
}

export type WhatsAppOutputResult =
  | WhatsAppPreviewResult
  | WhatsAppManualDispatchResult
  | WhatsAppDeliveryResult;

function createTrace(
  payload: WhatsappMessagePayload,
  mode: WhatsAppOutputMode,
  transportMode: "mock" | "real" | "hybrid",
  config: WhatsAppOutputConfig,
): WhatsAppOutputTrace {
  return {
    traceId: `${config.tracePrefix}-${randomUUID()}`,
    channel: "whatsapp",
    mode,
    createdAt: new Date().toISOString(),
    reservationId: payload.reservation.id,
    petKey: payload.reservation.petKey,
    transportMode,
    webhookConfigured: Boolean(config.webhookUrl),
    manualFallback: config.allowManualFallback,
  };
}

export function buildWhatsAppPreview(
  payload: WhatsappMessagePayload,
  config: Partial<WhatsAppOutputConfig> = {},
): WhatsAppPreviewResult {
  const resolvedConfig = {
    ...readWhatsAppOutputConfig(),
    ...config,
  };
  const preview = buildBookingWhatsAppMessage(payload);
  const trace = createTrace(payload, "preview", "hybrid", resolvedConfig);
  return {
    ok: true,
    kind: "preview",
    channel: "whatsapp",
    mode: "preview",
    preview,
    trace,
  };
}

export function buildManualWhatsAppDispatch(
  payload: WhatsappMessagePayload,
  config: Partial<WhatsAppOutputConfig> = {},
): WhatsAppManualDispatchResult {
  const resolvedConfig = {
    ...readWhatsAppOutputConfig(),
    ...config,
  };
  const preview = buildBookingWhatsAppMessage(payload);
  const trace = createTrace(payload, "manual", "hybrid", resolvedConfig);

  return {
    ok: true,
    kind: "manual",
    channel: "whatsapp",
    mode: "manual",
    preview,
    copyableMessage: preview,
    instructions:
      "Copie el texto y envielo manualmente desde WhatsApp. La trazabilidad ya queda guardada en la demo.",
    trace,
  };
}

export async function sendWhatsAppOutput(
  payload: WhatsappMessagePayload,
  config: Partial<WhatsAppOutputConfig> = {},
): Promise<WhatsAppOutputResult> {
  const resolvedConfig = {
    ...readWhatsAppOutputConfig(),
    ...config,
  };

  if (resolvedConfig.mode === "preview") {
    return buildWhatsAppPreview(payload, resolvedConfig);
  }

  if (resolvedConfig.mode === "manual") {
    return buildManualWhatsAppDispatch(payload, resolvedConfig);
  }

  const preview = buildBookingWhatsAppMessage(payload);

  if (
    resolvedConfig.mode === "real" &&
    resolvedConfig.webhookUrl &&
    !resolvedConfig.useMockWhatsApp
  ) {
    const result: WhatsappSendResult = await sendWhatsAppBookingMessage(payload, {
      useMockWhatsApp: false,
      webhookUrl: resolvedConfig.webhookUrl,
    });

    return {
      ok: true,
      kind: "delivery",
      channel: "whatsapp",
      mode: result.mode,
      preview: result.preview,
      deliveredTo: result.deliveredTo,
      providerMode: result.mode,
      trace: createTrace(payload, "real", "real", resolvedConfig),
    };
  }

  if (resolvedConfig.allowManualFallback && resolvedConfig.mode === "real") {
    return buildManualWhatsAppDispatch(payload, resolvedConfig);
  }

  const result = await sendWhatsAppBookingMessage(payload, {
    useMockWhatsApp: true,
    webhookUrl: resolvedConfig.webhookUrl,
  });

  return {
    ok: true,
    kind: "delivery",
    channel: "whatsapp",
    mode: result.mode,
    preview,
    deliveredTo: result.deliveredTo,
    providerMode: result.mode,
    trace: createTrace(payload, "mock", "mock", resolvedConfig),
  };
}

export function createWhatsAppOutputFacade(
  config: Partial<WhatsAppOutputConfig> = {},
) {
  return {
    config: {
      ...readWhatsAppOutputConfig(),
      ...config,
    },
    preview(payload: WhatsappMessagePayload) {
      return buildWhatsAppPreview(payload, config);
    },
    manual(payload: WhatsappMessagePayload) {
      return buildManualWhatsAppDispatch(payload, config);
    },
    send(payload: WhatsappMessagePayload) {
      return sendWhatsAppOutput(payload, config);
    },
  };
}
