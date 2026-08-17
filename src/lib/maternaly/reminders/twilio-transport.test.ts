import { describe, expect, it, vi } from "vitest";
import { buildMaternalyCharlaReminderMessage } from "./content";
import { buildMaternalyCharlaReminder } from "./scheduler";
import {
  MATERNALY_REMINDER_TWILIO_MAX_TIMEOUT_MS,
  TwilioContentMaternalyReminderTransport,
} from "./twilio-transport";
import { MATERNALY_REMINDER_DEFAULT_LEASE_MS } from "./types";

const ONLINE_SID = `HX${"a".repeat(32)}`;
const PRESENCIAL_SID = `HX${"b".repeat(32)}`;

function onlinePayload() {
  return buildMaternalyCharlaReminderMessage(
    buildMaternalyCharlaReminder({
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
    }),
  );
}

function completeConfig() {
  return {
    accountSid: `AC${"c".repeat(32)}`,
    authToken: "synthetic-secret",
    messagingServiceSid: `MG${"d".repeat(32)}`,
    contentSidOnline: ONLINE_SID,
    contentSidPresencial: PRESENCIAL_SID,
  };
}

describe("Twilio Content Maternaly reminder transport", () => {
  it("blocks before any network call when approved-template configuration is missing", async () => {
    const fetchMock = vi.fn();
    const transport = new TwilioContentMaternalyReminderTransport(
      {},
      fetchMock as unknown as typeof fetch,
    );

    await expect(transport.send(onlinePayload())).resolves.toMatchObject({
      ok: false,
      retryable: false,
      error: expect.stringContaining("MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends ContentSid and ContentVariables without a free-form Body", async () => {
    let sentBody: BodyInit | null | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      sentBody = init?.body;
      return new Response(JSON.stringify({ sid: "SM_SYNTHETIC" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const fetchMock = vi.fn(fetchImpl);
    const transport = new TwilioContentMaternalyReminderTransport(
      completeConfig(),
      fetchMock as unknown as typeof fetch,
    );

    await expect(transport.send(onlinePayload())).resolves.toEqual({
      ok: true,
      providerMessageId: "SM_SYNTHETIC",
    });
    const form = sentBody as URLSearchParams;
    expect(form.get("To")).toBe("whatsapp:+34600111222");
    expect(form.get("ContentSid")).toBe(ONLINE_SID);
    expect(JSON.parse(form.get("ContentVariables") ?? "{}")).toMatchObject({
      "2": "https://zoom.us/j/123456789?pwd=synthetic",
      "3": "123 456 789",
      "4": "MATERNALY",
    });
    expect(form.has("Body")).toBe(false);
  });

  it("retries only an unequivocal rate limit and marks provider outages ambiguous", async () => {
    const outage = new TwilioContentMaternalyReminderTransport(
      completeConfig(),
      vi.fn(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch,
    );
    const rejected = new TwilioContentMaternalyReminderTransport(
      completeConfig(),
      vi.fn(async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch,
    );
    const rateLimited = new TwilioContentMaternalyReminderTransport(
      completeConfig(),
      vi.fn(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch,
    );

    await expect(outage.send(onlinePayload())).resolves.toMatchObject({
      ok: false,
      retryable: false,
      deliveryUncertain: true,
    });
    await expect(rejected.send(onlinePayload())).resolves.toMatchObject({
      ok: false,
      retryable: false,
      deliveryUncertain: false,
    });
    await expect(rateLimited.send(onlinePayload())).resolves.toMatchObject({
      ok: false,
      retryable: true,
      deliveryUncertain: false,
    });
  });

  it("aborts a stalled Twilio request before the worker lease can expire", async () => {
    vi.useFakeTimers();
    try {
      let observedAbort = false;
      const fetchImpl: typeof fetch = async (_input, init) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              observedAbort = true;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      };
      const transport = new TwilioContentMaternalyReminderTransport(
        { ...completeConfig(), requestTimeoutMs: 1_000 },
        fetchImpl,
      );

      const pending = transport.send(onlinePayload());
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(pending).resolves.toMatchObject({
        ok: false,
        retryable: false,
        deliveryUncertain: true,
        error: expect.stringMatching(/timed out/i),
      });
      expect(observedAbort).toBe(true);
      expect(MATERNALY_REMINDER_TWILIO_MAX_TIMEOUT_MS).toBeLessThan(
        MATERNALY_REMINDER_DEFAULT_LEASE_MS,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
