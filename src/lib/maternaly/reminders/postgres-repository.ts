import crypto from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type {
  ClaimDueMaternalyRemindersInput,
  MarkMaternalyReminderBlockedInput,
  MarkMaternalyReminderRetryInput,
  MarkMaternalyReminderSentInput,
  MaternalyOnlineAccess,
  MaternalyReminderRecord,
  MaternalyReminderRepository,
  MaternalyReminderScheduleResult,
  RevalidateMaternalyReminderClaimInput,
} from "./types";

interface MaternalyReminderRow extends QueryResultRow {
  reminder_id: string;
  idempotency_key: string;
  registration_id: string;
  conversation_id: string | null;
  service_key: "charla_embarazo_1_20";
  session_id: string;
  session_starts_at: Date | string;
  scheduled_for: Date | string;
  next_attempt_at: Date | string;
  lead_hours: number | string;
  time_zone: "Europe/Madrid";
  phone_e164: string;
  modality: "online" | "presencial";
  location: string;
  address: string | null;
  online_access: MaternalyOnlineAccess | string | null;
  status: MaternalyReminderRecord["status"];
  attempts: number | string;
  max_attempts: number | string;
  lease_token: string | null;
  lease_expires_at: Date | string | null;
  provider_message_id: string | null;
  sent_at: Date | string | null;
  cancelled_at: Date | string | null;
  cancel_requested_at: Date | string | null;
  blocked_reason: string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function optionalIso(value: Date | string | null): string | undefined {
  return value ? iso(value) : undefined;
}

function onlineAccess(value: MaternalyReminderRow["online_access"]): MaternalyOnlineAccess | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return JSON.parse(value) as MaternalyOnlineAccess;
  }
  return value;
}

