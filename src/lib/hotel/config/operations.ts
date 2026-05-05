export interface HotelEmailRuntimeConfig {
  enabled: boolean;
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  mailbox: string;
  limit: number;
  markSeen: boolean;
  storeName: string;
}

export interface HotelWorkerRuntimeConfig {
  enabled: boolean;
  emailPollCron: string;
  reminderDispatchCron: string;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readStringEnv(names: string[], fallback?: string): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return fallback;
}

function readNumberEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined) {
      continue;
    }

    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function getHotelEmailRuntimeConfig(): HotelEmailRuntimeConfig {
  const enabled = !readBooleanEnv("HOTEL_USE_MOCK_EMAIL_INPUT", true);
  const port = readNumberEnv(["HOTEL_EMAIL_IMAP_PORT", "HOTEL_EMAIL_PORT"], 993);

  return {
    enabled,
    host: readStringEnv(["HOTEL_EMAIL_IMAP_HOST", "HOTEL_EMAIL_HOST"]),
    port,
    secure: readBooleanEnv("HOTEL_EMAIL_IMAP_SECURE", port === 993),
    user: readStringEnv(["HOTEL_EMAIL_IMAP_USER", "HOTEL_EMAIL_USER"]),
    password: readStringEnv(["HOTEL_EMAIL_IMAP_PASSWORD", "HOTEL_EMAIL_PASSWORD"]),
    mailbox: readStringEnv(["HOTEL_EMAIL_IMAP_MAILBOX", "HOTEL_EMAIL_MAILBOX"], "INBOX") ?? "INBOX",
    limit: readNumberEnv(["HOTEL_EMAIL_POLL_LIMIT"], 25),
    markSeen: readBooleanEnv("HOTEL_EMAIL_MARK_SEEN", true),
    storeName:
      readStringEnv(["HOTEL_EMAIL_STATE_STORE", "HOTEL_EMAIL_STORE_NAME"], "hotel-email-ingestion-state.json") ??
      "hotel-email-ingestion-state.json",
  };
}

export function getHotelWorkerRuntimeConfig(): HotelWorkerRuntimeConfig {
  return {
    enabled: readBooleanEnv("HOTEL_INTERNAL_WORKER_ENABLED", false),
    emailPollCron:
      readStringEnv(["HOTEL_EMAIL_POLL_CRON"], "*/5 * * * *") ?? "*/5 * * * *",
    reminderDispatchCron:
      readStringEnv(["HOTEL_REMINDER_DISPATCH_CRON"], "*/10 * * * *") ?? "*/10 * * * *",
  };
}
