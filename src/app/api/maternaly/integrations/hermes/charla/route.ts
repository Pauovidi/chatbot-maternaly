import { NextResponse } from "next/server";
import type { MaternalyNormalizedFlowState } from "@/lib/hotel/conversations/types";
import { verifyMaternalyIntegrationRequest } from "@/lib/maternaly/admin/task-auth";
import { MaternalyToolExecutor } from "@/lib/maternaly/conversation/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE_KEY = "charla_embarazo_1_20" as const;

interface HermesCharlaReservationInput {
  action: "reserve";
  confirmed: true;
  source: "hermes";
  sessionId: string;
  fullName: string;
  phone: string;
  email?: string;
  peopleCount: 1 | 2;
  partnerName?: string;
  fppOrDueDate: string;
  pregnancyWeek?: number;
  pregnancyMonth?: number;
  notes?: string;
}

interface InvalidInput {
  ok: false;
  status: 400;
  error: string;
}

function asTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result && result.length <= maxLength ? result : undefined;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseInput(body: unknown): HermesCharlaReservationInput | InvalidInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "The request body must be a JSON object." };
  }

  const value = body as Record<string, unknown>;
  if (value.action !== "reserve" || value.source !== "hermes" || value.confirmed !== true) {
    return {
      ok: false,
      status: 400,
      error: "A confirmed Hermes reservation action is required.",
    };
  }

  const sessionId = asTrimmedString(value.sessionId, 160);
  const fullName = asTrimmedString(value.fullName, 160);
  const phone = asTrimmedString(value.phone, 60);
  const fppOrDueDate = asTrimmedString(value.fppOrDueDate, 10);
  const email = asTrimmedString(value.email, 240);
  const partnerName = asTrimmedString(value.partnerName, 160);
  const notes = asTrimmedString(value.notes, 500);
  const peopleCount = value.peopleCount;

  if (!sessionId) return { ok: false, status: 400, error: "sessionId is required." };
  if (!fullName || fullName.split(/\s+/).length < 2) {
    return { ok: false, status: 400, error: "fullName must contain first name and surname." };
  }
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return { ok: false, status: 400, error: "A valid phone number is required." };
  }
  if (!fppOrDueDate || !isIsoDate(fppOrDueDate)) {
    return { ok: false, status: 400, error: "fppOrDueDate must use YYYY-MM-DD." };
  }
  if (peopleCount !== 1 && peopleCount !== 2) {
    return { ok: false, status: 400, error: "peopleCount must be 1 or 2." };
  }
  if (peopleCount === 2 && !partnerName) {
    return { ok: false, status: 400, error: "partnerName is required when peopleCount is 2." };
  }

  const pregnancyWeek = value.pregnancyWeek;
  if (pregnancyWeek !== undefined &&
      (!Number.isInteger(pregnancyWeek) || Number(pregnancyWeek) < 1 || Number(pregnancyWeek) > 42)) {
    return { ok: false, status: 400, error: "pregnancyWeek must be an integer between 1 and 42." };
  }
  const pregnancyMonth = value.pregnancyMonth;
  if (pregnancyMonth !== undefined &&
      (!Number.isInteger(pregnancyMonth) || Number(pregnancyMonth) < 1 || Number(pregnancyMonth) > 10)) {
    return { ok: false, status: 400, error: "pregnancyMonth must be an integer between 1 and 10." };
  }

  return {
    action: "reserve",
    confirmed: true,
    source: "hermes",
    sessionId,
    fullName,
    phone,
    email,
    peopleCount,
    partnerName,
    fppOrDueDate,
    pregnancyWeek: pregnancyWeek as number | undefined,
    pregnancyMonth: pregnancyMonth as number | undefined,
    notes,
  };
}

function isInvalidInput(
  input: HermesCharlaReservationInput | InvalidInput,
): input is InvalidInput {
  return "ok" in input && input.ok === false;
}

function safeSession(session: {
  sessionId: string;
  groupId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  modality?: string;
  availableSeats?: number;
}) {
  return {
    sessionId: session.sessionId,
    groupId: session.groupId,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    location: session.location,
    modality: session.modality,
    availableSeats: session.availableSeats,
  };
}

function statusForResult(result: Awaited<ReturnType<MaternalyToolExecutor["runNormalizedRegistration"]>>) {
  if (result.status === "not_configured" || result.status === "read_error") return 503;
  if (
    result.status === "write_result" &&
    result.writeResult?.ok &&
    result.writeResult.mode === "live" &&
    result.writeResult.registrationPersisted
  ) return 200;
  return 409;
}

export async function POST(request: Request) {
  const auth = verifyMaternalyIntegrationRequest(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const body = await request.json().catch(() => undefined);
  const input = parseInput(body);
  if (isInvalidInput(input)) return NextResponse.json(input, { status: input.status });

  const state: MaternalyNormalizedFlowState = {
    serviceKey: SERVICE_KEY,
    journeyStage: "embarazo",
    stage: "collecting_contact",
    selectedSessionId: input.sessionId,
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    peopleCount: input.peopleCount,
    partnerName: input.partnerName,
    fppOrDueDate: input.fppOrDueDate,
    pregnancyWeek: input.pregnancyWeek,
    pregnancyMonth: input.pregnancyMonth,
    observations: input.notes,
    updatedAt: new Date().toISOString(),
  };

  const result = await new MaternalyToolExecutor().runNormalizedRegistration({
    serviceKey: SERVICE_KEY,
    state,
    message: `Reserva confirmada por Hermes para la sesión ${input.sessionId}.`,
  });

  const persisted = Boolean(
    result.status === "write_result" &&
    result.writeResult?.ok &&
    result.writeResult.mode === "live" &&
    result.writeResult.registrationPersisted,
  );
  const alreadyPersisted = Boolean(result.writeResult?.plan.alreadyPersisted);
  const outcome = persisted
    ? alreadyPersisted ? "already_persisted" : "confirmed"
    : result.status === "write_result" && result.writeResult?.mode === "dry_run"
      ? "dry_run_not_persisted"
      : result.status;
  const status = statusForResult(result);

  return NextResponse.json({
    ok: persisted,
    outcome,
    serviceKey: SERVICE_KEY,
    registrationId: persisted ? result.writeResult?.registrationId : undefined,
    session: result.selectedSession ? safeSession(result.selectedSession) : undefined,
    missingFields: result.missingFields,
    error: result.error,
  }, { status });
}
