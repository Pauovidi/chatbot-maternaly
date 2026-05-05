import { loadEnvConfig } from "@next/env";

import { dispatchDueReminders } from "../src/lib/hotel/application";

loadEnvConfig(process.cwd());

async function main() {
  const result = await dispatchDueReminders();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "No se pudo ejecutar el envío de recordatorios.",
  );
  process.exitCode = 1;
});
