import packageJson from "../../../../package.json";
import { NextResponse } from "next/server";
import { readTwilioWhatsAppConfig } from "@/lib/hotel/twilio/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readPersistenceHealth() {
  const provider =
    process.env.HOTEL_PERSISTENCE_PROVIDER?.trim() ||
    (process.env.DATABASE_URL?.trim() ? "postgres" : process.env.NODE_ENV === "production" ? "file-volume" : "file-local");

  return {
    provider,
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    durableFileBaseDir:
      provider === "file-volume"
        ? process.env.HOTEL_FILE_STORE_DIR?.trim() || process.env.HOTEL_STORE_DIR?.trim() || "/data"
        : undefined,
  };
}

export async function GET() {
  const twilio = readTwilioWhatsAppConfig();
  const persistence = readPersistenceHealth();

  return NextResponse.json({
    ok: true,
    app: "hotel-canino-demo",
    version: packageJson.version,
    commit:
      process.env.GIT_COMMIT ??
      process.env.EASYPANEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      null,
    uptime: Math.round(process.uptime()),
    whatsapp: {
      provider: "twilio",
      mode: twilio.providerMode,
      mock: twilio.mock,
      statusCallbackConfigured: Boolean(twilio.statusCallbackUrl),
    },
    persistence: {
      provider: persistence.provider,
      databaseUrlConfigured: persistence.databaseUrlConfigured,
      durableFileBaseDir: persistence.durableFileBaseDir,
    },
  });
}
