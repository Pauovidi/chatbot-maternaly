import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStaticEmailSource } from "./static-source";
import { ingestReservationEmail, pollReservationMailbox } from "./service";
import { loadEmailIngestionState } from "./store";
import { REAL_SAMPLE_EMAIL, INCOMPLETE_SAMPLE_EMAIL } from "../parser/sample-emails";

describe("email ingestion service", () => {
  const originalCwd = process.cwd();
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "hotel-email-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("processes relevant emails and stores the fingerprint", async () => {
    const result = await ingestReservationEmail(
      {
        subject: "Tienes nuevas Reservas Online pendientes de confirmar",
        from: "residencia@somosmuyperros.com",
        messageId: "<demo-1@example.com>",
        rawText: REAL_SAMPLE_EMAIL,
      },
      { storeName: "state.json" },
    );

    expect(result.record.status).toBe("processed");
    expect(result.parsed?.draft.petName).toBe("luca");

    const state = await loadEmailIngestionState("state.json");
    expect(Object.keys(state.processedByFingerprint)).toHaveLength(1);
    expect(state.processedByMessageId["<demo-1@example.com>"]).toBeDefined();
  });

  it("marks repeated payloads as duplicate and ignores low-signal mail", async () => {
    const source = createStaticEmailSource([
      {
        subject: "Tienes nuevas Reservas Online pendientes de confirmar",
        from: "residencia@somosmuyperros.com",
        messageId: "<demo-2@example.com>",
        rawText: REAL_SAMPLE_EMAIL,
      },
      {
        subject: "Oferta newsletter",
        from: "promo@example.com",
        messageId: "<promo@example.com>",
        rawText: "Esto es marketing sin contexto de reserva.",
      },
    ]);

    const first = await pollReservationMailbox(source, {
      storeName: "state.json",
    });

    expect(first.processed).toBe(1);
    expect(first.ignored).toBe(1);

    const second = await pollReservationMailbox(source, {
      storeName: "state.json",
    });

    expect(second.duplicates).toBe(1);
  });

  it("still returns a normalized parser payload for incomplete requests", async () => {
    const result = await ingestReservationEmail(
      {
        subject: "Solicitud incompleta",
        from: "cliente@example.com",
        rawText: INCOMPLETE_SAMPLE_EMAIL,
      },
      { storeName: "state.json" },
    );

    expect(result.normalized.parserInput.subject).toBe("Solicitud incompleta");
    expect(result.record.status).not.toBe("failed");
  });
});
