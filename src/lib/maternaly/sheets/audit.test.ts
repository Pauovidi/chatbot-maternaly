import { describe, expect, it } from "vitest";
import { detectTabAudit } from "./audit";

describe("detectTabAudit", () => {
  it("detects headers and redacts sample PII", () => {
    const audit = detectTabAudit(
      { title: "Reservas", gid: 1 },
      [
        ["Fecha", "Hora", "Servicio", "Nombre", "Email", "Pago"],
        ["15/06/2026", "10:00", "AIPAP Agua", "Maria Garcia", "maria@example.com", "pendiente"],
      ],
    );

    expect(audit.columnHints.date).toContain("Fecha");
    expect(audit.columnHints.payment).toContain("Pago");
    expect(audit.sampleRows[1][3]).toBe("[REDACTED_NAME]");
    expect(audit.sampleRows[1][4]).toBe("m***@example.com");
  });
});
