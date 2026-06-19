import { readMaternalyRuntimeConfig } from "../src/lib/maternaly/config/env";
import {
  GoogleNormalizedSheetsClient,
  readNormalizedServiceSheet,
  type NormalizedSheetsClient,
  type NormalizedServiceSheetSnapshot,
} from "../src/lib/maternaly/sheets/normalized-client";
import { listAvailableSessionsFromSnapshot } from "../src/lib/maternaly/sheets/normalized-availability";
import {
  applyRegistrationWritePlan,
  buildRegistrationWritePlan,
  type NormalizedRegistrationDraft,
} from "../src/lib/maternaly/sheets/normalized-write";
import {
  InMemoryNormalizedSheetsClient,
  createNormalizedWorkbook,
  normalizedTestEnv,
} from "../src/lib/maternaly/sheets/normalized-test-utils";
import {
  redactSheetId,
  type MaternalyNormalizedServiceKey,
} from "../src/lib/maternaly/sheets/normalized-template";
import { redactCell } from "../src/lib/maternaly/sheets/redaction";

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

function hasGoogleCredentials() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      process.env.MATERNALY_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim(),
  );
}

function assertAllowedSheet(sheetId: string) {
  if (LEGACY_ORIGINAL_SHEET_IDS.has(sheetId)) {
    throw new Error(`Refusing normalized dry-run against protected legacy Sheet ${redactSheetId(sheetId)}.`);
  }
}

async function readSnapshot(input: {
  serviceKey: MaternalyNormalizedServiceKey;
  client: NormalizedSheetsClient;
  env: NodeJS.ProcessEnv;
}): Promise<NormalizedServiceSheetSnapshot> {
  const snapshot = await readNormalizedServiceSheet(input.serviceKey, input.client, input.env);
  assertAllowedSheet(snapshot.sheetId);
  return snapshot;
}

function redactPlanValues(values: Record<string, string | number | undefined>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, redactCell(value)]),
  );
}

async function dryRunService(serviceKey: MaternalyNormalizedServiceKey) {
  const config = readMaternalyRuntimeConfig();
  const useRealRead =
    config.normalizedSheets.enabled &&
    Boolean(config.normalizedSheets.serviceSheetIds[serviceKey]) &&
    hasGoogleCredentials();
  const client = useRealRead
    ? new GoogleNormalizedSheetsClient()
    : new InMemoryNormalizedSheetsClient(createNormalizedWorkbook({ serviceKey }));
  const env = useRealRead
    ? {
        ...process.env,
        GOOGLE_SHEETS_ACCESS_MODE: "dry_run",
        BOT_SHEETS_LIVE_WRITE_ENABLED: "false",
        MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "dry_run",
      }
    : normalizedTestEnv({ MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "dry_run" });
  const snapshot = await readSnapshot({ serviceKey, client, env });
  const session = listAvailableSessionsFromSnapshot(snapshot).find((item) => !item.full);
  if (!session) {
    throw new Error(`No available normalized session found for ${serviceKey}.`);
  }

  const plan = buildRegistrationWritePlan({
    snapshot,
    session,
    draft: SYNTHETIC_DRAFTS[serviceKey],
    env,
  });
  const result = await applyRegistrationWritePlan({ snapshot, client, plan });

  return {
    serviceKey,
    source: useRealRead ? "configured_normalized_sheet" : "fixture_no_credentials_or_config",
    sheetId: redactSheetId(snapshot.sheetId),
    session: {
      sessionId: session.sessionId,
      groupId: session.groupId,
      date: session.date,
      startTime: session.startTime,
      availableSeats: session.availableSeats,
      availabilityStatus: session.availabilityStatus,
    },
    ok: result.ok && !plan.blocked && !result.applied,
    mode: result.mode,
    applied: result.applied,
    idempotencyKey: plan.idempotencyKey,
    blocked: plan.blocked,
    blockedReasons: plan.blockedReasons,
    operations: plan.operations.map((operation) => ({
      tab: operation.tab,
      operation: operation.operation,
      values: redactPlanValues(operation.values),
    })),
    updatedRanges: result.updatedRanges,
  };
}

async function main() {
  const services: MaternalyNormalizedServiceKey[] = ["taller_blw", "charla_embarazo_1_20"];
  const results = await Promise.all(services.map(dryRunService));

  console.log(JSON.stringify({
    ok: results.every((result) => result.ok),
    marker: "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL",
    liveWriteAttempted: false,
    services: results,
  }, null, 2));

  if (!results.every((result) => result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "normalized dry-run write failed");
  process.exitCode = 1;
});
