import { describe, expect, it } from "vitest";
import { listLegacyCharlaSessions } from "./legacy-charla-availability";

describe("legacy Charla availability", () => {
  it("uses the sessions published in the existing monthly workbook tabs", () => {
    const sessions = listLegacyCharlaSessions({
      spreadsheetTitle: "26 CHARLA INFORMATIVA ERANDIO",
      now: new Date(2026, 6, 22, 12),
      tabs: [
        {
          title: "16 - 20 JULIO",
          rows: [["CHARLA INFORMATIVA PRESENCIAL ERANDIO JUEVES 16 JULIO A LAS 18:30 H"]],
        },
        {
          title: "10 -20 AGOSTO",
          rows: [["CHARLA INFORMATIVA ON LINE LUNES 10 AGOSTO A LAS 19:00 H NOMBRE CHARLA INFORMATIVA PRESENCIAL ERANDIO JUEVES 20 AGOSTO A LAS 18:30 H NOMBRE"]],
        },
        {
          title: "7 -24 SEPTIEMBRE",
          rows: [
            ["CHARLA INFORMATIVA ON LINE LUNES 7 SEPTIEMBRE A LAS 19:00 H"],
            ["CHARLA INFORMATIVA PRESENCIAL ERANDIO JUEVES 24 SEPTIEMBRE A LAS 18:30 H"],
          ],
        },
      ],
    });

    expect(sessions.map(({ date, startTime, location, modality }) => ({
      date,
      startTime,
      location,
      modality,
    }))).toEqual([
      { date: "2026-08-10", startTime: "19:00", location: "Online", modality: "online" },
      { date: "2026-08-20", startTime: "18:30", location: "Erandio", modality: "presencial" },
      { date: "2026-09-07", startTime: "19:00", location: "Online", modality: "online" },
      { date: "2026-09-24", startTime: "18:30", location: "Erandio", modality: "presencial" },
    ]);
  });
});
