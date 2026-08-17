import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";
import {
  resolveCharlaOption,
} from "@/lib/maternaly/knowledge/charla-informativa-contract";
import type { ScheduleMaternalyCharlaReminderInput } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^(\d{1,2}):(\d{2})$/;

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

/** Converts a local Europe/Madrid session time into an absolute UTC instant. */
export function madridSessionStartsAt(date: string, startTime: string): string {
  const dateMatch = ISO_DATE.exec(date.trim());
  const timeMatch = CLOCK_TIME.exec(startTime.trim());
  if (!dateMatch || !timeMatch) {
    throw new Error("A normalized session date and start time are required for the reminder.");
  }

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  if (target.hour > 23 || target.minute > 59) {
    throw new Error("The normalized session start time is invalid.");
  }

  const localAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  let instant = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(instant), "Europe/Madrid");
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    instant = localAsUtc - (representedAsUtc - instant);
  }

  const result = new Date(instant);
  const verification = zonedParts(result, "Europe/Madrid");
  if (
    verification.year !== target.year ||
    verification.month !== target.month ||
    verification.day !== target.day ||
    verification.hour !== target.hour ||
    verification.minute !== target.minute
  ) {
    throw new Error("The session time does not exist in Europe/Madrid.");
  }
  return result.toISOString();
}

function meetingIdFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return (
      url.pathname.match(/\/(?:j|wc)\/(\d{3,20})(?:\/|$)/)?.[1] ??
      (url.searchParams.get("confno")?.replace(/\D/g, "") || undefined)
    );
  } catch {
    return undefined;
  }
}

export function buildConfirmedCharlaReminderInput(input: {
  registrationId: string;
  session: NormalizedAvailableSession;
  phoneE164: string;
  conversationId?: string;
  now?: Date;
}): ScheduleMaternalyCharlaReminderInput {
  const option = resolveCharlaOption(input.session);
  const modality = input.session.modality ?? option?.modality;
  const location = input.session.location ?? option?.location;
  if (!input.session.date || !input.session.startTime || !modality || !location) {
    throw new Error("The confirmed Charla session is missing date, time, modality or location.");
  }

  const joinUrl = input.session.onlineJoinUrl?.trim();
  const passcode = input.session.onlineAccessCode?.trim();
  const meetingId =
    input.session.onlineMeetingId?.replace(/\s+/g, "") || meetingIdFromUrl(joinUrl);
  const address = option && "address" in option ? option.address : undefined;

  return {
    registrationId: input.registrationId,
    sessionId: input.session.sessionId,
    sessionStartsAt: madridSessionStartsAt(input.session.date, input.session.startTime),
    phoneE164: input.phoneE164,
    modality,
    location,
    address: modality === "presencial" ? address : undefined,
    onlineAccess:
      modality === "online" && joinUrl && meetingId && passcode
        ? { joinUrl, meetingId, passcode }
        : undefined,
    conversationId: input.conversationId,
    now: input.now,
  };
}
