import { describe, expect, it } from "vitest";
import {
  listAvailableSessionsFromSnapshot,
} from "@/lib/maternaly/sheets/normalized-availability";
import { readNormalizedServiceSheet } from "@/lib/maternaly/sheets/normalized-client";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";
import { buildConfirmedCharlaReminderInput } from "./charla-integration";
import { InMemoryMaternalyReminderRepository } from "./memory-repository";
import { scheduleMaternalyCharlaReminder } from "./scheduler";
import { NormalizedSheetsMaternalyReminderSourceOfTruth } from "./source-of-truth";

async function fixture() {
  const workbook = createRealTemplateWorkbook({
    serviceKey: "charla_embarazo_1_20",
    visualHeaderRows: false,
    registrations: [[
      "INS_REMINDER_SOURCE",
      "CLI_REMINDER_SOURCE",
      "Ana",
      "Ruiz",
      "+34600111222",
      "grupo_charla_bilbao",
      "charla_embarazo_1_20",
      "2026-08-17",
      "whatsapp",
      "0 €",
      "no_aplica",
      "Activa",
      "2027-03-31",
      "",
      "",
      "session:sesion_charla_bilbao_20261006 | personas:1",
    ]],
  });
  const client = new InMemoryNormalizedSheetsClient(workbook);
  const env = normalizedTestEnv({
    MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
    GOOGLE_SHEETS_ACCESS_MODE: "live",
    BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
  });
  const snapshot = await readNormalizedServiceSheet("charla_embarazo_1_20", client, env);
  const session = listAvailableSessionsFromSnapshot(snapshot, {
    now: new Date("2026-08-17T10:00:00.000Z"),
  }).find((candidate) => candidate.sessionId === "sesion_charla_bilbao_20261006");
  if (!session) throw new Error("fixture_session_missing");
  const repository = new InMemoryMaternalyReminderRepository();
  const scheduled = await scheduleMaternalyCharlaReminder(
    buildConfirmedCharlaReminderInput({
      registrationId: "INS_REMINDER_SOURCE",
      session,
      phoneE164: "+34600111222",
      now: new Date("2026-08-17T10:00:00.000Z"),
    }),
    repository,
  );
  return {
    workbook,
    env,
    reminder: scheduled.reminder,
    source: new NormalizedSheetsMaternalyReminderSourceOfTruth(client, env),
  };
}

describe("Maternaly reminder source-of-truth validation", () => {
  it("accepts an unchanged confirmed registration and session", async () => {
    const { source, reminder } = await fixture();
    await expect(source.validate(reminder, new Date("2026-08-17T10:00:00.000Z")))
      .resolves.toEqual({ status: "valid" });
  });

  it("blocks delivery after the team cancels the registration in Sheets", async () => {
    const { source, reminder, workbook } = await fixture();
    const registration = workbook.Inscripciones.find((row) => row.includes("INS_REMINDER_SOURCE"));
    if (!registration) throw new Error("fixture_registration_missing");
    registration[11] = "Cancelada";

    await expect(source.validate(reminder, new Date("2026-08-17T10:00:00.000Z")))
      .resolves.toMatchObject({ status: "inactive" });
  });

  it("blocks stale content when session operational data changes", async () => {
    const { source, reminder, workbook } = await fixture();
    const session = workbook.Sesiones.find((row) => row.includes("sesion_charla_bilbao_20261006"));
    if (!session) throw new Error("fixture_session_missing");
    session[4] = "18:00";

    await expect(source.validate(reminder, new Date("2026-08-17T10:00:00.000Z")))
      .resolves.toMatchObject({ status: "changed" });
  });

  it("keeps reminders valid when a full group is closed only to new bookings", async () => {
    const { source, reminder, workbook } = await fixture();
    const group = workbook.Grupos_Ediciones.find((row) => row.includes("grupo_charla_bilbao"));
    if (!group) throw new Error("fixture_group_missing");
    group[6] = "Completo";
    group[8] = "no";

    await expect(source.validate(reminder, new Date("2026-08-17T10:00:00.000Z")))
      .resolves.toEqual({ status: "valid" });
  });
});
