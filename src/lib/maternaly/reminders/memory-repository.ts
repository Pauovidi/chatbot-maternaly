import crypto from "node:crypto";
import type {
  ClaimDueMaternalyRemindersInput,
  MarkMaternalyReminderBlockedInput,
  MarkMaternalyReminderRetryInput,
  MarkMaternalyReminderSentInput,
  MaternalyReminderRecord,
  MaternalyReminderRepository,
  MaternalyReminderScheduleResult,
  RevalidateMaternalyReminderClaimInput,
} from "./types";

function clone(record: MaternalyReminderRecord): MaternalyReminderRecord {
  return structuredClone(record);
}

export class InMemoryMaternalyReminderRepository implements MaternalyReminderRepository {
  private readonly records = new Map<string, MaternalyReminderRecord>();
  private readonly idsByIdempotencyKey = new Map<string, string>();

  async schedule(record: MaternalyReminderRecord): Promise<MaternalyReminderScheduleResult> {
    const existingId = this.idsByIdempotencyKey.get(record.idempotencyKey);
    if (existingId) {
      const existing = this.records.get(existingId);
      if (!existing) {
        throw new Error("Maternaly reminder idempotency index is inconsistent.");
      }
      if (["cancelled", "failed", "blocked"].includes(existing.status)) {
        let supersededCount = 0;
        for (const [id, candidate] of this.records) {
          if (
            id === existing.reminderId ||
            candidate.registrationId !== record.registrationId ||
            !["scheduled", "processing"].includes(candidate.status) ||
            (candidate.status === "processing" && candidate.cancelRequestedAt)
          ) {
            continue;
          }
          this.records.set(
            id,
            candidate.status === "processing"
              ? {
                  ...candidate,
                  cancelRequestedAt: record.updatedAt,
                  updatedAt: record.updatedAt,
                }
              : {
                  ...candidate,
                  status: "cancelled",
                  cancelledAt: record.updatedAt,
                  leaseToken: undefined,
                  leaseExpiresAt: undefined,
                  updatedAt: record.updatedAt,
                },
          );
          supersededCount += 1;
        }
        const reactivated: MaternalyReminderRecord = {
          ...record,
          reminderId: existing.reminderId,
          idempotencyKey: existing.idempotencyKey,
          createdAt: existing.createdAt,
          updatedAt: record.updatedAt,
        };
        this.records.set(existing.reminderId, reactivated);
        return { reminder: clone(reactivated), created: true, supersededCount };
      }
      return { reminder: clone(existing), created: false, supersededCount: 0 };
    }

    let supersededCount = 0;
    for (const [id, candidate] of this.records) {
      if (
        candidate.registrationId === record.registrationId &&
        candidate.reminderId !== record.reminderId &&
        ["scheduled", "processing"].includes(candidate.status) &&
        !(candidate.status === "processing" && candidate.cancelRequestedAt)
      ) {
        this.records.set(
          id,
          candidate.status === "processing"
            ? {
                ...candidate,
                cancelRequestedAt: candidate.cancelRequestedAt ?? record.createdAt,
                updatedAt: record.createdAt,
              }
            : {
                ...candidate,
                status: "cancelled",
                cancelledAt: record.createdAt,
                leaseToken: undefined,
                leaseExpiresAt: undefined,
                updatedAt: record.createdAt,
              },
        );
        supersededCount += 1;
      }
    }

    this.records.set(record.reminderId, clone(record));
    this.idsByIdempotencyKey.set(record.idempotencyKey, record.reminderId);
    return { reminder: clone(record), created: true, supersededCount };
  }

  async getById(reminderId: string): Promise<MaternalyReminderRecord | undefined> {
    const record = this.records.get(reminderId);
    return record ? clone(record) : undefined;
  }

  async getByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<MaternalyReminderRecord | undefined> {
    const reminderId = this.idsByIdempotencyKey.get(idempotencyKey);
    return reminderId ? this.getById(reminderId) : undefined;
  }

