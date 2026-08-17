export const MATERNALY_CHARLA_REMINDER_LEAD_HOURS = 48 as const;
export const MATERNALY_CHARLA_REMINDER_TIME_ZONE = "Europe/Madrid" as const;
export const MATERNALY_REMINDER_DEFAULT_LEASE_MS = 60_000 as const;

export type MaternalyReminderStatus =
  | "scheduled"
  | "processing"
  | "sending"
  | "sent"
  | "cancelled"
  | "blocked"
  | "failed";

export type MaternalyReminderModality = "online" | "presencial";

export interface MaternalyOnlineAccess {
  joinUrl: string;
  meetingId: string;
  passcode: string;
}

export interface ScheduleMaternalyCharlaReminderInput {
  registrationId: string;
  sessionId: string;
  /** Absolute ISO-8601 timestamp. An explicit offset or Z is required. */
  sessionStartsAt: string;
  phoneE164: string;
  modality: MaternalyReminderModality;
  location: string;
  address?: string;
  onlineAccess?: MaternalyOnlineAccess;
  conversationId?: string;
  now?: Date;
}

export interface MaternalyReminderRecord {
  reminderId: string;
  idempotencyKey: string;
  registrationId: string;
  conversationId?: string;
  serviceKey: "charla_embarazo_1_20";
  sessionId: string;
  sessionStartsAt: string;
  scheduledFor: string;
  nextAttemptAt: string;
  leadHours: typeof MATERNALY_CHARLA_REMINDER_LEAD_HOURS;
  timeZone: typeof MATERNALY_CHARLA_REMINDER_TIME_ZONE;
  phoneE164: string;
  modality: MaternalyReminderModality;
  location: string;
  address?: string;
  onlineAccess?: MaternalyOnlineAccess;
  status: MaternalyReminderStatus;
  attempts: number;
  maxAttempts: number;
  leaseToken?: string;
  leaseExpiresAt?: string;
  providerMessageId?: string;
  sentAt?: string;
  cancelledAt?: string;
  /** Cancellation requested while a worker still owns the delivery lease. */
  cancelRequestedAt?: string;
  blockedReason?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaternalyReminderScheduleResult {
  reminder: MaternalyReminderRecord;
  created: boolean;
  supersededCount: number;
}

export interface ClaimDueMaternalyRemindersInput {
  now: Date;
  limit: number;
  leaseMs: number;
}

export interface MarkMaternalyReminderSentInput {
  reminderId: string;
  leaseToken: string;
  sentAt: Date;
  providerMessageId?: string;
}

export interface MarkMaternalyReminderRetryInput {
  reminderId: string;
  leaseToken: string;
  now: Date;
  retryAt: Date;
  error: string;
}

export interface MarkMaternalyReminderBlockedInput {
  reminderId: string;
  leaseToken: string;
  now: Date;
  reason: string;
}

export interface RevalidateMaternalyReminderClaimInput {
  reminderId: string;
  leaseToken: string;
  now: Date;
}

export interface MaternalyReminderRepository {
  /** Must insert-or-return and supersede older pending reminders atomically. */
  schedule(record: MaternalyReminderRecord): Promise<MaternalyReminderScheduleResult>;
  getById(reminderId: string): Promise<MaternalyReminderRecord | undefined>;
  getByIdempotencyKey(idempotencyKey: string): Promise<MaternalyReminderRecord | undefined>;
  /** Must claim records atomically so concurrent workers cannot send the same job. */
  claimDue(input: ClaimDueMaternalyRemindersInput): Promise<MaternalyReminderRecord[]>;
  /**
   * Revalidates ownership immediately before the external send. If cancellation was
   * requested while processing, it atomically finalizes cancellation and returns undefined.
   */
  revalidateClaim(
    input: RevalidateMaternalyReminderClaimInput,
  ): Promise<MaternalyReminderRecord | undefined>;
  markSent(input: MarkMaternalyReminderSentInput): Promise<MaternalyReminderRecord>;
  markRetry(input: MarkMaternalyReminderRetryInput): Promise<MaternalyReminderRecord>;
  markBlocked(input: MarkMaternalyReminderBlockedInput): Promise<MaternalyReminderRecord>;
  cancel(reminderId: string, now: Date): Promise<MaternalyReminderRecord>;
  /** Idempotently cancels every pending reminder for a cancelled registration. */
  cancelPendingForRegistration(registrationId: string, now: Date): Promise<number>;
}

export interface MaternalyReminderOutboundMessage {
  reminderId: string;
  idempotencyKey: string;
  to: string;
  channel: "whatsapp";
  body: string;
  template:
    | {
        kind: "charla_48h_online";
        variables: {
          "1": string;
          "2": string;
          "3": string;
          "4": string;
        };
      }
    | {
        kind: "charla_48h_presencial";
        variables: {
          "1": string;
          "2": string;
          "3": string;
        };
      };
}

export interface MaternalyReminderTransportResult {
  ok: boolean;
  providerMessageId?: string;
  retryable?: boolean;
  /** The POST may have reached the provider; automatic retry could duplicate delivery. */
  deliveryUncertain?: boolean;
  error?: string;
}

export interface MaternalyReminderTransport {
  /** Repository leases prevent concurrent duplicate dispatches. */
  send(payload: MaternalyReminderOutboundMessage): Promise<MaternalyReminderTransportResult>;
}

export type MaternalyReminderSourceValidation =
  | { status: "valid" }
  | { status: "inactive" | "changed" | "uncertain"; reason: string };

export interface MaternalyReminderSourceOfTruth {
  /** Revalidates the authoritative registration and session immediately before delivery. */
  validate(
    reminder: MaternalyReminderRecord,
    now: Date,
  ): Promise<MaternalyReminderSourceValidation>;
}

export interface MaternalyReminderDispatchItem {
  reminderId: string;
  outcome: "sent" | "retry_scheduled" | "cancelled" | "blocked" | "failed";
  error?: string;
}

export interface MaternalyReminderDispatchResult {
  claimed: number;
  sent: number;
  retryScheduled: number;
  cancelled: number;
  blocked: number;
  failed: number;
  items: MaternalyReminderDispatchItem[];
}
