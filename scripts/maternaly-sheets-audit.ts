import { readMaternalyRuntimeConfig } from "../src/lib/maternaly/config/env";
import { SheetAuditService, writeAuditReports } from "../src/lib/maternaly/sheets/audit";
import { redactSheetId } from "../src/lib/maternaly/sheets/normalized-template";

async function main() {
  const config = readMaternalyRuntimeConfig();
  const service = new SheetAuditService();
  const audits = await Promise.all(config.sheetIds.map((id) => service.auditSpreadsheet(id)));
  const reports = await writeAuditReports(audits);

  console.log(JSON.stringify({
    ok: audits.some((audit) => audit.access === "read" || audit.access === "public_read"),
    reports,
    sheetCount: audits.length,
    access: audits.map((audit) => ({
      spreadsheetId: redactSheetId(audit.spreadsheetId),
      access: audit.access,
      readMethod: audit.readMethod,
      tabs: audit.tabs.map((tab) => tab.title),
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown audit error");
  process.exitCode = 1;
});
