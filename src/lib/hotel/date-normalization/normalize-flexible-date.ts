import { DEFAULT_SLOT_WINDOWS } from "./slot-windows";
import type {
  DateNormalizationFlag,
  DateNormalizationOptions,
  DateNormalizationResult,
  ReservationSlot,
  SlotWindow,
} from "./types";

const MONTHS: Record<string, number> = {
  enero: 1,
  ene: 1,
  january: 1,
  jan: 1,
  febrero: 2,
  feb: 2,
  march: 3,
  mar: 3,
  marzo: 3,
  april: 4,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  june: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  august: 8,
  ago: 8,
  agosto: 8,
  september: 9,
  sep: 9,
  sept: 9,
  septiembre: 9,
  october: 10,
  oct: 10,
  octubre: 10,
  november: 11,
  nov: 11,
  noviembre: 11,
  december: 12,
  dic: 12,
  diciembre: 12,
};

const SLOT_WORDS: Array<{ slot: ReservationSlot; patterns: RegExp[] }> = [
  {
    slot: "morning",
    patterns: [
      /\bmañana\b/i,
      /\bmanana\b/i,
      /\bmorning\b/i,
      /\bam\b/i,
      /\bprimer[a-z]* turno\b/i,
      /\bturno de mañana\b/i,
    ],
  },
  {
    slot: "afternoon",
    patterns: [
      /\btarde\b/i,
      /\bafternoon\b/i,
      /\bpm\b/i,
      /\bsegund[a-z]* turno\b/i,
      /\bturno de tarde\b/i,
    ],
  },
];

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatTime(hour: number, minute: number) {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function cloneReferenceDate(referenceDate?: Date) {
  return referenceDate ? new Date(referenceDate.getTime()) : new Date();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toIsoDateFromDate(date: Date) {
  return formatIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function extractExplicitTime(text: string) {
  const patterns = [
    /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/,
    /\b([01]?\d|2[0-3])\s*h\b/i,
    /\ba las\s+([01]?\d|2[0-3])(?::([0-5]\d))?\b/i,
    /\b([01]?\d|2[0-3])\s*(?:h|hrs?|horas?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2] ?? "0");
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return formatTime(hour, minute);
    }
  }

  return null;
}

function parseRelativeDate(text: string, referenceDate: Date) {
  const folded = stripAccents(text.toLowerCase());
  if (/\bpasado manana\b/.test(folded)) {
    return toIsoDateFromDate(addDays(referenceDate, 2));
  }
  if (/\bmanana\b|\btomorrow\b/.test(folded)) {
    return toIsoDateFromDate(addDays(referenceDate, 1));
  }
  if (/\bhoy\b|\btoday\b/.test(folded)) {
    return toIsoDateFromDate(referenceDate);
  }
  if (/\bayer\b|\byesterday\b/.test(folded)) {
    return toIsoDateFromDate(addDays(referenceDate, -1));
  }
  return null;
}

function parseSpanishMonthDate(text: string) {
  const folded = stripAccents(text.toLowerCase());
  const match = folded.match(
    /\b(\d{1,2})\s*(?:de\s*)?([a-z]{3,10})\s*(?:de\s*)?(\d{2,4})\b/,
  );
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = MONTHS[match[2]];
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  if (!month || !day || !year) {
    return null;
  }

  return { day, month, year };
}

function parseNumericDate(text: string) {
  const match = text.match(
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b|\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/,
  );
  if (!match) {
    return null;
  }

  if (match[1]) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  const day = Number(match[4]);
  const month = Number(match[5]);
  const year = Number(match[6].length === 2 ? `20${match[6]}` : match[6]);
  return { year, month, day };
}

function isValidDateParts(year: number, month: number, day: number) {
  const candidate = new Date(year, month - 1, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() + 1 === month &&
    candidate.getDate() === day
  );
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getSlotForTime(time: string, windows: Record<ReservationSlot, SlotWindow>) {
  const minutes = timeToMinutes(time);
  const morningStart = timeToMinutes(windows.morning.start);
  const morningEnd = timeToMinutes(windows.morning.end);
  const afternoonStart = timeToMinutes(windows.afternoon.start);
  const afternoonEnd = timeToMinutes(windows.afternoon.end);

  if (minutes >= morningStart && minutes <= morningEnd) {
    return "morning" as const;
  }

  if (minutes >= afternoonStart && minutes <= afternoonEnd) {
    return "afternoon" as const;
  }

  return null;
}

function getExplicitSlot(text: string) {
  for (const candidate of SLOT_WORDS) {
    if (candidate.patterns.some((pattern) => pattern.test(text))) {
      return candidate.slot;
    }
  }
  return null;
}

function setFlag(flags: DateNormalizationFlag[], flag: DateNormalizationFlag) {
  if (!flags.includes(flag)) {
    flags.push(flag);
  }
}

export function normalizeFlexibleDateTime(
  input: string,
  options: DateNormalizationOptions = {},
): DateNormalizationResult {
  const original = normalizeWhitespace(input);
  const flags: DateNormalizationFlag[] = [];
  const referenceDate = startOfDay(cloneReferenceDate(options.referenceDate));
  const windows = options.slotWindows ?? DEFAULT_SLOT_WINDOWS;

  if (!original) {
    setFlag(flags, "missing_date");
    return {
      original,
      normalizedDate: null,
      normalizedTime: null,
      slot: null,
      slotSource: "unknown",
      flags,
      confidence: 0,
    };
  }

  const relativeDate = parseRelativeDate(original, referenceDate);
  const numericDate = parseNumericDate(original);
  const monthDate = numericDate ? null : parseSpanishMonthDate(original);

  let normalizedDate: string | null = null;
  if (relativeDate) {
    normalizedDate = relativeDate;
  } else if (numericDate) {
    if (!isValidDateParts(numericDate.year, numericDate.month, numericDate.day)) {
      setFlag(flags, "invalid_date");
    } else {
      normalizedDate = formatIsoDate(numericDate.year, numericDate.month, numericDate.day);
    }
  } else if (monthDate) {
    if (!isValidDateParts(monthDate.year, monthDate.month, monthDate.day)) {
      setFlag(flags, "invalid_date");
    } else {
      normalizedDate = formatIsoDate(monthDate.year, monthDate.month, monthDate.day);
    }
  }

  if (!normalizedDate) {
    setFlag(flags, "missing_date");
    setFlag(flags, "unrecognized_date_format");
  }

  const normalizedTime = extractExplicitTime(original);
  const explicitSlot = getExplicitSlot(original);
  let slot: ReservationSlot | null = null;
  let slotSource: DateNormalizationResult["slotSource"] = "unknown";

  if (explicitSlot) {
    slot = explicitSlot;
    slotSource = "explicit";
  }

  if (normalizedTime) {
    const inferredSlot = getSlotForTime(normalizedTime, windows);
    if (slot && inferredSlot && slot !== inferredSlot) {
      setFlag(flags, "slot_conflict");
    } else if (!slot && inferredSlot) {
      slot = inferredSlot;
      slotSource = "inferred";
    } else if (!inferredSlot) {
      setFlag(flags, "outside_business_window");
    }
  } else if (!slot) {
    setFlag(flags, "missing_time");
  }

  if (!slot && normalizedTime) {
    setFlag(flags, "ambiguous_slot");
  }

  const confidence =
    normalizedDate && (normalizedTime || slot)
      ? 1
      : normalizedDate
        ? 0.75
        : 0.25;

  return {
    original,
    normalizedDate,
    normalizedTime,
    slot,
    slotSource,
    flags,
    confidence,
  };
}
