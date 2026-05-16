export interface TwilioWhatsAppConfig {
  accountSid?: string;
  authToken?: string;
  from?: string;
  messagingServiceSid?: string;
  mock: boolean;
  providerMode: "mock" | "sandbox" | "real";
  statusCallbackUrl?: string;
}

type TwilioProviderMode = TwilioWhatsAppConfig["providerMode"];

export interface TwilioSendInput {
  to: string;
  body: string;
}

export interface TwilioSendResult {
  ok: boolean;
  mode: "mock" | "real";
  sid?: string;
  error?: string;
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
  const providerModeOverride = parseProviderMode(env.TWILIO_WHATSAPP_PROVIDER_MODE);

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

  if (config.messagingServiceSid) {
    formBody.set("MessagingServiceSid", config.messagingServiceSid);
  } else if (config.from) {
    formBody.set("From", asWhatsAppAddress(config.from));
  }

  if (config.statusCallbackUrl) {
    formBody.set("StatusCallback", config.statusCallbackUrl);
  }

  let response: Response;
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
      },
    );
  } catch {
    return {
      ok: false,
      mode: "real",
      error: "Twilio network request failed.",
    };
  }

  const text = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      mode: "real",
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
