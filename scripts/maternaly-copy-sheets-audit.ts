import {
  CopySheetsRealWriteService,
  readCopyWriteConfig,
  writeCopyAuditReports,
} from "../src/lib/maternaly/sheets/copy-real-write";

async function main() {
  const service = new CopySheetsRealWriteService();
  const config = readCopyWriteConfig();
  const audits = await service.auditCopies(config);
  const reports = await writeCopyAuditReports(audits);

  console.log(JSON.stringify({
    ok: audits.some((audit) => audit.access === "read"),
    copySheetsConfigured: config.copySheetIds.length,
    writeMode: config.writeMode,
    reports,
    access: audits.map((audit) => ({
      spreadsheetId: audit.spreadsheetIdRedacted,
      access: audit.access,
      selectedTab: audit.selectedTab,
      tabs: audit.tabs.map((tab) => tab.title),
      error: audit.error,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown copy audit error");
  process.exitCode = 1;
});
