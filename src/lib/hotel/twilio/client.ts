export interface TwilioWhatsAppConfig {
  accountSid?: string;
  authToken?: string;
  from?: string;
  messagingServiceSid?: string;
  mock: boolean;
  providerMode: "mock" | "sandbox" | "real";
  statusCallbackUrl?: string;
  requestTimeoutMs?: number;
}

type TwilioProviderMode = TwilioWhatsAppConfig["providerMode"];

export interface TwilioSendInput {
  to: string;
  body: string;
  mediaUrl?: string;
}

export interface TwilioSendResult {
  ok: boolean;
  mode: "mock" | "real";
  sid?: string;
  error?: string;
  /** The POST may have reached Twilio even though no response was observed. */
  ambiguous?: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseProviderMode(value: string | undefined): TwilioProviderMode | undefined {
  if (value === "mock" || value === "sandbox" || value === "real") {
    return value;
  }

  return undefined;
}

function parseRequestTimeoutMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(15_000, Math.max(1_000, parsed)) : 5_000;
}

function asWhatsAppAddress(phone: string) {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

function inferProviderMode(config: {
  from?: string;
  mock: boolean;
  override?: TwilioProviderMode;
}): TwilioProviderMode {
  if (config.override) {
    return config.mock ? "mock" : config.override;
  }

  if (config.mock) {
    return "mock";
  }

  const normalizedFrom = config.from?.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
  if (normalizedFrom === "+14155238886") {
    return "sandbox";
  }

  return "real";
}

export function readTwilioWhatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): TwilioWhatsAppConfig {
  const hasCredentials = Boolean(
    env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_WHATSAPP_FROM),
  );
  const explicitMock = parseBoolean(env.HOTEL_CONVERSATIONS_MOCK_TWILIO, !hasCredentials);
  const mock = explicitMock || !hasCredentials;
  const providerModeOverride = parseProviderMode(
    env.TWILIO_PROVIDER_MODE ?? env.TWILIO_WHATSAPP_PROVIDER_MODE,
  );

  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    from: env.TWILIO_WHATSAPP_FROM,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    mock,
    providerMode: inferProviderMode({
      from: env.TWILIO_WHATSAPP_FROM,
      mock,
      override: providerModeOverride,
    }),
    statusCallbackUrl: env.TWILIO_STATUS_CALLBACK_URL,
    requestTimeoutMs: parseRequestTimeoutMs(env.TWILIO_REQUEST_TIMEOUT_MS),
  };
}

export async function sendTwilioWhatsAppText(
  input: TwilioSendInput,
  config: TwilioWhatsAppConfig = readTwilioWhatsAppConfig(),
): Promise<TwilioSendResult> {
  if (config.mock) {
    return {
      ok: true,
      mode: "mock",
      sid: `mock_${Date.now()}`,
    };
  }

  if (!config.accountSid || !config.authToken || (!config.from && !config.messagingServiceSid)) {
    return {
      ok: false,
      mode: "mock",
      error: "Twilio credentials are not configured.",
    };
  }

  const formBody = new URLSearchParams({
    To: asWhatsAppAddress(input.to),
    Body: input.body,
  });
  if (input.mediaUrl?.trim()) {
    formBody.set("MediaUrl", input.mediaUrl.trim());
  }

  if (config.messagingServiceSid) {
    formBody.set("MessagingServiceSid", config.messagingServiceSid);
  } else if (config.from) {
    formBody.set("From", asWhatsAppAddress(config.from));
  }

  if (config.statusCallbackUrl) {
    formBody.set("StatusCallback", config.statusCallbackUrl);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs ?? 5_000);
  let response: Response;
  let text: string;
  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${config.accountSid}:${config.authToken}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody,
        signal: controller.signal,
      },
    );
    text = await response.text();
  } catch (error) {
    const errorCode = (() => {
      if (!error || typeof error !== "object") {
        return undefined;
      }
      const direct = "code" in error ? String(error.code ?? "") : "";
      const cause = "cause" in error && error.cause && typeof error.cause === "object"
        ? error.cause
        : undefined;
      const caused = cause && "code" in cause ? String(cause.code ?? "") : "";
      return direct || caused || undefined;
    })();
    const definitelyFailedBeforeSend = new Set([
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "UND_ERR_CONNECT_TIMEOUT",
    ]).has(errorCode ?? "");
    return {
      ok: false,
      mode: "real",
      ambiguous:
        error instanceof Error && error.name === "AbortError"
          ? true
          : !definitelyFailedBeforeSend,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "Twilio request timed out."
          : "Twilio network request failed.",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    return {
      ok: false,
      mode: "real",
      ambiguous: response.status >= 500,
      error: `Twilio returned ${response.status}`,
    };
  }

  try {
    const parsed = JSON.parse(text) as { sid?: string };
    return {
      ok: true,
      mode: "real",
      sid: parsed.sid,
    };
  } catch {
    return {
      ok: true,
      mode: "real",
    };
  }
}
