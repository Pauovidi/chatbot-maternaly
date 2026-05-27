import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationsPanel } from "./panel";
import { buildConversationSeed } from "@/lib/hotel/conversations/demo-seed";
import type {
  ConversationDashboard,
  ConversationRecord,
} from "@/lib/hotel/conversations/types";

function dashboardWith(conversation: ConversationRecord): ConversationDashboard {
  return {
    conversations: [conversation],
    stats: {
      total: 1,
      pending: conversation.humanRequested || conversation.unreadCount > 0 ? 1 : 0,
      human: conversation.mode === "human" ? 1 : 0,
      unread: conversation.unreadCount > 0 ? 1 : 0,
      read: conversation.unreadCount === 0 && !conversation.humanRequested ? 1 : 0,
    },
  };
}

describe("conversation panel operational UI", () => {
  it("shows only the human takeover action while the bot owns the conversation", () => {
    const conversation = {
      ...buildConversationSeed("2026-05-06T08:00:00.000Z").conversations[0],
      mode: "bot",
    } satisfies ConversationRecord;

    const html = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboardWith(conversation)} twilioProviderMode="sandbox" />,
    );

    expect(html).toContain("Tomar conversación");
    expect(html).not.toContain("Devolver al bot");
  });

  it("shows only the bot return action while a human owns the conversation", () => {
    const conversation = {
      ...buildConversationSeed("2026-05-06T08:00:00.000Z").conversations[0],
      mode: "human",
    } satisfies ConversationRecord;

    const html = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboardWith(conversation)} twilioProviderMode="sandbox" />,
    );

    expect(html).toContain("Devolver al bot");
    expect(html).not.toContain("Tomar conversación");
  });

  it("keeps technical provider status out of the main timeline banners", () => {
    const conversation = buildConversationSeed("2026-05-06T08:00:00.000Z").conversations[0];
    const html = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboardWith(conversation)} twilioProviderMode="sandbox" />,
    );

    expect(html).toContain("Estado técnico");
    expect(html).toContain("Proveedor: Twilio WhatsApp");
    expect(html).not.toContain("Twilio Sandbox activo para pruebas de WhatsApp.");
    expect(html).not.toContain("conversation-notice");
    expect(html.toLowerCase()).not.toContain("nif");
    expect(html.toLowerCase()).not.toContain("dni");
  });
});
