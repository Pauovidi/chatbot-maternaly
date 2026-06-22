import { readMaternalyRuntimeConfig } from "../src/lib/maternaly/config/env";
import {
  GoogleNormalizedSheetsClient,
  readNormalizedServiceSheet,
} from "../src/lib/maternaly/sheets/normalized-client";
import { listAvailableSessionsFromSnapshot } from "../src/lib/maternaly/sheets/normalized-availability";
import {
  applyRegistrationWritePlan,
  buildRegistrationWritePlan,
  type NormalizedRegistrationDraft,
} from "../src/lib/maternaly/sheets/normalized-write";
import {
  redactSheetId,
  type MaternalyNormalizedServiceKey,
} from "../src/lib/maternaly/sheets/normalized-template";

const LEGACY_ORIGINAL_SHEET_IDS = new Set([
  "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI",
  "1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do",
]);

const SYNTHETIC_DRAFTS: Record<MaternalyNormalizedServiceKey, NormalizedRegistrationDraft> = {
  taller_blw: {
    serviceKey: "taller_blw",
    fullName: "PRUEBA BOT BLW",
    phone: "+34999000111",
    email: "prueba.bot.blw@example.test",
    peopleCount: 1,
    notes: "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL | Fecha nacimiento bebé: 2025-01-15",
  },
  charla_embarazo_1_20: {
    serviceKey: "charla_embarazo_1_20",
    fullName: "PRUEBA BOT CHARLA",
    phone: "+34999000112",
    email: "prueba.bot.charla@example.test",
    peopleCount: 2,
    notes: "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL | Pareja/acompañante: Acompañante Prueba | FPP: 2026-11-30",
  },
};

function assertLiveWriteAllowed() {
  if (process.env.MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE !== "true") {
    return "MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=true is required.";
  }

  const config = readMaternalyRuntimeConfig();
  if (!config.normalizedSheets.liveReady) {
    return "Normalized Sheets live flags are not ready.";
  }

  for (const sheetId of config.normalizedSheets.sheetIds) {
    if (LEGACY_ORIGINAL_SHEET_IDS.has(sheetId)) {
      return `Refusing live write to protected legacy Sheet ${redactSheetId(sheetId)}.`;
    }
  }

  return null;
}

async function writeSynthetic(serviceKey: MaternalyNormalizedServiceKey) {
  const client = new GoogleNormalizedSheetsClient();
  const snapshot = await readNormalizedServiceSheet(serviceKey, client, process.env);
  if (LEGACY_ORIGINAL_SHEET_IDS.has(snapshot.sheetId)) {
    throw new Error(`Refusing live write to protected legacy Sheet ${redactSheetId(snapshot.sheetId)}.`);
  }

  const session = listAvailableSessionsFromSnapshot(snapshot).find((item) => !item.full);
  if (!session) {
    throw new Error(`No available normalized session found for ${serviceKey}.`);
  }

  const plan = buildRegistrationWritePlan({
    snapshot,
    session,
    draft: SYNTHETIC_DRAFTS[serviceKey],
    env: process.env,
  });
  if (!plan.allowedLive || plan.blocked) {
    throw new Error(`Live write blocked for ${serviceKey}: ${plan.blockedReasons.join(" | ") || "not_allowed"}`);
  }

  const result = await applyRegistrationWritePlan({ snapshot, client, plan });
  if (!result.ok || !result.applied) {
    throw new Error(`Live write did not apply for ${serviceKey}: ${result.blockedReason ?? "unknown"}`);
  }

  return {
    serviceKey,
    sheetId: redactSheetId(snapshot.sheetId),
    idempotencyKey: plan.idempotencyKey,
    tabs: plan.operations
      .filter((operation) => operation.operation === "append")
      .map((operation) => operation.tab),
    updatedRanges: result.updatedRanges,
    formattedRanges: result.formattedRanges,
    formatApplied: result.formatApplied,
    formatWarnings: result.formatWarnings,
  };
}

async function main() {
  const blockedReason = assertLiveWriteAllowed();
  if (blockedReason) {
    console.log(JSON.stringify({
      ok: false,
      skipped: true,
      liveWriteAttempted: false,
      reason: blockedReason,
    }, null, 2));
    return;
  }

  const results = [];
  for (const serviceKey of ["taller_blw", "charla_embarazo_1_20"] as const) {
    results.push(await writeSynthetic(serviceKey));
  }

  console.log(JSON.stringify({
    ok: true,
    marker: "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL",
    liveWriteAttempted: true,
    services: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "normalized live write test failed");
  process.exitCode = 1;
});
