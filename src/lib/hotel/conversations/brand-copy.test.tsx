import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { demoNavItems } from "@/components/demo-data";
import { ConversationsPanel } from "@/app/admin/conversations/panel";
import { buildConversationSeed } from "./demo-seed";
import type { ConversationDashboard } from "./types";

function readSurface(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function forbiddenReferenceCopyPatterns() {
  const brand = String.fromCharCode(77, 117, 100, 97, 110, 122, 97, 115);
  const shortBrand = String.fromCharCode(77, 70, 77);

  return [
    new RegExp(`\\b${brand}FM\\b`, "i"),
    new RegExp(`\\bSoporte${brand}FM\\b`, "i"),
    new RegExp(`\\b${shortBrand}\\b`),
    new RegExp(`\\b${brand.toLowerCase()}s?\\b`, "i"),
    /\benv[ií]o\b/i,
  ];
}

describe("conversations panel visible demo copy", () => {
  it("exposes the conversations panel from demo navigation data", () => {
    expect(demoNavItems).toContainEqual({
      href: "/admin/conversations",
      label: "Conversaciones",
    });
    expect(readSurface("src/components/public-site-header.tsx")).toContain(
      "Panel conversaciones",
    );
    expect(readSurface("src/app/admin/page.tsx")).toContain(
      "Abrir panel de conversaciones",
    );
  });

  it("renders a non-empty Somos Muy Perros inbox with mock WhatsApp notice", () => {
    const conversations = buildConversationSeed("2026-05-06T08:00:00.000Z").conversations;
    const dashboard: ConversationDashboard = {
      conversations,
      stats: {
        total: conversations.length,
        pending: conversations.filter(
          (conversation) => conversation.humanRequested || conversation.unreadCount > 0,
        ).length,
        human: conversations.filter((conversation) => conversation.mode === "human").length,
        unread: conversations.filter((conversation) => conversation.unreadCount > 0).length,
        read: conversations.filter(
          (conversation) => conversation.unreadCount === 0 && !conversation.humanRequested,
        ).length,
      },
    };

    const html = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboard} twilioProviderMode="mock" />,
    );

    expect(html).toContain("Somos Muy Perros");
    expect(html).toContain("Panel conversaciones");
    expect(html).toContain("Inbox WhatsApp");
    expect(html).toContain("Proveedor: Twilio WhatsApp");
    expect(html).toContain("Mock");
    expect(html).toContain("Pendientes");
    expect(html).toContain("En humano");
    expect(html).toContain("Todas");
    expect(html).toContain("Marta R.");
    expect(html).toContain("Mascota: Luna");
    expect(html).toContain("Respuesta manual del equipo");
    expect(html).toContain("Modo demo: los mensajes no se envían por WhatsApp real.");
    expect(html).not.toContain("No hay conversaciones para este filtro");
  });

  it("renders sandbox and real Twilio provider states without changing provider", () => {
    const conversations = buildConversationSeed("2026-05-06T08:00:00.000Z").conversations;
    const dashboard: ConversationDashboard = {
      conversations,
      stats: {
        total: conversations.length,
        pending: 0,
        human: 0,
        unread: 0,
        read: conversations.length,
      },
    };
    const sandbox = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboard} twilioProviderMode="sandbox" />,
    );
    const real = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboard} twilioProviderMode="real" />,
    );

    expect(sandbox).toContain("Proveedor: Twilio WhatsApp");
    expect(sandbox).toContain("Sandbox");
    expect(sandbox).toContain("Twilio Sandbox activo para pruebas de WhatsApp.");
    expect(real).toContain("Proveedor: Twilio WhatsApp");
    expect(real).toContain("Real");
    expect(real).toContain("Twilio real activo para respuestas manuales.");
  });

  it("renders client directory badges without exposing NIF", () => {
    const conversations = buildConversationSeed("2026-05-06T08:00:00.000Z").conversations;
    conversations[0] = {
      ...conversations[0],
      clientStatus: "known",
      clientConfidence: "strong",
      clientName: "Cliente Habitual",
      clientEmail: "cliente@example.com",
      clientSource: "google_sheets_client_directory",
      clientSheetName: "CLIENTES",
      clientSheetRow: 2,
      clientWarnings: [],
    };
    conversations[1] = {
      ...conversations[1],
      clientStatus: "blocked",
      clientWarnings: ["NO COGER RESERVA"],
      requiresManualReview: true,
    };
    const dashboard: ConversationDashboard = {
      conversations,
      stats: {
        total: conversations.length,
        pending: 1,
        human: 1,
        unread: 1,
        read: conversations.length - 1,
      },
    };

    const html = renderToStaticMarkup(
      <ConversationsPanel initialDashboard={dashboard} twilioProviderMode="mock" />,
    );

    expect(html).toContain("Cliente habitual");
    expect(html).toContain("Nuevo contacto");
    expect(html).toContain("Directorio");
    expect(html).toContain("CLIENTES · fila 2");
    expect(html).toContain("cliente@example.com");
    expect(html).not.toContain("NIF");
    expect(html.toLowerCase()).not.toContain("dni");
  });


  it("does not expose reference moving-company copy in user-facing panel surfaces", () => {
    const surfaces = [
      "src/app/admin/conversations/page.tsx",
      "src/app/admin/conversations/panel.tsx",
      "src/components/demo-data.ts",
      "src/components/public-site-header.tsx",
      "src/components/site-shell.tsx",
      "src/lib/hotel/conversations/demo-seed.ts",
      "docs/CONVERSATIONS_PANEL_V0.md",
      "docs/TWILIO_WHATSAPP_REAL_V0.md",
    ]
      .map(readSurface)
      .join("\n");

    for (const pattern of forbiddenReferenceCopyPatterns()) {
      expect(surfaces).not.toMatch(pattern);
    }
  });
});
