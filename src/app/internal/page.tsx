import Link from "next/link";
import { AdminDashboard } from "@/components/admin-dashboard";
import { ReservationLab } from "@/components/reservation-lab";
import { SiteShell } from "@/components/site-shell";
import { demoFormUrl, demoSampleEmails } from "@/components/demo-data";
import { verifyPanelPageAccess } from "@/lib/hotel/conversations/auth";
import { getDemoDashboardData } from "@/lib/hotel/application/dashboard";

const realForwardSample = demoSampleEmails.find(
  (sample) => sample.id === "real-forward",
) ?? demoSampleEmails[0];

const realForwardHighlights = realForwardSample.content
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("Fecha entrada:") || line.startsWith("Fecha salida:"));

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InternalOpsPage() {
  const auth = await verifyPanelPageAccess();
  if (!auth.ok) {
    return (
      <SiteShell>
        <section className="page-intro">
          <p className="demo-kicker">Zona protegida</p>
          <h1 className="page-title">Operaciones internas</h1>
          <p className="page-description">
            Configura credenciales de panel para acceder a esta vista en produccion.
          </p>
        </section>
      </SiteShell>
    );
  }

  const dashboard = await getDemoDashboardData();

  return (
    <SiteShell>
      <section className="page-intro">
        <p className="demo-kicker">Zona interna secundaria</p>
        <h1 className="page-title">Operaciones: parser, disponibilidad y admin</h1>
        <p className="page-description">
          Esta vista concentra el flujo operativo para enseñar cómo entra un email,
          cómo se clasifica la solicitud y cómo se cruza con disponibilidad y
          seguimiento interno. No es la cara pública del producto.
        </p>
        <div className="hero-actions">
          <Link className="demo-button demo-button-primary" href="/reservas-demo">
            Abrir laboratorio de reservas
          </Link>
          <Link className="demo-button demo-button-secondary" href="/admin">
            Ver panel admin
          </Link>
          <a className="demo-button demo-button-secondary" href={demoFormUrl}>
            Formulario web
          </a>
        </div>
      </section>

      <section className="demo-grid demo-grid-2">
        <article className="demo-panel route-card">
          <p className="demo-kicker">Caso reenviado real</p>
          <h2 className="demo-section-title">13:00 se interpreta como turno de tarde</h2>
          <p className="demo-result-copy">
            El email reenviado entra como referencia operativa y la hora de
            entrada y salida a las 13:00 se interpreta como turno de tarde.
            A partir de ahí la disponibilidad se cruza por slots reales contra
            la ocupación inferida del Excel.
          </p>
          <div className="demo-chip-row">
            <span className="demo-chip">turno tarde</span>
            <span className="demo-chip">compatibilidad por slots</span>
            <span className="demo-chip">hora 13:00</span>
          </div>
          <div className="demo-key-list">
            <div>
              <span>Referencia</span>
              <strong>{realForwardSample.label}</strong>
            </div>
            <div>
              <span>Motivo</span>
              <strong>Hora válida convertida a tarde</strong>
            </div>
          </div>
          {realForwardHighlights.length > 0 ? (
            <pre className="demo-prewrap">{realForwardHighlights.join("\n")}</pre>
          ) : null}
        </article>

        <article className="demo-panel route-card">
          <p className="demo-kicker">Secuencia operativa</p>
          <h2 className="demo-section-title">De detectar a revisar y operar</h2>
          <p className="demo-result-copy">
            El recorrido interno enseña el orden lógico: detección, parseo,
            revisión manual cuando falta o sobra algo, cálculo de disponibilidad,
            preparación del mensaje y entrada en admin para seguimiento.
          </p>
          <div className="demo-metric-grid">
            <article className="demo-metric-card">
              <span className="demo-state demo-state-pendiente">detected / parsed</span>
              <strong>1</strong>
              <p>email operativo recibido</p>
            </article>
            <article className="demo-metric-card">
              <span className="demo-state demo-state-pendiente">pending_review</span>
              <strong>13:00</strong>
              <p>hora que ahora entra como tarde</p>
            </article>
            <article className="demo-metric-card">
              <span className="demo-state demo-state-disponible">available</span>
              <strong>Sheets</strong>
              <p>preparado para escritura</p>
            </article>
            <article className="demo-metric-card">
              <span className="demo-state demo-state-confirmada">confirmed</span>
              <strong>48 h</strong>
              <p>cola de recordatorios lista</p>
            </article>
          </div>
        </article>
      </section>

      <ReservationLab />

      <section className="page-intro">
        <p className="demo-kicker">Seguimiento interno</p>
        <h2 className="page-title">Estado del panel operativo</h2>
        <p className="page-description">
          Aquí queda visible lo que necesita administración para tomar decisiones:
          reservas procesadas, estado de integración y recordatorios próximos.
        </p>
      </section>

      <AdminDashboard dashboard={dashboard} />
    </SiteShell>
  );
}
