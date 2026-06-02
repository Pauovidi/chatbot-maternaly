import {
  CopySheetsRealWriteService,
  readCopyWriteConfig,
  writeCopyWriteResultReports,
} from "../src/lib/maternaly/sheets/copy-real-write";

async function main() {
  const config = readCopyWriteConfig();
  const service = new CopySheetsRealWriteService();
  const report = await service.writeTestAdnReservation({
    fullName: "Erika Ramírez",
    email: "erika@test.com",
    phone: "+34600000123",
    selectedLocation: "BILBAO",
  });
  const reports = await writeCopyWriteResultReports(report);

  console.log(JSON.stringify({
    ok: report.applied,
    applied: report.applied,
    writeMode: config.writeMode,
    copySheetsConfigured: config.copySheetIds.length,
    targetSpreadsheetId: report.plan.targetSpreadsheetIdRedacted,
    targetTab: report.plan.targetTab,
    targetRange: report.plan.targetRange,
    backupCreated: report.plan.backupCreated,
    error: report.error,
    reports,
  }, null, 2));

  if (!report.applied) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown copy write error");
  process.exitCode = 1;
});