function mapRow(row: MaternalyReminderRow): MaternalyReminderRecord {
  return {
    reminderId: row.reminder_id,
    idempotencyKey: row.idempotency_key,
    registrationId: row.registration_id,
    conversationId: row.conversation_id ?? undefined,
    serviceKey: row.service_key,
    sessionId: row.session_id,
    sessionStartsAt: iso(row.session_starts_at),
    scheduledFor: iso(row.scheduled_for),
    nextAttemptAt: iso(row.next_attempt_at),
    leadHours: 48,
    timeZone: row.time_zone,
    phoneE164: row.phone_e164,
    modality: row.modality,
    location: row.location,
    address: row.address ?? undefined,
    onlineAccess: onlineAccess(row.online_access),
    status: row.status,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    leaseToken: row.lease_token ?? undefined,
    leaseExpiresAt: optionalIso(row.lease_expires_at),
    providerMessageId: row.provider_message_id ?? undefined,
    sentAt: optionalIso(row.sent_at),
    cancelledAt: optionalIso(row.cancelled_at),
    cancelRequestedAt: optionalIso(row.cancel_requested_at),
    blockedReason: row.blocked_reason ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

let defaultPool: Pool | undefined;
let defaultConnectionString: string | undefined;

function poolFromEnv(env: Partial<NodeJS.ProcessEnv>): Pool {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Maternaly reminders.");
  }
  if (!defaultPool || defaultConnectionString !== connectionString) {
    defaultPool = new Pool({
      connectionString,
      max: Number.parseInt(env.DATABASE_POOL_MAX ?? "5", 10),
    });
    defaultConnectionString = connectionString;
  }
  return defaultPool;
}

export class PostgresMaternalyReminderRepository implements MaternalyReminderRepository {
  constructor(private readonly pool: Pool = poolFromEnv(process.env)) {}

  static fromEnv(env: Partial<NodeJS.ProcessEnv> = process.env) {
    return new PostgresMaternalyReminderRepository(poolFromEnv(env));
  }

  async schedule(record: MaternalyReminderRecord): Promise<MaternalyReminderScheduleResult> {
    return this.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        record.registrationId,
      ]);
      const existing = await client.query<MaternalyReminderRow>(
        "SELECT * FROM maternaly_reminders WHERE idempotency_key = $1 FOR UPDATE",
        [record.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (["cancelled", "failed", "blocked"].includes(existing.rows[0].status)) {
          const superseded = await client.query(
            `UPDATE maternaly_reminders
             SET status = CASE WHEN status = 'scheduled' THEN 'cancelled' ELSE status END,
                 cancelled_at = CASE WHEN status = 'scheduled' THEN $2 ELSE cancelled_at END,
                 cancel_requested_at = CASE
                   WHEN status = 'processing' THEN COALESCE(cancel_requested_at, $2)
                   ELSE cancel_requested_at
                 END,
                 lease_token = CASE WHEN status = 'scheduled' THEN NULL ELSE lease_token END,
                 lease_expires_at = CASE
                   WHEN status = 'scheduled' THEN NULL
                   ELSE lease_expires_at
                 END,
                 updated_at = $2
             WHERE registration_id = $1
               AND reminder_id <> $3
               AND (
                 status = 'scheduled'
                 OR (status = 'processing' AND cancel_requested_at IS NULL)
               )`,
            [record.registrationId, record.updatedAt, existing.rows[0].reminder_id],
          );
          const reactivated = await client.query<MaternalyReminderRow>(
            `UPDATE maternaly_reminders
             SET conversation_id = $2, session_id = $3, session_starts_at = $4,
                 scheduled_for = $5, next_attempt_at = $6, phone_e164 = $7,
                 modality = $8, location = $9, address = $10, online_access = $11::jsonb,
                 status = 'scheduled', attempts = 0, max_attempts = $12,
                 lease_token = NULL, lease_expires_at = NULL,
                 provider_message_id = NULL, sent_at = NULL, cancelled_at = NULL,
                 cancel_requested_at = NULL, blocked_reason = NULL, last_error = NULL,
                 updated_at = $13
             WHERE reminder_id = $1
             RETURNING *`,
            [
              existing.rows[0].reminder_id,
              record.conversationId ?? null,
              record.sessionId,
              record.sessionStartsAt,
              record.scheduledFor,
              record.nextAttemptAt,
              record.phoneE164,
              record.modality,
              record.location,
              record.address ?? null,
              record.onlineAccess ? JSON.stringify(record.onlineAccess) : null,
              record.maxAttempts,
              record.updatedAt,
            ],
          );
          if (!reactivated.rows[0]) {
            throw new Error("Maternaly reminder reactivation did not return a row.");
          }
          return {
            reminder: mapRow(reactivated.rows[0]),
            created: true,
            supersededCount: superseded.rowCount ?? 0,
          };
        }
        return { reminder: mapRow(existing.rows[0]), created: false, supersededCount: 0 };
      }

      const superseded = await client.query(
        `UPDATE maternaly_reminders
         SET status = CASE WHEN status = 'scheduled' THEN 'cancelled' ELSE status END,
             cancelled_at = CASE WHEN status = 'scheduled' THEN $2 ELSE cancelled_at END,
             cancel_requested_at = CASE
               WHEN status = 'processing' THEN COALESCE(cancel_requested_at, $2)
               ELSE cancel_requested_at
             END,
             lease_token = CASE WHEN status = 'scheduled' THEN NULL ELSE lease_token END,
             lease_expires_at = CASE WHEN status = 'scheduled' THEN NULL ELSE lease_expires_at END,
             updated_at = $2
         WHERE registration_id = $1
           AND (
             status = 'scheduled'
             OR (status = 'processing' AND cancel_requested_at IS NULL)
           )`,
        [record.registrationId, record.createdAt],
      );
      const inserted = await client.query<MaternalyReminderRow>(
        `INSERT INTO maternaly_reminders (
          reminder_id, idempotency_key, registration_id, conversation_id, service_key,
          session_id, session_starts_at, scheduled_for, next_attempt_at, lead_hours,
          time_zone, phone_e164, modality, location, address, online_access, status,
          attempts, max_attempts, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20,$21
        ) RETURNING *`,
        [
          record.reminderId,
          record.idempotencyKey,
          record.registrationId,
          record.conversationId ?? null,
          record.serviceKey,
          record.sessionId,
          record.sessionStartsAt,
          record.scheduledFor,
          record.nextAttemptAt,
          record.leadHours,
          record.timeZone,
          record.phoneE164,
          record.modality,
          record.location,
          record.address ?? null,
          record.onlineAccess ? JSON.stringify(record.onlineAccess) : null,
          record.status,
          record.attempts,
          record.maxAttempts,
          record.createdAt,
          record.updatedAt,
        ],
      );
      if (!inserted.rows[0]) {
        throw new Error("Maternaly reminder insert did not return a row.");
      }
      return {
        reminder: mapRow(inserted.rows[0]),
        created: true,
        supersededCount: superseded.rowCount ?? 0,
      };
    });
  }

  async getById(reminderId: string): Promise<MaternalyReminderRecord | undefined> {
    const result = await this.pool.query<MaternalyReminderRow>(
      "SELECT * FROM maternaly_reminders WHERE reminder_id = $1",
      [reminderId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async getByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<MaternalyReminderRecord | undefined> {
    const result = await this.pool.query<MaternalyReminderRow>(
      "SELECT * FROM maternaly_reminders WHERE idempotency_key = $1",
      [idempotencyKey],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  async claimDue(input: ClaimDueMaternalyRemindersInput): Promise<MaternalyReminderRecord[]> {
    return this.withTransaction(async (client) => {
      await client.query(
        `UPDATE maternaly_reminders
         SET status = 'blocked', lease_token = NULL, lease_expires_at = NULL,
             blocked_reason = COALESCE(
               blocked_reason,
               'sending_lease_expired_requires_reconciliation'
             ),
             last_error = COALESCE(
               last_error,
               'sending_lease_expired_requires_reconciliation'
             ),
             updated_at = $1
         WHERE status = 'sending' AND lease_expires_at <= $1`,
        [input.now],
      );
      await client.query(
        `UPDATE maternaly_reminders
         SET status = CASE
               WHEN status = 'processing' AND cancel_requested_at IS NOT NULL
                 THEN 'cancelled'
               ELSE 'blocked'
             END,
             cancelled_at = CASE
               WHEN status = 'processing' AND cancel_requested_at IS NOT NULL
                 THEN cancel_requested_at
               ELSE cancelled_at
             END,
             blocked_reason = CASE
               WHEN status = 'processing' AND cancel_requested_at IS NOT NULL
                 THEN blocked_reason
               ELSE 'session_elapsed'
             END,
             last_error = CASE
               WHEN status = 'processing' AND cancel_requested_at IS NOT NULL
                 THEN last_error
               ELSE 'session_elapsed'
             END,
             lease_token = NULL, lease_expires_at = NULL, updated_at = $1
         WHERE status IN ('scheduled', 'processing')
           AND session_starts_at <= $1`,
        [input.now],
      );
      await client.query(
        `UPDATE maternaly_reminders
         SET status = 'cancelled', cancelled_at = COALESCE(cancel_requested_at, $1),
             lease_token = NULL, lease_expires_at = NULL, updated_at = $1
         WHERE status = 'processing'
           AND cancel_requested_at IS NOT NULL
           AND lease_expires_at <= $1`,
        [input.now],
      );
      await client.query(
        `UPDATE maternaly_reminders
         SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
             last_error = COALESCE(last_error, 'lease_expired_after_max_attempts'),
             updated_at = $1
         WHERE status = 'processing'
           AND lease_expires_at <= $1
           AND attempts >= max_attempts`,
        [input.now],
      );
      const due = await client.query<{ reminder_id: string }>(
        `SELECT reminder_id
         FROM maternaly_reminders
         WHERE (
           (status = 'scheduled' AND next_attempt_at <= $1)
           OR (
             status = 'processing'
             AND cancel_requested_at IS NULL
             AND lease_expires_at <= $1
           )
         )
           AND attempts < max_attempts
           AND session_starts_at > $1
         ORDER BY next_attempt_at ASC, reminder_id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [input.now, input.limit],
      );
      const records: MaternalyReminderRecord[] = [];
      for (const row of due.rows) {
        const leaseToken = crypto.randomUUID();
        const claimed = await client.query<MaternalyReminderRow>(
          `UPDATE maternaly_reminders
           SET status = 'processing', attempts = attempts + 1,
               lease_token = $2, lease_expires_at = $3, updated_at = $4
           WHERE reminder_id = $1
           RETURNING *`,
          [
            row.reminder_id,
            leaseToken,
            new Date(input.now.getTime() + input.leaseMs),
            input.now,
          ],
        );
        if (claimed.rows[0]) {
          records.push(mapRow(claimed.rows[0]));
        }
      }
      return records;
    });
  }

  async revalidateClaim(
    input: RevalidateMaternalyReminderClaimInput,
  ): Promise<MaternalyReminderRecord | undefined> {
    const result = await this.pool.query<MaternalyReminderRow>(
      `UPDATE maternaly_reminders
       SET status = CASE
             WHEN status = 'processing' AND cancel_requested_at IS NOT NULL THEN 'cancelled'
             WHEN status = 'processing' AND session_starts_at <= $3 THEN 'blocked'
             ELSE 'sending'
           END,
           cancelled_at = CASE
             WHEN status = 'processing' AND cancel_requested_at IS NOT NULL
               THEN cancel_requested_at
             ELSE cancelled_at
           END,
           lease_token = CASE
             WHEN status = 'processing'
               AND (cancel_requested_at IS NOT NULL OR session_starts_at <= $3)
               THEN NULL
             ELSE lease_token
           END,
           lease_expires_at = CASE
             WHEN status = 'processing'
               AND (cancel_requested_at IS NOT NULL OR session_starts_at <= $3)
               THEN NULL
             ELSE lease_expires_at
           END,
           blocked_reason = CASE
             WHEN status = 'processing'
               AND cancel_requested_at IS NULL
               AND session_starts_at <= $3
               THEN 'session_elapsed'
             ELSE blocked_reason
           END,
           last_error = CASE
             WHEN status = 'processing'
               AND cancel_requested_at IS NULL
               AND session_starts_at <= $3
               THEN 'session_elapsed'
             ELSE last_error
           END,
           updated_at = $3
       WHERE reminder_id = $1
         AND status IN ('processing', 'sending')
         AND lease_token = $2
       RETURNING *`,
      [input.reminderId, input.leaseToken, input.now],
    );
    const row = result.rows[0];
    if (!row || row.status !== "sending") {
      return undefined;
    }
    return mapRow(row);
  }

  async markSent(input: MarkMaternalyReminderSentInput): Promise<MaternalyReminderRecord> {
    return this.updateClaimed(
      `UPDATE maternaly_reminders
       SET status = 'sent', provider_message_id = $3, sent_at = $4,
           lease_token = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = $4
       WHERE reminder_id = $1 AND status = 'sending' AND lease_token = $2
       RETURNING *`,
      [input.reminderId, input.leaseToken, input.providerMessageId ?? null, input.sentAt],
    );
  }

  async markRetry(input: MarkMaternalyReminderRetryInput): Promise<MaternalyReminderRecord> {
    return this.updateClaimed(
      `UPDATE maternaly_reminders
       SET status = CASE
             WHEN status = 'processing' AND cancel_requested_at IS NOT NULL THEN 'cancelled'
             WHEN attempts >= max_attempts THEN 'failed'
             ELSE 'scheduled'
           END,
           cancelled_at = CASE
             WHEN status = 'processing' AND cancel_requested_at IS NOT NULL
               THEN cancel_requested_at
             ELSE cancelled_at
           END,
           next_attempt_at = $3, last_error = $4,
           lease_token = NULL, lease_expires_at = NULL, updated_at = $5
       WHERE reminder_id = $1
         AND status IN ('processing', 'sending')
         AND lease_token = $2
       RETURNING *`,
      [input.reminderId, input.leaseToken, input.retryAt, input.error, input.now],
    );
  }

  async markBlocked(input: MarkMaternalyReminderBlockedInput): Promise<MaternalyReminderRecord> {
    return this.updateClaimed(
      `UPDATE maternaly_reminders
       SET status = CASE
             WHEN status = 'processing' AND cancel_requested_at IS NOT NULL THEN 'cancelled'
             ELSE 'blocked'
           END,
           cancelled_at = CASE
             WHEN status = 'processing' AND cancel_requested_at IS NOT NULL
               THEN cancel_requested_at
             ELSE cancelled_at
           END,
           blocked_reason = CASE
             WHEN status = 'processing' AND cancel_requested_at IS NOT NULL THEN blocked_reason
             ELSE $3
           END,
           lease_token = NULL, lease_expires_at = NULL, updated_at = $4
       WHERE reminder_id = $1
         AND status IN ('processing', 'sending')
         AND lease_token = $2
       RETURNING *`,
      [input.reminderId, input.leaseToken, input.reason, input.now],
    );
  }

  async cancel(reminderId: string, now: Date): Promise<MaternalyReminderRecord> {
    const result = await this.pool.query<MaternalyReminderRow>(
      `UPDATE maternaly_reminders
       SET status = CASE WHEN status = 'scheduled' THEN 'cancelled' ELSE status END,
           cancelled_at = CASE WHEN status = 'scheduled' THEN $2 ELSE cancelled_at END,
           cancel_requested_at = CASE
             WHEN status = 'processing' THEN COALESCE(cancel_requested_at, $2)
             ELSE cancel_requested_at
           END,
           lease_token = CASE WHEN status = 'scheduled' THEN NULL ELSE lease_token END,
           lease_expires_at = CASE WHEN status = 'scheduled' THEN NULL ELSE lease_expires_at END,
           updated_at = $2
       WHERE reminder_id = $1 AND status IN ('scheduled', 'processing')
       RETURNING *`,
      [reminderId, now],
    );
    if (result.rows[0]) {
      return mapRow(result.rows[0]);
    }
    const existing = await this.getById(reminderId);
    if (!existing) {
      throw new Error(`Unknown Maternaly reminder: ${reminderId}`);
    }
    return existing;
  }

  async cancelPendingForRegistration(registrationId: string, now: Date): Promise<number> {
    const result = await this.pool.query(
      `UPDATE maternaly_reminders
       SET status = CASE WHEN status = 'scheduled' THEN 'cancelled' ELSE status END,
           cancelled_at = CASE WHEN status = 'scheduled' THEN $2 ELSE cancelled_at END,
           cancel_requested_at = CASE
             WHEN status = 'processing' THEN $2
             ELSE cancel_requested_at
           END,
           lease_token = CASE WHEN status = 'scheduled' THEN NULL ELSE lease_token END,
           lease_expires_at = CASE WHEN status = 'scheduled' THEN NULL ELSE lease_expires_at END,
           updated_at = $2
       WHERE registration_id = $1
         AND (
           status = 'scheduled'
           OR (status = 'processing' AND cancel_requested_at IS NULL)
         )`,
      [registrationId, now],
    );
    return result.rowCount ?? 0;
  }

  private async updateClaimed(sql: string, values: unknown[]): Promise<MaternalyReminderRecord> {
    const result = await this.pool.query<MaternalyReminderRow>(sql, values);
    if (!result.rows[0]) {
      throw new Error("Maternaly reminder claim is missing or owned by another worker.");
    }
    return mapRow(result.rows[0]);
  }

  private async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
