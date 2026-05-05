import { AdminDashboard } from "@/components/admin-dashboard";
import { SiteShell } from "@/components/site-shell";
import { getDemoDashboardData } from "@/lib/hotel/application";

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
      <AdminDashboard dashboard={dashboard} />
    </SiteShell>
  );
}
