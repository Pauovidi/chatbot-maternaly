import crypto from "node:crypto";
import type { GoogleSheetsAccessMode } from "@/lib/maternaly/config/env";
import { readMaternalyRuntimeConfig } from "@/lib/maternaly/config/env";
import type { ReservationDraft } from "@/lib/maternaly/domain/types";

export interface ReservationWritePlan {
  operation: "append" | "update" | "noop";
  sheet_id: string;
  tab?: string;
  range?: string;
  row?: number;
  fields: string[];
  values: Record<string, string | number | undefined>;
  reason: string;
  risk_level: "low" | "medium" | "high" | "blocked";
  requires_manual_review: boolean;
  idempotency_key: string;
}

export interface ReservationWriteResult {
  ok: boolean;
  mode: GoogleSheetsAccessMode | "mock";
  applied: boolean;
  plan: ReservationWritePlan;
  blockedReason?: string;
}

export interface SheetWriteAuditLog {
  at: string;
  idempotencyKey: string;
  operation: ReservationWritePlan["operation"];
  applied: boolean;
  reason: string;
}

export interface SafeWriteTarget {
  sheetId: string;
  tab?: string;
  range?: string;
  safeColumnsIdentified: boolean;
  ambiguousSchema?: boolean;
}

function hasRequiredReservationFields(draft: ReservationDraft): boolean {
  return Boolean(
    draft.serviceId &&
      draft.sessionId &&
      draft.phone &&
      draft.peopleCount &&
      (draft.date || draft.startTime),
  );
}

export function buildReservationIdempotencyKey(draft: ReservationDraft): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        draft.phone,
        draft.serviceId,
        draft.sessionId,
        draft.date,
        draft.startTime,
        draft.peopleCount,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

export class ReservationWriteValidator {
  validate(plan: ReservationWritePlan, target: SafeWriteTarget, draft: ReservationDraft): string[] {
    const errors: string[] = [];
    const config = readMaternalyRuntimeConfig();

    if (config.sheetsAccessMode === "read_only") {
      errors.push("GOOGLE_SHEETS_ACCESS_MODE=read_only blocks writes.");
    }

    if (!config.liveSheetsWriteEnabled) {
      errors.push("BOT_SHEETS_LIVE_WRITE_ENABLED is not true.");
    }

    if (config.sheetsAccessMode !== "live") {
      errors.push("GOOGLE_SHEETS_ACCESS_MODE is not live.");
    }

    if (!target.safeColumnsIdentified) {
      errors.push("Adapter has not identified safe writable columns.");
    }

    if (target.ambiguousSchema) {
      errors.push("Sheet schema is ambiguous.");
    }

    if (!hasRequiredReservationFields(draft)) {
      errors.push("Missing service, session, contact, date/time or people count.");
    }

    if (plan.risk_level === "blocked") {
      errors.push(plan.reason);
    }

    return errors;
  }
}

export class ReservationWriteService {
  private readonly appliedKeys = new Set<string>();

  constructor(private readonly validator = new ReservationWriteValidator()) {}

  buildPlan(draft: ReservationDraft, target: SafeWriteTarget): ReservationWritePlan {
    const idempotencyKey = buildReservationIdempotencyKey(draft);
    const fields = [
      "status",
      "service",
      "session",
      "contact_name",
      "phone",
      "email",
      "people_count",
      "pregnancy_week",
      "observations",
      "idempotency_key",
    ];

    return {
      operation: target.safeColumnsIdentified ? "append" : "noop",
      sheet_id: target.sheetId,
      tab: target.tab ?? "TEST_BOT_WRITES",
      range: target.range,
      fields,
      values: {
        status: "reservation_pending",
        service: draft.serviceName ?? draft.serviceId,
        session: draft.sessionId,
        contact_name: draft.contactName,
        phone: draft.phone,
        email: draft.email,
        people_count: draft.peopleCount,
        pregnancy_week: draft.pregnancyWeek,
        observations: draft.observations,
        idempotency_key: idempotencyKey,
      },
      reason: target.safeColumnsIdentified
        ? "Dry-run append prepared for a safe target."
        : "No safe write target identified.",
      risk_level: target.safeColumnsIdentified ? "medium" : "blocked",
      requires_manual_review: !target.safeColumnsIdentified || Boolean(target.ambiguousSchema),
      idempotency_key: idempotencyKey,
    };
  }

  dryRun(draft: ReservationDraft, target: SafeWriteTarget): ReservationWriteResult {
    const plan = this.buildPlan(draft, target);
    const config = readMaternalyRuntimeConfig();
    const errors = this.validator.validate(plan, target, draft);

    return {
      ok: config.sheetsAccessMode === "dry_run" || errors.length === 0,
      mode: config.sheetsAccessMode,
      applied: false,
      plan,
      blockedReason: errors.join(" | ") || undefined,
    };
  }

  applyToMock(draft: ReservationDraft, target: SafeWriteTarget): ReservationWriteResult {
    const plan = this.buildPlan(draft, target);
    const requiredErrors = this.validator
      .validate(plan, target, draft)
      .filter((error) => !error.includes("GOOGLE_SHEETS_ACCESS_MODE") && !error.includes("BOT_SHEETS"));

    if (requiredErrors.length > 0) {
      return {
        ok: false,
        mode: "mock",
        applied: false,
        plan,
        blockedReason: requiredErrors.join(" | "),
      };
    }

    if (this.appliedKeys.has(plan.idempotency_key)) {
      return {
        ok: true,
        mode: "mock",
        applied: false,
        plan,
        blockedReason: "Duplicate idempotency key ignored.",
      };
    }

    this.appliedKeys.add(plan.idempotency_key);
    return {
      ok: true,
      mode: "mock",
      applied: true,
      plan,
    };
  }
}
