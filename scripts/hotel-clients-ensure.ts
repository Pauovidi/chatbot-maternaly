import {
  CLIENTS_SHEET_NAME,
  createClientsSheetsContext,
  ensureClientsSheet,
} from "./hotel-clients-sheet";

async function main() {
  const context = await createClientsSheetsContext();
  const result = await ensureClientsSheet(context);

  console.log(
    JSON.stringify(
      {
        ok: true,
        sheetName: CLIENTS_SHEET_NAME,
        created: result.created,
        headersWritten: result.headersWritten,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "error desconocido",
    }),
  );
  process.exitCode = 1;
});
