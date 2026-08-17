import { describe, expect, it } from "vitest";
import {
  buildConfirmedCharlaReminderInput,
  madridSessionStartsAt,
} from "./charla-integration";
import type { NormalizedAvailableSession } from "@/lib/maternaly/sheets/normalized-availability";

function session(
  overrides: Partial<NormalizedAvailableSession> = {},
): NormalizedAvailableSession {
  return {
    serviceKey: "charla_embarazo_1_20",
    serviceLabel: "Charla Informativa",
    groupId: "grupo_online",
    groupName: "Online",
    sessionId: "sesion_online_20261005",
    sessionName: "Charla online",
    location: "Online",
    modality: "online",
    date: "2026-10-05",
    startTime: "19:00",
    occupied: 0,
    full: false,
    availabilityStatus: "unlimited",
    ...overrides,
  };
}

describe("Charla reminder integration", () => {
  it("uses the Europe/Madrid daylight-saving offset", () => {
    expect(madridSessionStartsAt("2026-10-05", "19:00")).toBe(
      "2026-10-05T17:00:00.000Z",
    );
    expect(madridSessionStartsAt("2026-12-15", "17:00")).toBe(
      "2026-12-15T16:00:00.000Z",
    );
  });

  it("builds online access from trusted session columns and derives the meeting id", () => {
    const result = buildConfirmedCharlaReminderInput({
      registrationId: "INS_BOT_123",
      session: session({
        onlineJoinUrl: "https://us06web.zoom.us/j/987654321",
        onlineAccessCode: "246810",
      }),
      phoneE164: "+34600111222",
      conversationId: "conv_123",
      now: new Date("2026-08-17T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      registrationId: "INS_BOT_123",
      sessionStartsAt: "2026-10-05T17:00:00.000Z",
      modality: "online",
      onlineAccess: {
        joinUrl: "https://us06web.zoom.us/j/987654321",
        meetingId: "987654321",
        passcode: "246810",
      },
    });
  });

  it("uses the reviewed physical address for a presencial session", () => {
    const result = buildConfirmedCharlaReminderInput({
      registrationId: "INS_BOT_456",
      session: session({
        groupId: "grupo_erandio",
        sessionId: "sesion_erandio_20260924",
        groupName: "Erandio",
        sessionName: "Charla Erandio",
        location: "Erandio",
        modality: "presencial",
        date: "2026-09-24",
        startTime: "18:30",
      }),
      phoneE164: "+34600111222",
      now: new Date("2026-08-17T10:00:00.000Z"),
    });

    expect(result.address).toContain("José Luis Goyoaga 32");
    expect(result.onlineAccess).toBeUndefined();
  });
});
