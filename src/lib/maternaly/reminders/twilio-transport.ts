import type {
  MaternalyReminderOutboundMessage,
  MaternalyReminderTransport,
  MaternalyReminderTransportResult,
} from "./types";

export interface TwilioMaternalyReminderTransportConfig {
  accountSid?: string;
  authToken?: string;
  from?: string;
  messagingServiceSid?: string;
  statusCallbackUrl?: string;
  contentSidOnline?: string;
  contentSidPresencial?: string;
  requestTimeoutMs?: number;
}

const CONTENT_SID = /^HX[a-fA-F0-9]{32}$/;
export const MATERNALY_REMINDER_TWILIO_TIMEOUT_MS = 15_000;
export const MATERNALY_REMINDER_TWILIO_MAX_TIMEOUT_MS = 45_000;

function requestTimeoutMs(config: TwilioMaternalyReminderTransportConfig): number {
  const requested = config.requestTimeoutMs;
  if (!requested || !Number.isFinite(requested)) {
    return MATERNALY_REMINDER_TWILIO_TIMEOUT_MS;
  }
  return Math.min(
    MATERNALY_REMINDER_TWILIO_MAX_TIMEOUT_MS,
    Math.max(1_000, Math.trunc(requested)),
  );
}

function whatsappAddress(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

function missingConfiguration(config: TwilioMaternalyReminderTransportConfig): string[] {
  const missing: string[] = [];
  if (!config.accountSid) {
    missing.push("TWILIO_ACCOUNT_SID");
  }
  if (!config.authToken) {
    missing.push("TWILIO_AUTH_TOKEN");
  }
  if (!config.from && !config.messagingServiceSid) {
    missing.push("TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID");
  }
  if (!config.contentSidOnline) {
    missing.push("MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE");
  }
  if (!config.contentSidPresencial) {
    missing.push("MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL");
  }
  return missing;
}

function contentSidFor(
  payload: MaternalyReminderOutboundMessage,
  config: TwilioMaternalyReminderTransportConfig,
): string | undefined {
  return payload.template.kind === "charla_48h_online"
    ? config.contentSidOnline
    : config.contentSidPresencial;
}

export class TwilioContentMaternalyReminderTransport implements MaternalyReminderTransport {
  constructor(
    private readonly config: TwilioMaternalyReminderTransportConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(
    payload: MaternalyReminderOutboundMessage,
  ): Promise<MaternalyReminderTransportResult> {
    const missing = missingConfiguration(this.config);
    if (missing.length > 0) {
      return {
        ok: false,
        retryable: false,
        error: `Maternaly reminder Twilio configuration is incomplete: ${missing.join(", ")}.`,
      };
    }

    const contentSid = contentSidFor(payload, this.config);
    if (!contentSid || !CONTENT_SID.test(contentSid)) {
      return {
        ok: false,
        retryable: false,
        error: `The approved Twilio ContentSid for ${payload.template.kind} is invalid.`,
      };
    }

    const form = new URLSearchParams({
      To: whatsappAddress(payload.to),
      ContentSid: contentSid,
      ContentVariables: JSON.stringify(payload.template.variables),
    });
    if (this.config.messagingServiceSid) {
      form.set("MessagingServiceSid", this.config.messagingServiceSid);
    } else if (this.config.from) {
      form.set("From", whatsappAddress(this.config.from));
    }
    if (this.config.statusCallbackUrl) {
      form.set("StatusCallback", this.config.statusCallbackUrl);
    }

    let response: Response;
    let responseBody: { sid?: unknown } = {};
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs(this.config));
    try {
      response = await this.fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${this.config.accountSid}:${this.config.authToken}`,
            ).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
          signal: controller.signal,
        },
      );
      if (response.ok) {
        try {
          responseBody = (await response.json()) as { sid?: unknown };
        } catch (error) {
          if (
            controller.signal.aborted ||
            (error instanceof Error && error.name === "AbortError")
          ) {
            throw error;
          }
        }
      }
    } catch (error) {
      return {
        ok: false,
        retryable: false,
        deliveryUncertain: true,
        error:
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
            ? "Twilio reminder request timed out."
            : "Twilio reminder network request failed.",
      };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const unambiguouslyRetryable = response.status === 429;
      const deliveryUncertain = response.status >= 500;
      return {
        ok: false,
        retryable: unambiguouslyRetryable,
        deliveryUncertain,
        error: `Twilio reminder request returned ${response.status}.`,
      };
    }

    return {
      ok: true,
      providerMessageId:
        typeof responseBody.sid === "string" ? responseBody.sid : undefined,
    };
  }
}
