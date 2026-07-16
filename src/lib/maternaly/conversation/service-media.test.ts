import { describe, expect, it } from "vitest";
import type { ConversationRecord } from "@/lib/hotel/conversations/types";
import type { StructuredIntent } from "@/lib/maternaly/llm/interpreter";
import { resolveMaternalyServiceMedia } from "./service-media";

function conversation(events: ConversationRecord["events"] = []): ConversationRecord {
  const now = "2026-07-16T10:00:00.000Z";
  return {
    id: "conversation_media",
    phoneE164: "+34600000123",
    phoneNormalized: "34600000123",
    sourceType: "whatsapp",
    status: "open",
    mode: "bot",
    humanRequested: false,
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
    messages: [],
    events,
  };
}

function intent(service_candidate?: string): StructuredIntent {
  return {
    intent: "service_question",
    slots: {},
    service_candidate,
    service_question_focus: "general",
    needs_availability_lookup: false,
    confidence: 0.95,
    missing_fields: [],
    should_handoff: false,
    safety_flags: [],
  };
}

describe("Maternaly service media", () => {
  it("attaches the matching poster on the first response about BLW", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation(),
      inboundText: "Quiero información del taller BLW",
      intent: intent("taller_blw"),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([
      expect.objectContaining({
        serviceId: "taller_blw",
        url: "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
      }),
    ]);
  });

  it("attaches both active service posters for a services catalog question", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation(),
      inboundText: "¿Qué servicios ofrecéis?",
      intent: intent(),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media.map((item) => item.serviceId)).toEqual([
      "charla_embarazo_1_20",
      "taller_blw",
    ]);
  });

  it("recognizes a one-word services question as the active catalog", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation(),
      inboundText: "servicios",
      intent: intent(),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media.map((item) => item.serviceId)).toEqual([
      "charla_embarazo_1_20",
      "taller_blw",
    ]);
  });

  it("does not repeat a poster already dispatched in the same conversation", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation([
        {
          id: "evt_media",
          conversationId: "conversation_media",
          eventType: "maternaly_service_media_dispatched",
          payload: { serviceId: "taller_blw" },
          createdAt: "2026-07-16T10:00:00.000Z",
        },
      ]),
      inboundText: "¿Cuánto cuesta el BLW?",
      intent: intent("taller_blw"),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([]);
  });
});
