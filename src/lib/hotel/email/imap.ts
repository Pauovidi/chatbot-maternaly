import type { EmailMailboxSource, EmailSourceMessage } from "./types";

export interface ImapEmailSourceConfig {
  host: string;
  port?: number;
  secure?: boolean;
  user: string;
  password: string;
  mailbox?: string;
  markSeen?: boolean;
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return undefined;
}

interface ImapEnvelopeAddress {
  address?: string;
  name?: string;
}

interface ImapEnvelope {
  subject?: string | Buffer;
  from?: ImapEnvelopeAddress[];
  messageId?: string | Buffer;
  date?: Date;
}

export async function createImapEmailSource(
  config: ImapEmailSourceConfig,
): Promise<EmailMailboxSource> {
  const imapflowModule = (await import("imapflow")) as unknown as {
    ImapFlow: new (options: Record<string, unknown>) => {
      connect(): Promise<void>;
      logout(): Promise<void>;
      getMailboxLock(mailbox: string): Promise<{ release(): void }>;
      fetch(
        range: string,
        options: Record<string, unknown>,
      ): AsyncIterable<Record<string, unknown>>;
      messageFlagsAdd(
        uid: number,
        flags: string[],
        options?: Record<string, unknown>,
      ): Promise<void>;
    };
  };
  const { ImapFlow } = imapflowModule;

  return {
    async listMessages(options = {}) {
      const client = new ImapFlow({
        host: config.host,
        port: config.port ?? (config.secure === false ? 143 : 993),
        secure: config.secure ?? (config.port ?? 993) === 993,
        auth: {
          user: config.user,
          pass: config.password,
        },
      });

      await client.connect();
      const mailbox = options.mailbox ?? config.mailbox ?? "INBOX";
      const lock = await client.getMailboxLock(mailbox);
      const results: EmailSourceMessage[] = [];

      try {
        const startUid = Math.max(1, (options.sinceUid ?? 0) + 1);
        const range = `${startUid}:*`;
        for await (const message of client.fetch(range, {
          uid: true,
          envelope: true,
          source: true,
          flags: true,
        })) {
          const envelope = (message.envelope ?? {}) as ImapEnvelope;
          results.push({
            uid: typeof message.uid === "number" ? message.uid : undefined,
            subject: toText(envelope.subject) ?? "",
            from: Array.isArray(envelope.from)
              ? envelope.from
                  .map((part) => part.address ?? part.name)
                  .filter(Boolean)
                  .join(", ")
              : undefined,
            messageId: toText(envelope.messageId),
            receivedAt:
              envelope.date instanceof Date ? envelope.date.toISOString() : undefined,
            mailbox,
            rawText: toText(message.source) ?? "",
            flags: Array.isArray(message.flags)
              ? message.flags.map((flag) => String(flag))
              : undefined,
          });
        }
      } finally {
        lock.release();
        await client.logout();
      }

      return results;
    },
    async markProcessed(message, record) {
      if (!config.markSeen || message.uid === undefined) {
        return;
      }

      const client = new ImapFlow({
        host: config.host,
        port: config.port ?? (config.secure === false ? 143 : 993),
        secure: config.secure ?? (config.port ?? 993) === 993,
        auth: {
          user: config.user,
          pass: config.password,
        },
      });

      await client.connect();
      const mailbox = message.mailbox ?? config.mailbox ?? "INBOX";
      const lock = await client.getMailboxLock(mailbox);

      try {
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
      } catch {
        // Best effort only. The local ingestion store is the source of truth.
      } finally {
        lock.release();
        await client.logout();
      }

      void record;
    },
  };
}
