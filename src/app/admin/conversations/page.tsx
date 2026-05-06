import { ConversationsPanel } from "./panel";
import { SiteShell } from "@/components/site-shell";
import { verifyPanelPageAccess } from "@/lib/hotel/conversations/auth";
import { listConversationDashboard } from "@/lib/hotel/conversations/service";
import { readTwilioWhatsAppConfig } from "@/lib/hotel/twilio/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ConversationsAdminPage() {
  const auth = await verifyPanelPageAccess();

  if (!auth.ok) {
    return (
      <SiteShell>
        <section className="page-intro">
          <p className="demo-kicker">Panel protegido</p>
          <h1 className="page-title">Conversaciones</h1>
          <p className="page-description">
            Configura HOTEL_PANEL_USERNAME y HOTEL_PANEL_PASSWORD para acceder al
            panel de conversaciones en producción.
          </p>
        </section>
      </SiteShell>
    );
  }

  const dashboard = await listConversationDashboard();
  const twilioConfig = readTwilioWhatsAppConfig();

  return (
    <SiteShell>
      <section className="page-intro">
        <p className="demo-kicker">Operaciones</p>
        <h1 className="page-title">Panel de conversaciones</h1>
        <p className="page-description">
          Centraliza WhatsApp, handoffs del bot y contexto de reservas en un
          único inbox operativo del equipo Somos Muy Perros.
        </p>
      </section>
      <ConversationsPanel
        initialDashboard={dashboard}
        twilioMode={twilioConfig.mock ? "mock" : "real"}
      />
    </SiteShell>
  );
}
