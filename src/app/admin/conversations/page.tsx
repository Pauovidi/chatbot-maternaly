import { ConversationsPanel } from "./panel";
import { SiteShell } from "@/components/site-shell";
import { verifyPanelPageAccess } from "@/lib/hotel/conversations/auth";
import {
  createEmptyConversationDashboard,
  listConversationDashboard,
} from "@/lib/hotel/conversations/service";
import {
  buildConversationStoreErrorMessage,
  logConversationStoreFailure,
} from "@/lib/hotel/conversations/store-diagnostics";
import {
  isMaternalyEntryRegistryVisible,
  readMaternalyRuntimeConfig,
} from "@/lib/maternaly/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ConversationsAdminPage() {
  const auth = await verifyPanelPageAccess();

  if (!auth.ok) {
    return (
      <SiteShell>
        <section className="page-intro">
          <p className="demo-kicker">Panel protegido</p>
          <h1 className="page-title">Panel de conversaciones Maternaly</h1>
          <p className="page-description">
            Configura PANEL_ADMIN_USERNAME y PANEL_ADMIN_PASSWORD para acceder al
            panel de conversaciones en producción.
          </p>
        </section>
      </SiteShell>
    );
  }

  let dashboard = createEmptyConversationDashboard();
  let initialLoadError: string | undefined;
  try {
    dashboard = await listConversationDashboard();
  } catch (error) {
    initialLoadError = buildConversationStoreErrorMessage();
    logConversationStoreFailure(error, "admin_conversations_page");
  }
  const runtimeConfig = readMaternalyRuntimeConfig();
  const initialLastUpdatedAt = new Date().toISOString();

  return (
    <SiteShell compact>
      <section className="page-intro conversation-page-intro">
        <p className="demo-kicker">Operaciones Maternaly</p>
        <h1 className="page-title">Panel de conversaciones Maternaly</h1>
        <p className="page-description">
          Centraliza WhatsApp, handoffs del bot, servicio detectado, Sheet origen, reserva, pago y factura.
        </p>
      </section>
      <ConversationsPanel
        initialDashboard={dashboard}
        initialLastUpdatedAt={initialLastUpdatedAt}
        initialLoadError={initialLoadError}
        llmProvider={runtimeConfig.llmProvider}
        sheetsAccessMode={runtimeConfig.sheetsAccessMode}
        sheetsWriteEnabled={runtimeConfig.liveSheetsWriteEnabled}
        whatsAppProviderMode={runtimeConfig.whatsappProvider}
        entryRegistryVisible={isMaternalyEntryRegistryVisible()}
      />
    </SiteShell>
  );
}
