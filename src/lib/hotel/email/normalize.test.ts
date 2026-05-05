import { describe, expect, it } from "vitest";

import { normalizeIncomingEmailContent } from "./normalize";
import { REAL_SAMPLE_EMAIL } from "../parser/sample-emails";

describe("normalizeIncomingEmailContent", () => {
  it("preserves structured reservation emails and builds a stable fingerprint", () => {
    const first = normalizeIncomingEmailContent({
      subject: "Tienes nuevas Reservas Online pendientes de confirmar",
      from: "residencia@somosmuyperros.com",
      rawText: REAL_SAMPLE_EMAIL,
    });

    const second = normalizeIncomingEmailContent({
      subject: "Tienes nuevas Reservas Online pendientes de confirmar",
      from: "residencia@somosmuyperros.com",
      rawText: `\n${REAL_SAMPLE_EMAIL}\n`,
    });

    expect(first.normalizedText).toContain("Cliente:");
    expect(first.normalizedText).toContain("Fecha entrada:");
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.reasons).not.toContain("low_reservation_signal");
  });
});
