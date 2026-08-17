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
    service_scope: service_candidate ? "explicit" : "unknown",
    service_candidate,
    service_question_focus: "general",
    needs_availability_lookup: false,
    confidence: 0.95,
    missing_fields: [],
    should_handoff: false,
    safety_flags: [],
  };
}

function onlineCatalogIntent(): StructuredIntent {
  return {
    ...intent(),
    intent: "service_discovery",
    service_scope: "catalog",
    slots: { modality: "online" },
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
        prefaceText: "Te paso la información del taller BLW para que sepas en qué consiste.",
      }),
    ]);
  });

  it("waits for a concrete service before attaching a poster to a catalog question", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation(),
      inboundText: "¿Qué servicios ofrecéis?",
      intent: intent(),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([]);
  });

  it("does not attach posters to a one-word services question", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation(),
      inboundText: "servicios",
      intent: intent(),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([]);
  });

  it("does not repeat a poster already dispatched in the same conversation", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation([
        {
          id: "evt_media",
          conversationId: "conversation_media",
          eventType: "maternaly_service_media_dispatched",
          payload: { serviceId: "taller_blw", triggerKind: "explicit_service" },
          createdAt: "2026-07-16T10:00:00.000Z",
        },
      ]),
      inboundText: "¿Cuánto cuesta el BLW?",
      intent: intent("taller_blw"),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([]);
  });

  it.each([
    "maternaly_service_media_dispatch_attempted",
    "maternaly_service_media_dispatch_failed",
  ])("retries a poster after %s without a queued confirmation", (eventType) => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation([
        {
          id: `evt_${eventType}`,
          conversationId: "conversation_media",
          eventType,
          payload: {
            serviceId: "taller_blw",
            triggerKind: "explicit_service",
            messageId: "msg_media_attempt",
          },
          createdAt: "2026-07-16T10:00:00.000Z",
        },
      ]),
      inboundText: "Quiero información del taller BLW",
      intent: intent("taller_blw"),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([
      expect.objectContaining({
        serviceId: "taller_blw",
        triggerKind: "explicit_service",
      }),
    ]);
  });

  it.each([
    "¿Qué servicios online tenéis?",
    "Además del BLW, ¿qué opciones online tenéis?",
  ])("does not attach media before a service is selected for '%s'", (inboundText) => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation(),
      inboundText,
      intent: onlineCatalogIntent(),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([]);
  });

  it("does not attach a stale service poster to a greeting", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: {
        ...conversation(),
        maternalyNormalizedFlow: {
          serviceKey: "taller_blw",
          stage: "collecting_contact",
          updatedAt: "2026-07-16T10:00:00.000Z",
        },
      },
      inboundText: "hola",
      intent: { ...intent(), intent: "greeting" },
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([]);
  });

  it("allows the first explicit poster to be sent again after a reset", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: {
        ...conversation([
          {
            id: "evt_media_before_reset",
            conversationId: "conversation_media",
            eventType: "maternaly_service_media_dispatched",
            payload: { serviceId: "taller_blw", triggerKind: "explicit_service" },
            createdAt: "2026-07-16T10:00:00.000Z",
          },
        ]),
        messages: [
          {
            id: "msg_reset",
            conversationId: "conversation_media",
            direction: "inbound",
            senderType: "user",
            transport: "whatsapp",
            body: "reiniciar",
            createdAt: "2026-07-16T10:05:00.000Z",
          },
        ],
      },
      inboundText: "taller blw",
      intent: intent("taller_blw"),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([
      expect.objectContaining({
        serviceId: "taller_blw",
        triggerKind: "explicit_service",
      }),
    ]);
  });

  it("retries an explicit poster after a legacy event without reliable trigger metadata", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation([
        {
          id: "evt_media_legacy",
          conversationId: "conversation_media",
          eventType: "maternaly_service_media_dispatched",
          payload: { serviceId: "taller_blw" },
          createdAt: "2026-07-16T10:00:00.000Z",
        },
      ]),
      inboundText: "taller blw",
      intent: intent("taller_blw"),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([
      expect.objectContaining({
        serviceId: "taller_blw",
        triggerKind: "explicit_service",
      }),
    ]);
  });

  it("retries the BLW poster when an older catalog event falsely marked it as dispatched", () => {
    const media = resolveMaternalyServiceMedia({
      conversation: conversation([
        {
          id: "evt_media_old_catalog",
          conversationId: "conversation_media",
          eventType: "maternaly_service_media_dispatched",
          payload: { serviceId: "taller_blw", triggerKind: "catalog" },
          createdAt: "2026-07-16T10:00:00.000Z",
        },
      ]),
      inboundText: "taller blw",
      intent: intent("taller_blw"),
      appBaseUrl: "https://maternaly.example.test",
    });

    expect(media).toEqual([
      expect.objectContaining({
        serviceId: "taller_blw",
        triggerKind: "explicit_service",
        url: "https://maternaly.example.test/maternaly/services/taller-blw.jpeg",
      }),
    ]);
  });
});
