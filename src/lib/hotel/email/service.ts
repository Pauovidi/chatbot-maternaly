import { parseReservationEmail } from "../parser";
import type { ParsedEmailResult } from "../parser";

import {
  evaluateEmailRelevance,
} from "./filter";
import {
  normalizeIncomingEmailContent,
} from "./normalize";
import {
  isEmailAlreadyProcessed,
  loadEmailIngestionState,
  registerProcessedEmail,
} from "./store";
import type {
  EmailIngestionOptions,
  EmailIngestionRecord,
  EmailIngestionResult,
  EmailMailboxSource,
  EmailPollResult,
  EmailSourceMessage,
  NormalizedEmailContent,
} from "./types";

function createRecord(
  message: EmailSourceMessage,
  normalized: NormalizedEmailContent,
  status: EmailIngestionRecord["status"],
  reasons: string[],
  parsed?: ParsedEmailResult,
): EmailIngestionRecord {
  return {
    fingerprint: normalized.fingerprint,
    messageId: message.messageId,
    uid: message.uid,
    mailbox: message.mailbox,
    subject: normalized.subject,
    from: message.from,
    receivedAt: message.receivedAt,
    status,
    reasons,
    processedAt: new Date().toISOString(),
    parserSubject: parsed?.draft.subject,
    reservationId:
      parsed?.draft.petName && parsed?.draft.checkInDate
        ? `${parsed.draft.petName}-${parsed.draft.checkInDate}`
        : undefined,
  };
}

export function normalizeEmailForParser(message: EmailSourceMessage) {
  return normalizeIncomingEmailContent(message);
}

export async function ingestReservationEmail(
  message: EmailSourceMessage,
  options: EmailIngestionOptions = {},
): Promise<EmailIngestionResult> {
  const normalized = normalizeIncomingEmailContent(message);
  const relevance = evaluateEmailRelevance(message, normalized);
  const state = await loadEmailIngestionState(options.storeName);
  const alreadyProcessed =
    isEmailAlreadyProcessed(state, {
      fingerprint: normalized.fingerprint,
      messageId: message.messageId,
    });

  if (!relevance.relevant) {
    const record = createRecord(message, normalized, "ignored", relevance.reasons);
    await registerProcessedEmail(record, options.storeName);
    return {
      message,
      normalized,
      record,
    };
  }

  if (alreadyProcessed) {
    const record = createRecord(
      message,
      normalized,
      "duplicate",
      ["duplicate_or_already_processed", ...relevance.reasons],
    );
    await registerProcessedEmail(record, options.storeName);
    return {
      message,
      normalized,
      record,
    };
  }

  try {
    const parsed = parseReservationEmail({
      subject: normalized.parserInput.subject,
      rawText: normalized.parserInput.rawText,
    });
    const record = createRecord(
      message,
      normalized,
      "processed",
      relevance.reasons,
      parsed,
    );
    await registerProcessedEmail(record, options.storeName);
    return {
      message,
      normalized,
      record,
      parsed,
    };
  } catch (error) {
    const record = createRecord(
      message,
      normalized,
      "failed",
      [error instanceof Error ? error.message : "parse_failure", ...relevance.reasons],
    );
    await registerProcessedEmail(record, options.storeName);
    return {
      message,
      normalized,
      record,
    };
  }
}

export async function pollReservationMailbox(
  source: EmailMailboxSource,
  options: EmailIngestionOptions = {},
): Promise<EmailPollResult> {
  const state = await loadEmailIngestionState(options.storeName);
  const mailbox = options.mailbox ?? "INBOX";
  const messages = await source.listMessages({
    mailbox,
    sinceUid: state.lastUidByMailbox[mailbox],
    limit: options.limit,
  });
  const items: EmailIngestionResult[] = [];
  let relevant = 0;
  let processed = 0;
  let duplicates = 0;
  let ignored = 0;
  let failed = 0;

  for (const message of messages) {
    const normalized = normalizeIncomingEmailContent(message);
    const relevance = evaluateEmailRelevance(message, normalized);
    const result = await ingestReservationEmail(message, options);
    items.push(result);

    if (relevance.relevant) {
      relevant += 1;
    }

    if (result.record.status === "processed") {
      processed += 1;
    } else if (result.record.status === "duplicate") {
      duplicates += 1;
    } else if (result.record.status === "ignored") {
      ignored += 1;
    } else {
      failed += 1;
    }

    if (
      source.markProcessed &&
      options.markSeen !== false &&
      result.record.status !== "ignored"
    ) {
      await source.markProcessed(message, result.record);
    }
  }

  return {
    mailbox,
    fetched: messages.length,
    relevant,
    processed,
    duplicates,
    ignored,
    failed,
    items,
  };
}
