import { AdminDashboard } from "@/components/admin-dashboard";
import { SiteShell } from "@/components/site-shell";
import { getDemoDashboardData } from "@/lib/hotel/application";
import Link from "next/link";

export default async function AdminPage() {
  const dashboard = await getDemoDashboardData();

  return (
    <SiteShell>
      <section className="page-intro">
        <p className="demo-kicker">Pantalla 3</p>
        <h1 className="page-title">Panel admin de seguimiento</h1>
        <p className="page-description">
          Muestra reservas procesadas, estado operativo de mocks e integraciones y
          la cola de recordatorios 48 horas antes de la entrada.
        </p>
      </section>
      <section className="demo-panel admin-conversations-entry">
        <div>
          <p className="demo-kicker">Nuevo V0.1</p>
          <h2 className="demo-section-title">Panel de conversaciones WhatsApp</h2>
          <p className="page-description">
            Abre el inbox con conversaciones demo, handoff humano, modo bot y
            respuesta manual por Twilio WhatsApp en Mock, Sandbox o Real según configuración.
          </p>
        </div>
        <Link className="demo-button demo-button-primary" href="/admin/conversations">
          Abrir panel de conversaciones
        </Link>
      </section>
      <AdminDashboard dashboard={dashboard} />
    </SiteShell>
  );
}
