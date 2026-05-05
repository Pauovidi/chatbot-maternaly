import type { HotelRuntimeFlags, TransportMode } from "@/lib/hotel/integrations/types";

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

function parseTransportMode(value: string | undefined): TransportMode {
  if (value === "real" || value === "hybrid" || value === "mock") {
    return value;
  }

  return "mock";
}

export function readHotelRuntimeFlags(
  env: NodeJS.ProcessEnv = process.env,
): HotelRuntimeFlags {
  return {
    useMockEmailInput: parseBoolean(env.HOTEL_USE_MOCK_EMAIL_INPUT, true),
    useMockWhatsApp: parseBoolean(env.HOTEL_USE_MOCK_WHATSAPP, true),
    useRealGoogleSheets: parseBoolean(env.HOTEL_USE_REAL_GOOGLE_SHEETS, false),
    useRealReminders: parseBoolean(env.HOTEL_USE_REAL_REMINDERS, false),
    useMockPersistence: parseBoolean(env.HOTEL_USE_MOCK_PERSISTENCE, true),
  };
}

export function readTransportMode(
  env: NodeJS.ProcessEnv = process.env,
): TransportMode {
  return parseTransportMode(env.HOTEL_TRANSPORT_MODE);
}
