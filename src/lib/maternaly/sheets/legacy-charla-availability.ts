import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

const LEGACY_CHARLA_PATTERN = /charla\s+informativa\s+(?:(?:on\s*line|online)\s+[^\d]{0,40}?|(presencial)\s+(erandio|bilbao)\s+[^\d]{0,40}?)(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+a\s+las\s+(\d{1,2}:\d{2})/gi;

export interface LegacyCharlaTab {
  title: string;
  rows: unknown[][];
}

function formatDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function extractYear(spreadsheetTitle: string | undefined, now: Date): number {
  const compactYear = spreadsheetTitle?.match(/(?:^|\D)(\d{2})\s*charla\b/i)?.[1];
  if (compactYear) {
    return 2000 + Number(compactYear);
  }
  const fullYear = spreadsheetTitle?.match(/\b(20\d{2})\b/)?.[1];
  return fullYear ? Number(fullYear) : now.getFullYear();
}

/**
 * Reads the existing Charla workbook used by Maternaly. Its sessions are stored
 * in monthly tabs whose headings contain venue, date and time instead of the
 * normalized technical tabs used by the booking writer.
 */
export function listLegacyCharlaSessions(input: {
  spreadsheetTitle?: string;
  tabs: LegacyCharlaTab[];
  now?: Date;
}): NormalizedAvailableSession[] {
  const now = input.now ?? new Date();
  const year = extractYear(input.spreadsheetTitle, now);
  const today = formatDate(now.getFullYear(), now.getMonth(), now.getDate());
  const sessions = new Map<string, NormalizedAvailableSession>();

  for (const tab of input.tabs) {
    const text = tab.rows
      .slice(0, 20)
      .flat()
      .map((cell) => String(cell ?? ""))
      .join(" ");
    for (const match of text.matchAll(LEGACY_CHARLA_PATTERN)) {
      const [, presencial, venue, dayText, monthText, time] = match;
      const month = MONTHS[monthText.toLowerCase()];
      const day = Number(dayText);
      if (month === undefined || !Number.isInteger(day) || day < 1 || day > 31) {
        continue;
      }
      const location = presencial ? venue[0].toUpperCase() + venue.slice(1).toLowerCase() : "Online";
      const modality = presencial ? "presencial" as const : "online" as const;
      const date = formatDate(year, month, day);
      if (date < today) {
        continue;
      }
      const sessionId = `legacy-charla:${date}:${time}:${location.toLowerCase()}`;
      sessions.set(sessionId, {
        serviceKey: "charla_embarazo_1_20",
        serviceLabel: "Charla informativa embarazo semana 1-20",
        groupId: `legacy-charla:${tab.title}`,
        groupName: location,
        sessionId,
        sessionName: "Charla informativa embarazo semana 1-20",
        location,
        modality,
        date,
        startTime: time.padStart(5, "0"),
        occupied: 0,
        full: false,
        availabilityStatus: "unknown_capacity",
      });
    }
  }

  return [...sessions.values()].sort((left, right) =>
    `${left.date ?? "9999-12-31"} ${left.startTime ?? "99:99"}`.localeCompare(
      `${right.date ?? "9999-12-31"} ${right.startTime ?? "99:99"}`,
    ),
  );
}
