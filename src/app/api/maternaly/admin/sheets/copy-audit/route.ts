import { NextResponse } from "next/server";
import { verifyMaternalyAdminTaskRequest } from "@/lib/maternaly/admin/task-auth";
import { CopySheetsRealWriteService, type CopySpreadsheetAudit } from "@/lib/maternaly/sheets/copy-real-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarizeAudit(audit: CopySpreadsheetAudit) {
  return {
    spreadsheetId: audit.spreadsheetIdRedacted,
    title: audit.title,
    access: audit.access,
    selectedTab: audit.selectedTab,
    error: audit.error,
    tabs: audit.tabs.map((tab) => ({
      title: tab.title,
      gid: tab.gid,
      headerRowNumber: tab.headerRowNumber,
      lastNonEmptyRowNumber: tab.lastNonEmptyRowNumber,
      lastValidRow: tab.lastValidRow,
      columnCandidates: tab.columnCandidates,
      formulaLikeColumns: tab.formulaLikeColumns,
      doNotTouchColumns: tab.doNotTouchColumns,
      risks: tab.risks,
      score: tab.score,
    })),
  };
}

async function handle(request: Request) {
  const auth = verifyMaternalyAdminTaskRequest(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const audits = await new CopySheetsRealWriteService().auditCopies();
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    audits: audits.map(summarizeAudit),
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
