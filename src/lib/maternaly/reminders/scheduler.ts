import crypto from "node:crypto";
import {
  MATERNALY_CHARLA_REMINDER_LEAD_HOURS,
  MATERNALY_CHARLA_REMINDER_TIME_ZONE,
  type MaternalyReminderRecord,
  type MaternalyReminderRepository,
  type MaternalyReminderScheduleResult,
  type ScheduleMaternalyCharlaReminderInput,
} from "./types";

const HOUR_MS = 60 * 60 * 1_000;
const EXPLICIT_ISO_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;
const E164_PHONE = /^\+[1-9]\d{7,14}$/;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function parseSessionStartsAt(value: string): Date {
  const normalized = required(value, "sessionStartsAt");
  if (!EXPLICIT_ISO_OFFSET.test(normalized)) {
    throw new Error("sessionStartsAt must include an explicit UTC offset or Z.");
  }
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("sessionStartsAt must be a valid ISO-8601 timestamp.");
  }
  return date;
}

function buildIdentity(input: {
  registrationId: string;
  sessionId: string;
  sessionStartsAt: string;
}) {
  const canonical = [
    "maternaly",
    "charla_embarazo_1_20",
    "reminder_48h",
    input.registrationId,
    input.sessionId,
    input.sessionStartsAt,
  ].join("|");
  const digest = crypto.createHash("sha256").update(canonical).digest("hex");
  return {
    reminderId: `MAT_REM_48H_${digest.slice(0, 24)}`,
    idempotencyKey: `maternaly:charla:reminder-48h:${digest}`,
  };
}

export function buildMaternalyCharlaReminder(
  input: ScheduleMaternalyCharlaReminderInput,
): MaternalyReminderRecord {
  const now = input.now ?? new Date();
  const registrationId = required(input.registrationId, "registrationId");
  const sessionId = required(input.sessionId, "sessionId");
  const phoneE164 = required(input.phoneE164, "phoneE164");
  const location = required(input.location, "location");
  if (!E164_PHONE.test(phoneE164)) {
    throw new Error("phoneE164 must be a valid E.164 number.");
  }

  const startsAt = parseSessionStartsAt(input.sessionStartsAt);
  if (startsAt.getTime() <= now.getTime()) {
    throw new Error("Cannot schedule a reminder for a session that has already started.");
  }

  const intendedDueAt = new Date(
    startsAt.getTime() - MATERNALY_CHARLA_REMINDER_LEAD_HOURS * HOUR_MS,
  );
  const scheduledFor = intendedDueAt.getTime() > now.getTime() ? intendedDueAt : now;
  const canonicalStartsAt = startsAt.toISOString();
  const identity = buildIdentity({ registrationId, sessionId, sessionStartsAt: canonicalStartsAt });
  const timestamp = now.toISOString();

  return {
    ...identity,
    registrationId,
    conversationId: input.conversationId?.trim() || undefined,
    serviceKey: "charla_embarazo_1_20",
    sessionId,
    sessionStartsAt: canonicalStartsAt,
    scheduledFor: scheduledFor.toISOString(),
    nextAttemptAt: scheduledFor.toISOString(),
    leadHours: MATERNALY_CHARLA_REMINDER_LEAD_HOURS,
    timeZone: MATERNALY_CHARLA_REMINDER_TIME_ZONE,
    phoneE164,
    modality: input.modality,
    location,
    address: input.address?.trim() || undefined,
    onlineAccess: input.onlineAccess
      ? {
          joinUrl: input.onlineAccess.joinUrl.trim(),
          meetingId: input.onlineAccess.meetingId.trim(),
          passcode: input.onlineAccess.passcode.trim(),
        }
      : undefined,
    status: "scheduled",
    attempts: 0,
    maxAttempts: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function scheduleMaternalyCharlaReminder(
  input: ScheduleMaternalyCharlaReminderInput,
  repository: MaternalyReminderRepository,
): Promise<MaternalyReminderScheduleResult> {
  return repository.schedule(buildMaternalyCharlaReminder(input));
}
