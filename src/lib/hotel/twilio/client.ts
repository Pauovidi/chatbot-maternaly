export interface TwilioWhatsAppConfig {
  accountSid?: string;
  authToken?: string;
  from?: string;
  mock: boolean;
}

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

function asWhatsAppAddress(phone: string) {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

export function readTwilioWhatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): TwilioWhatsAppConfig {
  const hasCredentials = Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM,
  );
  const explicitMock = parseBoolean(env.HOTEL_CONVERSATIONS_MOCK_TWILIO, !hasCredentials);

  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    from: env.TWILIO_WHATSAPP_FROM,
    mock: explicitMock || !hasCredentials,
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

  if (!config.accountSid || !config.authToken || !config.from) {
    return {
      ok: false,
      mode: "mock",
      error: "Twilio credentials are not configured.",
    };
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
        body: new URLSearchParams({
          From: asWhatsAppAddress(config.from),
          To: asWhatsAppAddress(input.to),
          Body: input.body,
        }),
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
