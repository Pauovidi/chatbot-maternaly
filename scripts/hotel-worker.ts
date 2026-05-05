import { loadEnvConfig } from "@next/env";
import cron from "node-cron";

import {
  dispatchDueReminders,
  pollReservationMailboxWorkflow,
} from "../src/lib/hotel/application";
import { getHotelWorkerRuntimeConfig } from "../src/lib/hotel/config";

loadEnvConfig(process.cwd());

async function runEmailPoll() {
  const result = await pollReservationMailboxWorkflow();
  console.log(
    `[hotel-worker] email poll -> fetched=${result.fetched} processed=${result.processed} duplicates=${result.duplicates}`,
  );
}

async function runReminderDispatch() {
  const result = await dispatchDueReminders();
  console.log(
    `[hotel-worker] reminders -> due=${result.due} sent=${result.sent} failed=${result.failed} previewed=${result.previewed}`,
  );
}

async function main() {
  const config = getHotelWorkerRuntimeConfig();
  console.log(
    `[hotel-worker] arrancado con email cron="${config.emailPollCron}" y reminders cron="${config.reminderDispatchCron}"`,
  );

  cron.schedule(config.emailPollCron, () => {
    void runEmailPoll();
  });

  cron.schedule(config.reminderDispatchCron, () => {
    void runReminderDispatch();
  });

  await runEmailPoll();
  await runReminderDispatch();
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo arrancar el worker hotel.",
  );
  process.exitCode = 1;
});
