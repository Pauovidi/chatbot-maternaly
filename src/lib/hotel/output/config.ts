import type { TransportMode } from "@/lib/hotel/integrations/types";

export type WhatsAppOutputMode = "preview" | "manual" | "mock" | "real";

export interface WhatsAppOutputConfig {
  mode: WhatsAppOutputMode;
  useMockWhatsApp: boolean;
  webhookUrl?: string;
  allowManualFallback: boolean;
  tracePrefix: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseMode(value: string | undefined): WhatsAppOutputMode | undefined {
  if (value === "preview" || value === "manual" || value === "mock" || value === "real") {
    return value;
  }

  return undefined;
}

function parseTransportMode(value: string | undefined): TransportMode | undefined {
  if (value === "mock" || value === "real" || value === "hybrid") {
    return value;
  }

  return undefined;
}

export function readWhatsAppOutputConfig(
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppOutputConfig {
  const explicitMode =
    parseMode(env.HOTEL_WHATSAPP_OUTPUT_MODE) ??
    (parseTransportMode(env.HOTEL_TRANSPORT_MODE) === "real"
      ? "real"
      : undefined);

  return {
    mode: explicitMode ?? "preview",
    useMockWhatsApp: parseBoolean(env.HOTEL_USE_MOCK_WHATSAPP, true),
    webhookUrl: env.HOTEL_WHATSAPP_WEBHOOK_URL,
    allowManualFallback: parseBoolean(
      env.HOTEL_WHATSAPP_ALLOW_MANUAL_FALLBACK,
      true,
    ),
    tracePrefix: env.HOTEL_WHATSAPP_TRACE_PREFIX ?? "whatsapp",
  };
}
