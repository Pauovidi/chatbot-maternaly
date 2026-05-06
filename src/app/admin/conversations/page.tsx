import { ConversationsPanel } from "./panel";
import { SiteShell } from "@/components/site-shell";
import { verifyPanelPageAccess } from "@/lib/hotel/conversations/auth";
import { listConversationDashboard } from "@/lib/hotel/conversations/service";

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
            panel de conversaciones en produccion.
          </p>
        </section>
      </SiteShell>
    );
  }

  const dashboard = await listConversationDashboard();

  return (
    <SiteShell>
      <section className="page-intro">
        <p className="demo-kicker">Operaciones</p>
        <h1 className="page-title">Panel de conversaciones</h1>
        <p className="page-description">
          Inbox de WhatsApp para revisar handoffs, alternar bot/persona y enviar
          respuestas manuales sin tocar el flujo validado de reservas.
        </p>
      </section>
      <ConversationsPanel initialDashboard={dashboard} />
    </SiteShell>
  );
}
