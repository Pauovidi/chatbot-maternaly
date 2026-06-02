import { advanceTestAdnDemoFlow } from "../src/lib/maternaly/demo/test-adn-flow";
import { writeCopyWriteResultReports } from "../src/lib/maternaly/sheets/copy-real-write";
import { redactCell } from "../src/lib/maternaly/sheets/redaction";

function redactText(text: string): string {
  return text
    .replace(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/g, (match) => String(redactCell(match)))
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (match) => String(redactCell(match)))
    .replace(/Erika\s+Ramírez/gi, "[REDACTED_NAME]")
    .replace(/Erika\s+Ramirez/gi, "[REDACTED_NAME]");
}

async function main() {
  const messages = [
    "Quiero reservar Test ADN",
    "Bilbao",
    "Erika Ramírez, erika@test.com",
    "Sí",
  ];
  const replies: string[] = [];
  let state;
  let writeReport;

  for (const message of messages) {
    const result = await advanceTestAdnDemoFlow({
      message,
      previousState: state,
      fallbackPhone: "+34600000123",
      executeWrite: true,
    });

    if (!result.handled || !result.reply) {
      throw new Error(`Demo flow did not handle message: ${message}`);
    }

    replies.push(result.reply);
    state = result.state;
    writeReport = result.writeReport ?? writeReport;
  }

  const finalReply = replies.at(-1) ?? "";
  const checks = {
    proposedDatePlusFourDays: state?.proposedDate === "08/06/2026",
    proposedTimeFixed: state?.proposedTime === "18:20",
    containsPaymentLink: finalReply.includes("https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh"),
    saysPendingPayment: /reserva fijada.*pendiente de pago/i.test(finalReply),
    avoidsForbiddenCopy: !/reserva confirmada|pago confirmado|factura enviada|plaza confirmada/i.test(replies.join("\n")),
  };

  if (writeReport) {
    await writeCopyWriteResultReports(writeReport);
  }

  console.log(JSON.stringify({
    ok: Object.values(checks).every(Boolean),
    checks,
    state: state
      ? {
          phase: state.phase,
          proposedDate: state.proposedDate,
          proposedTime: state.proposedTime,
          selectedLocation: state.selectedLocation,
          sourceLastRowReference: state.sourceLastRowReference,
          writeApplied: state.writeApplied,
          writeError: state.writeError,
        }
      : undefined,
    replies: replies.map(redactText),
    writeReport: writeReport
      ? {
          applied: writeReport.applied,
          targetSpreadsheetId: writeReport.plan.targetSpreadsheetIdRedacted,
          targetTab: writeReport.plan.targetTab,
          targetRange: writeReport.plan.targetRange,
          backupCreated: writeReport.plan.backupCreated,
          error: writeReport.error,
        }
      : undefined,
  }, null, 2));

  if (!Object.values(checks).every(Boolean)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown Test ADN demo-flow error");
  process.exitCode = 1;
});