  async claimDue(input: ClaimDueMaternalyRemindersInput): Promise<MaternalyReminderRecord[]> {
    const nowIso = input.now.toISOString();
    for (const [reminderId, record] of this.records) {
      if (
        record.status === "sending" &&
        record.leaseExpiresAt &&
        record.leaseExpiresAt <= nowIso
      ) {
        this.records.set(reminderId, {
          ...record,
          status: "blocked",
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          blockedReason: "sending_lease_expired_requires_reconciliation",
          lastError: "sending_lease_expired_requires_reconciliation",
          updatedAt: nowIso,
        });
        continue;
      }
      if (
        ["scheduled", "processing"].includes(record.status) &&
        record.sessionStartsAt <= nowIso
      ) {
        this.records.set(
          reminderId,
          record.status === "processing" && record.cancelRequestedAt
            ? {
                ...record,
                status: "cancelled",
                cancelledAt: record.cancelRequestedAt,
                leaseToken: undefined,
                leaseExpiresAt: undefined,
                updatedAt: nowIso,
              }
            : {
                ...record,
                status: "blocked",
                leaseToken: undefined,
                leaseExpiresAt: undefined,
                blockedReason: "session_elapsed",
                lastError: "session_elapsed",
                updatedAt: nowIso,
              },
        );
        continue;
      }
      if (
        record.status === "processing" &&
        record.cancelRequestedAt &&
        record.leaseExpiresAt &&
        record.leaseExpiresAt <= nowIso
      ) {
        this.records.set(reminderId, {
          ...record,
          status: "cancelled",
          cancelledAt: record.cancelRequestedAt,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          updatedAt: nowIso,
        });
        continue;
      }
      if (
        record.status === "processing" &&
        record.leaseExpiresAt &&
        record.leaseExpiresAt <= nowIso &&
        record.attempts >= record.maxAttempts
      ) {
        this.records.set(reminderId, {
          ...record,
          status: "failed",
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          lastError: record.lastError ?? "lease_expired_after_max_attempts",
          updatedAt: nowIso,
        });
      }
    }
    const candidates = [...this.records.values()]
      .filter((record) => {
        if (record.attempts >= record.maxAttempts) {
          return false;
        }
        if (record.status === "scheduled") {
          return record.nextAttemptAt <= nowIso;
        }
        return (
          record.status === "processing" &&
          !record.cancelRequestedAt &&
          Boolean(record.leaseExpiresAt && record.leaseExpiresAt <= nowIso)
        );
      })
      .sort((left, right) =>
        left.nextAttemptAt.localeCompare(right.nextAttemptAt) ||
        left.reminderId.localeCompare(right.reminderId),
      )
      .slice(0, Math.max(0, input.limit));

    return candidates.map((record) => {
      const claimed: MaternalyReminderRecord = {
        ...record,
        status: "processing",
        attempts: record.attempts + 1,
        leaseToken: crypto.randomUUID(),
        leaseExpiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString(),
        updatedAt: nowIso,
      };
      this.records.set(claimed.reminderId, claimed);
      return clone(claimed);
    });
  }

  async revalidateClaim(
    input: RevalidateMaternalyReminderClaimInput,
  ): Promise<MaternalyReminderRecord | undefined> {
    const record = this.records.get(input.reminderId);
    if (
      !record ||
      !["processing", "sending"].includes(record.status) ||
      record.leaseToken !== input.leaseToken
    ) {
      return undefined;
    }
    if (record.status === "sending") {
      return clone(record);
    }
    if (record.cancelRequestedAt) {
      this.replace({
        ...record,
        status: "cancelled",
        cancelledAt: record.cancelRequestedAt,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: input.now.toISOString(),
      });
      return undefined;
    }
    if (record.sessionStartsAt <= input.now.toISOString()) {
      this.replace({
        ...record,
        status: "blocked",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        blockedReason: "session_elapsed",
        lastError: "session_elapsed",
        updatedAt: input.now.toISOString(),
      });
      return undefined;
    }
    return this.replace({
      ...record,
      status: "sending",
      updatedAt: input.now.toISOString(),
    });
  }

