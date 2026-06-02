import { NextResponse } from "next/server";
import { verifyMaternalyAdminTaskRequest } from "@/lib/maternaly/admin/task-auth";
import {
  CopySheetsRealWriteService,
  redactSheetId,
  type TestAdnReservationInput,
  type WriteResultReport,
} from "@/lib/maternaly/sheets/copy-real-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeWriteReport(report: WriteResultReport) {
  return {
    generatedAt: report.generatedAt,
    applied: report.applied,
    backup: report.backup,
    error: report.error,
    plan: {
      operation: report.plan.operation,
      targetSpreadsheetId: report.plan.targetSpreadsheetId
        ? redactSheetId(report.plan.targetSpreadsheetId)
        : report.plan.targetSpreadsheetIdRedacted,
      targetSpreadsheetTitle: report.plan.targetSpreadsheetTitle,
      targetTab: report.plan.targetTab,
      targetRow: report.plan.targetRow,
      targetRange: report.plan.targetRange,
      proposedDate: report.plan.proposedDate,
      proposedTime: report.plan.proposedTime,
      selectedLocation: report.plan.selectedLocation,
      service: report.plan.service,
      customerRedacted: report.plan.customerRedacted,
      paymentLinkConfigured: Boolean(report.plan.paymentLink),
      riskLevel: report.plan.riskLevel,
      manualReviewRequired: report.plan.manualReviewRequired,
      originalSheetProtected: report.plan.originalSheetProtected,
      copyOnly: report.plan.copyOnly,
      backupCreated: report.plan.backupCreated,
      allowedByPolicy: report.plan.allowedByPolicy,
      blockedReason: report.plan.blockedReason,
    },
  };
}

function normalizeLocation(value: unknown): "BILBAO" | "ERANDIO" {
  return String(value ?? "").trim().toUpperCase() === "ERANDIO" ? "ERANDIO" : "BILBAO";
}

async function readInput(request: Request): Promise<TestAdnReservationInput> {
  const body = await request.json().catch(() => ({}));
  return {
    spreadsheetId: typeof body.spreadsheetId === "string" ? body.spreadsheetId : undefined,
    tab: typeof body.tab === "string" ? body.tab : undefined,
    fullName: typeof body.fullName === "string" ? body.fullName : "Erika Ramirez",
    email: typeof body.email === "string" ? body.email : "erika@test.com",
    phone: typeof body.phone === "string" ? body.phone : "+34600000123",
    selectedLocation: normalizeLocation(body.selectedLocation ?? body.location),
  };
}

export async function POST(request: Request) {
  const auth = verifyMaternalyAdminTaskRequest(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const report = await new CopySheetsRealWriteService().writeTestAdnReservation(await readInput(request));
  return NextResponse.json({
    ok: report.applied,
    report: sanitizeWriteReport(report),
  }, { status: report.applied ? 200 : 409 });
}
