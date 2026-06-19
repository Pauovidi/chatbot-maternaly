import fs from "node:fs/promises";
import path from "node:path";
import { readMaternalyRuntimeConfig } from "../src/lib/maternaly/config/env";
import { readNormalizedServiceSheet } from "../src/lib/maternaly/sheets/normalized-client";
import {
  NORMALIZED_REQUIRED_TABS,
  hasColumn,
  redactSheetId,
  type MaternalyNormalizedServiceKey,
  type NormalizedColumnKey,
} from "../src/lib/maternaly/sheets/normalized-template";

const LEGACY_ORIGINAL_SHEET_IDS = new Set([
  "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI",
  "1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do",
]);

const REQUIRED_COLUMNS: Partial<Record<(typeof NORMALIZED_REQUIRED_TABS)[number], NormalizedColumnKey[]>> = {
  Servicio_Config: ["serviceId", "serviceName"],
  Clientes_Local: ["fullName", "phone"],
  Grupos_Ediciones: ["groupId", "groupName", "capacityTotal", "status"],
  Sesiones: ["sessionId", "groupId", "date", "startTime", "status"],
  Inscripciones: ["fullName", "phone", "serviceId", "sessionId", "status", "idempotencyKey"],
  Interacciones_Chatbot: ["idempotencyKey"],
};

function isKnownService(value: string): value is MaternalyNormalizedServiceKey {
  return value === "charla_embarazo_1_20" || value === "taller_blw";
}

async function writeReports(payload: unknown) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const reportsDir = path.join(process.cwd(), "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, `maternaly_normalized_sheets_audit_${timestamp}.json`);
  const markdownPath = path.join(reportsDir, `maternaly_normalized_sheets_audit_${timestamp}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(
    markdownPath,
    [
      "# Maternaly normalized Sheets audit",
      "",
      `Generated at: ${(payload as { generatedAt?: string }).generatedAt ?? new Date().toISOString()}`,
      "",
      "IDs are redacted. This audit performs reads only.",
      "",
      "```json",
      JSON.stringify(payload, null, 2),
      "```",
      "",
    ].join("\n"),
    "utf8",
  );

  return { jsonPath, markdownPath };
}

async function auditService(serviceKey: MaternalyNormalizedServiceKey) {
  const config = readMaternalyRuntimeConfig();
  const sheetId = config.normalizedSheets.serviceSheetIds[serviceKey];
  if (!sheetId) {
    return {
      serviceKey,
      ok: false,
      access: "missing_sheet_id",
      sheetId: null,
      tabs: [],
      errors: [`missing_sheet_id:${serviceKey}`],
    };
  }

  if (LEGACY_ORIGINAL_SHEET_IDS.has(sheetId)) {
    return {
      serviceKey,
      ok: false,
      access: "blocked_legacy_original",
      sheetId: redactSheetId(sheetId),
      tabs: [],
      errors: ["protected_legacy_original_sheet_id"],
    };
  }

  try {
    const snapshot = await readNormalizedServiceSheet(serviceKey);
    const tabs = NORMALIZED_REQUIRED_TABS.map((tab) => {
      const parsed = snapshot.tabs[tab];
      const missingColumns = (REQUIRED_COLUMNS[tab] ?? []).filter(
        (column) => !hasColumn(parsed.headers, column),
      );
      return {
        tab,
        present: true,
        rowCount: parsed.rows.length,
        headers: parsed.headers,
        missingColumns,
        ok: missingColumns.length === 0,
      };
    });
    const errors = tabs.flatMap((tab) =>
      tab.missingColumns.map((column) => `missing_column:${tab.tab}:${column}`),
    );

    return {
      serviceKey,
      ok: errors.length === 0,
      access: "read",
      sheetId: redactSheetId(snapshot.sheetId),
      tabs,
      errors,
    };
  } catch (error) {
    return {
      serviceKey,
      ok: false,
      access: "error",
      sheetId: redactSheetId(sheetId),
      tabs: [],
      errors: [error instanceof Error ? error.message : "unknown_read_error"],
    };
  }
}

async function main() {
  const config = readMaternalyRuntimeConfig();
  const services = config.normalizedSheets.serviceIds.filter(isKnownService);
  const serviceKeys = services.length ? services : (["charla_embarazo_1_20", "taller_blw"] as const);
  const audits = await Promise.all(serviceKeys.map(auditService));
  const payload = {
    generatedAt: new Date().toISOString(),
    ok: audits.every((audit) => audit.ok),
    normalizedSheetsEnabled: config.normalizedSheets.enabled,
    configuredServices: config.normalizedSheets.serviceIds,
    missingSheetIds: config.normalizedSheets.missingSheetIds,
    accessMode: config.sheetsAccessMode,
    writeEnabled: config.liveSheetsWriteEnabled,
    protectedLegacyOriginalsBlocked: true,
    audits,
  };
  const reports = await writeReports(payload);

  console.log(JSON.stringify({ ...payload, reports }, null, 2));
  if (!payload.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "normalized sheets audit failed");
  process.exitCode = 1;
});
