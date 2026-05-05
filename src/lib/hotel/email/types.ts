import type { ParsedEmailResult } from "../parser";

export interface EmailSourceMessage {
  id?: string;
  uid?: number;
  subject: string;
  from?: string;
  to?: string;
  messageId?: string;
  threadId?: string;
  mailbox?: string;
  receivedAt?: string;
  rawText: string;
  flags?: string[];
}

export interface NormalizedEmailContent {
  subject: string;
  rawText: string;
  normalizedText: string;
  fingerprint: string;
  reasons: string[];
  parserInput: {
    subject: string;
    rawText: string;
  };
}

export type EmailIngestionStatus =
  | "processed"
  | "duplicate"
  | "ignored"
  | "failed";

export interface EmailIngestionRecord {
  fingerprint: string;
  messageId?: string;
  uid?: number;
  mailbox?: string;
  subject: string;
  from?: string;
  receivedAt?: string;
  status: EmailIngestionStatus;
  reasons: string[];
  processedAt: string;
  parserSubject?: string;
  reservationId?: string;
}

export interface EmailIngestionState {
  processedByFingerprint: Record<string, EmailIngestionRecord>;
  processedByMessageId: Record<string, EmailIngestionRecord>;
  lastUidByMailbox: Record<string, number>;
  history: EmailIngestionRecord[];
  updatedAt: string;
}

export interface EmailMailboxSource {
  listMessages(options?: {
    mailbox?: string;
    sinceUid?: number;
    limit?: number;
  }): Promise<EmailSourceMessage[]>;
  markProcessed?(
    message: EmailSourceMessage,
    record: EmailIngestionRecord,
  ): Promise<void>;
  close?(): Promise<void>;
}

export interface EmailIngestionResult {
  message: EmailSourceMessage;
  normalized: NormalizedEmailContent;
  record: EmailIngestionRecord;
  parsed?: ParsedEmailResult;
}

export interface EmailPollResult {
  mailbox: string;
  fetched: number;
  relevant: number;
  processed: number;
  duplicates: number;
  ignored: number;
  failed: number;
  items: EmailIngestionResult[];
}

export interface EmailIngestionOptions {
  mailbox?: string;
  storeName?: string;
  limit?: number;
  markSeen?: boolean;
}
