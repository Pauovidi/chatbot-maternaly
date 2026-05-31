import { afterEach, describe, expect, it, vi } from "vitest";
import { ReservationWriteService } from "./write";

const draft = {
  serviceId: "aipap_agua",
  serviceName: "AIPAP Agua",
  sessionId: "session-1",
  date: "2026-06-15",
  startTime: "10:00",
  phone: "+34600000123",
  peopleCount: 1,
};

const safeTarget = {
  sheetId: "sheet-1",
  tab: "TEST_BOT_WRITES",
  safeColumnsIdentified: true,
};

describe("ReservationWriteService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks write in read_only", () => {
    vi.stubEnv("GOOGLE_SHEETS_ACCESS_MODE", "read_only");
    const result = new ReservationWriteService().dryRun(draft, safeTarget);
    expect(result.applied).toBe(false);
    expect(result.blockedReason).toContain("read_only");
  });

  it("blocks live write when live flag is false", () => {
    vi.stubEnv("GOOGLE_SHEETS_ACCESS_MODE", "live");
    vi.stubEnv("BOT_SHEETS_LIVE_WRITE_ENABLED", "false");
    const result = new ReservationWriteService().dryRun(draft, safeTarget);
    expect(result.blockedReason).toContain("BOT_SHEETS_LIVE_WRITE_ENABLED");
  });

  it("blocks ambiguous schema", () => {
    vi.stubEnv("GOOGLE_SHEETS_ACCESS_MODE", "dry_run");
    const result = new ReservationWriteService().dryRun(draft, {
      ...safeTarget,
      ambiguousSchema: true,
    });
    expect(result.blockedReason).toContain("ambiguous");
  });

  it("returns a dry-run WritePlan", () => {
    vi.stubEnv("GOOGLE_SHEETS_ACCESS_MODE", "dry_run");
    const result = new ReservationWriteService().dryRun(draft, safeTarget);
    expect(result.applied).toBe(false);
    expect(result.plan.operation).toBe("append");
    expect(result.plan.idempotency_key).toHaveLength(32);
  });

  it("mock write does not duplicate idempotency key", () => {
    vi.stubEnv("GOOGLE_SHEETS_ACCESS_MODE", "dry_run");
    const service = new ReservationWriteService();
    expect(service.applyToMock(draft, safeTarget).applied).toBe(true);
    const duplicate = service.applyToMock(draft, safeTarget);
    expect(duplicate.applied).toBe(false);
    expect(duplicate.blockedReason).toContain("Duplicate");
  });
});
