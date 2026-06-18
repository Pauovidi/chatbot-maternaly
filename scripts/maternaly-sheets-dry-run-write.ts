import { redactCell } from "../src/lib/maternaly/sheets/redaction";
import { redactSheetId } from "../src/lib/maternaly/sheets/normalized-template";
import { ReservationWriteService } from "../src/lib/maternaly/sheets/write";

const service = new ReservationWriteService();
const result = service.dryRun(
  {
    serviceId: "aipap_agua",
    serviceName: "AIPAP Agua",
    sessionId: "fixture-session",
    date: "2026-06-15",
    startTime: "10:00",
    phone: "+34600000123",
    contactName: "Fixture",
    peopleCount: 1,
  },
  {
    sheetId: "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI",
    tab: "TEST_BOT_WRITES",
    safeColumnsIdentified: true,
  },
);

console.log(JSON.stringify({
  ...result,
  plan: {
    ...result.plan,
    sheet_id: redactSheetId(result.plan.sheet_id),
    values: Object.fromEntries(
      Object.entries(result.plan.values).map(([key, value]) => [key, redactCell(value)]),
    ),
  },
}, null, 2));