  async markSent(input: MarkMaternalyReminderSentInput): Promise<MaternalyReminderRecord> {
    const record = this.requireClaim(input.reminderId, input.leaseToken, ["sending"]);
    return this.replace({
      ...record,
      status: "sent",
      providerMessageId: input.providerMessageId,
      sentAt: input.sentAt.toISOString(),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastError: undefined,
      updatedAt: input.sentAt.toISOString(),
    });
  }

  async markRetry(input: MarkMaternalyReminderRetryInput): Promise<MaternalyReminderRecord> {
    const record = this.requireClaim(input.reminderId, input.leaseToken, ["processing", "sending"]);
    if (record.status === "processing" && record.cancelRequestedAt) {
      return this.replace({
        ...record,
        status: "cancelled",
        cancelledAt: record.cancelRequestedAt,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: input.now.toISOString(),
      });
    }
    const terminal = record.attempts >= record.maxAttempts;
    return this.replace({
      ...record,
      status: terminal ? "failed" : "scheduled",
      nextAttemptAt: input.retryAt.toISOString(),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastError: input.error,
      updatedAt: input.now.toISOString(),
    });
  }

  async markBlocked(input: MarkMaternalyReminderBlockedInput): Promise<MaternalyReminderRecord> {
    const record = this.requireClaim(input.reminderId, input.leaseToken, [
      "processing",
      "sending",
    ]);
    if (record.status === "processing" && record.cancelRequestedAt) {
      return this.replace({
        ...record,
        status: "cancelled",
        cancelledAt: record.cancelRequestedAt,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        updatedAt: input.now.toISOString(),
      });
    }
    return this.replace({
      ...record,
      status: "blocked",
      blockedReason: input.reason,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: input.now.toISOString(),
    });
  }

  async cancel(reminderId: string, now: Date): Promise<MaternalyReminderRecord> {
    const record = this.records.get(reminderId);
    if (!record) {
      throw new Error(`Unknown Maternaly reminder: ${reminderId}`);
    }
    if (["sending", "sent", "cancelled", "blocked", "failed"].includes(record.status)) {
      return clone(record);
    }
    return this.replace(
      record.status === "processing"
        ? {
            ...record,
            cancelRequestedAt: record.cancelRequestedAt ?? now.toISOString(),
            updatedAt: now.toISOString(),
          }
        : {
            ...record,
            status: "cancelled",
            cancelledAt: now.toISOString(),
            leaseToken: undefined,
            leaseExpiresAt: undefined,
            updatedAt: now.toISOString(),
          },
    );
  }

  async cancelPendingForRegistration(registrationId: string, now: Date): Promise<number> {
    let cancelled = 0;
    for (const [reminderId, record] of this.records) {
      if (
        record.registrationId !== registrationId ||
        !["scheduled", "processing"].includes(record.status) ||
        (record.status === "processing" && Boolean(record.cancelRequestedAt))
      ) {
        continue;
      }
      this.records.set(
        reminderId,
        record.status === "processing"
          ? {
              ...record,
              cancelRequestedAt: record.cancelRequestedAt ?? now.toISOString(),
              updatedAt: now.toISOString(),
            }
          : {
              ...record,
              status: "cancelled",
              cancelledAt: now.toISOString(),
              leaseToken: undefined,
              leaseExpiresAt: undefined,
              updatedAt: now.toISOString(),
            },
      );
      cancelled += 1;
    }
    return cancelled;
  }

  list(): MaternalyReminderRecord[] {
    return [...this.records.values()].map(clone);
  }

  private requireClaim(
    reminderId: string,
    leaseToken: string,
    allowedStatuses: MaternalyReminderRecord["status"][],
  ): MaternalyReminderRecord {
    const record = this.records.get(reminderId);
    if (!record) {
      throw new Error(`Unknown Maternaly reminder: ${reminderId}`);
    }
    if (!allowedStatuses.includes(record.status) || record.leaseToken !== leaseToken) {
      throw new Error(`Maternaly reminder ${reminderId} is not owned by this worker.`);
    }
    return record;
  }

  private replace(record: MaternalyReminderRecord): MaternalyReminderRecord {
    this.records.set(record.reminderId, record);
    return clone(record);
  }
}
