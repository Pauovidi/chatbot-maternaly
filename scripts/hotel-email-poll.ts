import { loadEnvConfig } from "@next/env";

import { pollReservationMailboxWorkflow } from "../src/lib/hotel/application";

loadEnvConfig(process.cwd());

async function main() {
  const result = await pollReservationMailboxWorkflow();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo ejecutar el polling del buzón.",
  );
  process.exitCode = 1;
});
