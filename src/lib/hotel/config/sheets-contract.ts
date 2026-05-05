const CLIENT_WORKBOOK_MONTH_SHEET_TITLES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
  "ENERO 2020",
  "FEBRERO 2020",
  "MARZO 2020",
  "ABRIL 2020",
  "Mayo 2020",
  "JUNIO 2020",
  "JULIO 2020",
  "AGOSTO 2020",
  "SEPTIEMBRE 2020",
  "OCTUBRE 2020 ",
  "NOVIEMBRE 2020",
  "DICIEMBRE 2020",
  "ENERO 2021",
  "FEBRERO 2021 ",
  "MARZO 2021 ",
  "MARZO 2021  (2)",
  "ABRIL 2021",
  "MAYO 2021",
  "JUNIO 2021",
  "JULIO 2021 ",
  "AGOSTO 2021",
  "SEPTIEMBRE 2021 ",
  " OCTUBRE 2021",
  " NOVIEMBRE 2021",
  "DICIEMBRE 2021",
  "ENERO 2022",
  "FEBRERO 2022 ",
  "MARZO 2022 ",
  "ABRIL 2022 ",
  "MAYO 2022 ",
  "JUNIO 2022",
  "JULIO 2022 ",
  "AGOSTO 2022 ",
  "SEPTIEMBRE 2022",
  "OCTUBRE 2022 ",
  "NOVIEMBRE 2022 ",
  "DICIEMBRE 2022 ",
  "ENERO 2023",
  "FEBRERO 2023",
  "MARZO 2023 ",
  "ABRIL 2023 ",
  "MAYO 2023",
  "JUNIO 2023",
  "JULIO 2023",
  "AGOSTO 2023",
  "SEPTIMEBRE 2023 ",
  "OCTUBRE  2023 ",
  "NOVIEMBRE 2023",
  "DICIEMBRE 2023",
  "ENERO 2024",
  "FEBRERO 2024",
  "MARZO 2024",
  "ABRIL 2024 ",
  "MAYO 2024",
  "JUNIO 2024",
  "JULIO 2024",
  "AGOSTO 2024",
  "SEPTIMBRE 2024 ",
  "OCTUBRE 2024  ",
  "NOVIEMBRE 2024 ",
  "DICIEMBRE 2024",
  "ENERO 2025 ",
  "FEBRERO 2025 ",
  "MARZO 2025 ",
  "ABRIL 2025",
  "MAYO 2025",
  "JUNIO 2025 ",
  "JULIO 2025",
  "AGOSTO 2025",
  "SEPTIEMBRE 2025 ",
  "OCTUBRE 2025 ",
  " NOVIEMBRE 2025 ",
  "DICIEMBRE 2025",
  "ENERO 2026",
  "FEBRERO 2026",
  "MARZO 2026",
  "ABRIL 2026",
  "MAYO 2026",
  "JUNIO 2026",
  "JULIO 2026 ",
  "AGOSTO 2026",
  "SEPTIEMBRE 2026",
  "OCTUBRE 2026",
  "NOVIEMBRE 2026",
  "DICIEMBRE 2026",
] as const;

const SPANISH_MONTH_TO_NUMBER: Record<string, string> = {
  ENERO: "01",
  FEBRERO: "02",
  MARZO: "03",
  ABRIL: "04",
  MAYO: "05",
  JUNIO: "06",
  JULIO: "07",
  AGOSTO: "08",
  SEPTIEMBRE: "09",
  SEPTIMEBRE: "09",
  SEPTIMBRE: "09",
  OCTUBRE: "10",
  NOVIEMBRE: "11",
  DICIEMBRE: "12",
};

export interface ClientWorkbookLegendColor {
  label: string;
  color: string;
  sampleCell: string;
}

export interface ClientWorkbookRoomLabel {
  rowIndex: number;
  label: string;
}

function normalizeWorkbookTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toUpperCase();
}

export function parseWorkbookMonthKeyFromTitle(title: string): string | null {
  const normalized = normalizeWorkbookTitle(title).replace(/\(\d+\)$/u, "").trim();
  const match = normalized.match(/^([A-ZÁÉÍÓÚÜ]+)(?:\s+(\d{4}))?$/u);

  if (!match) {
    return null;
  }

  const month = SPANISH_MONTH_TO_NUMBER[match[1]];
  if (!month) {
    return null;
  }

  const year = match[2] ?? "2019";
  return `${year}-${month}`;
}

function buildMonthSheetMap(
  titles: readonly string[],
): Record<string, string> {
  const map: Record<string, string> = {};

  for (const title of titles) {
    const monthKey = parseWorkbookMonthKeyFromTitle(title);
    if (!monthKey || map[monthKey]) {
      continue;
    }

    map[monthKey] = title;
  }

  return map;
}

export const CLIENT_WORKBOOK_MONTH_SHEET_MAP = buildMonthSheetMap(
  CLIENT_WORKBOOK_MONTH_SHEET_TITLES,
);

export const CLIENT_WORKBOOK_ROOM_LABELS: ClientWorkbookRoomLabel[] = [
  ...Array.from({ length: 16 }, (_, index) => ({
    rowIndex: 4 + index * 2,
    label: `HAB ${index + 1}`,
  })),
  { rowIndex: 36, label: "COCINA" },
  { rowIndex: 38, label: "ENTRADA" },
];

export const CLIENT_WORKBOOK_LEGEND: ClientWorkbookLegendColor[] = [
  { label: "Sociable", color: "#92D050", sampleCell: "D46" },
  { label: "No comparte", color: "#FFC000", sampleCell: "D47" },
  { label: "No sociable", color: "#FF0000", sampleCell: "D48" },
  { label: "Nuevo", color: "#00B0F0", sampleCell: "D49" },
  { label: "Antiguo (no se recuerda carácter)", color: "#FFFF00", sampleCell: "D50" },
  { label: "Escuela de dia", color: "#7030A0", sampleCell: "D52" },
];

export const CLIENT_WORKBOOK_SHEETS_CONFIG = {
  sourceWorkbookFileName: "Copia de FPO1-04 RESERVAS BUENO.xlsx",
  dashboardSheetName: "NIVEL DE OCUPACIÓN",
  rejectedSheetPrefixes: ["RECHAZADOS", "RECHAZADOS ", "RECHAZADOS 20", "RECHAZADOS 202"],
  monthlyLayout: {
    sheetNameMap: CLIENT_WORKBOOK_MONTH_SHEET_MAP,
    titleRowIndex: 0,
    dayHeaderRowIndex: 3,
    firstDataRowIndex: 4,
    lastDataRowIndex: 39,
    overflowRowStartIndex: 40,
    overflowRowEndIndex: 39,
    summaryRowStartIndex: 40,
    summaryRowEndIndex: 52,
    labelColumnIndex: 1,
    firstDayColumnIndex: 2,
    lastDayColumnIndex: 32,
    lastRelevantColumnIndex: 33,
    dayCount: 31,
    occupancyMode: "mirror-daily-counts",
    searchRowRanges: [{ startRowIndex: 4, endRowIndex: 39 }],
  },
  colorPalette: {
    pending: "#FFC000",
    available: "#92D050",
    noAvailability: "#FF0000",
    confirmed: "#00B0F0",
    reminder: "#FFC000",
    review: "#FFC000",
    header: "#FF0000",
    overflow: "#FFFF00",
  },
  legend: CLIENT_WORKBOOK_LEGEND,
  roomLabels: CLIENT_WORKBOOK_ROOM_LABELS,
} as const;
