import { describe, expect, it, vi } from "vitest";
import { handleMaternalyReminderDispatch } from "./dispatch-handler";
import { InMemoryMaternalyReminderRepository } from "./memory-repository";
import { scheduleMaternalyCharlaReminder } from "./scheduler";
import type { MaternalyReminderTransport } from "./types";

const CONTENT_SID = `HX${"a".repeat(32)}`;
const NOW = new Date("2026-08-08T17:00:00.000Z");

function readyEnv() {
  return {
    MATERNALY_ADMIN_TASK_TOKEN: "secure-token",
    MATERNALY_REMINDERS_ENABLED: "true",
    MATERNALY_REMINDER_DISPATCH_BATCH_SIZE: "25",
    DATABASE_URL: "postgres://synthetic.invalid/reminders",
    TWILIO_ACCOUNT_SID: `AC${"b".repeat(32)}`,
    TWILIO_AUTH_TOKEN: "synthetic-secret",
    TWILIO_WHATSAPP_FROM: "+34600999888",
    MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE: CONTENT_SID,
    MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL: CONTENT_SID,
    MATERNALY_NORMALIZED_SHEETS_ENABLED: "true",
    MATERNALY_NORMALIZED_SERVICE_IDS: "charla_embarazo_1_20,taller_blw",
    MATERNALY_CHARLA_EMBARAZO_SHEET_ID: "synthetic-charla-sheet",
    GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: "synthetic-base64-credentials",
  };
}

function request(token?: string) {
  return new Request("https://example.test/api/maternaly/ops/reminders/dispatch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-maternaly-admin-task-token": token } : {}),
    },
    body: JSON.stringify({ limit: 10 }),
  });
}

describe("Maternaly reminder dispatch endpoint handler", () => {
  it("rejects unauthenticated dispatch before touching dependencies", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    const send = vi.fn();

    const response = await handleMaternalyReminderDispatch(request(), {
      env: readyEnv(),
      repository,
      transport: { send },
    });

    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("fails closed and identifies missing production configuration", async () => {
    const response = await handleMaternalyReminderDispatch(request("secure-token"), {
      env: { MATERNALY_ADMIN_TASK_TOKEN: "secure-token" },
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ ok: false, error: "maternaly_reminders_not_ready" });
    expect(body.missing).toContain("MATERNALY_REMINDERS_ENABLED=true");
    expect(body.missing).toContain("MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE");
  });

  it("dispatches a due reminder through injected fakes without a real message", async () => {
    const repository = new InMemoryMaternalyReminderRepository();
    await scheduleMaternalyCharlaReminder(
      {
        registrationId: "INS_CHARLA_001",
        sessionId: "SES_CHARLA_001",
        sessionStartsAt: "2026-08-10T19:00:00+02:00",
        phoneE164: "+34600111222",
        modality: "online",
        location: "Online",
        onlineAccess: {
          joinUrl: "https://zoom.us/j/123456789?pwd=synthetic",
          meetingId: "123 456 789",
          passcode: "MATERNALY",
        },
        now: new Date("2026-08-01T10:00:00.000Z"),
      },
      repository,
    );
    const send = vi.fn(async () => ({ ok: true, providerMessageId: "SM_FAKE" }));
    const transport: MaternalyReminderTransport = { send };

    const response = await handleMaternalyReminderDispatch(request("secure-token"), {
      env: readyEnv(),
      repository,
      transport,
      sourceOfTruth: { validate: vi.fn(async () => ({ status: "valid" as const })) },
      now: () => NOW,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, result: { claimed: 1, sent: 1 } });
    expect(send).toHaveBeenCalledOnce();
  });
});
