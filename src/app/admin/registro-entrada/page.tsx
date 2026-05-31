import { SiteShell } from "@/components/site-shell";
import { formatSpanishDate, formatSpanishDateTime } from "@/components/demo-data";
import { listEntryLogRecords } from "@/lib/hotel/application/entry-log";
import { verifyPanelPageAccess } from "@/lib/hotel/conversations/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EntryLogPage() {
  const auth = await verifyPanelPageAccess();

  if (!auth.ok) {
    return (
      <SiteShell>
        <section className="page-intro">
          <p className="demo-kicker">Panel protegido</p>
          <h1 className="page-title">Registro de entrada</h1>
          <p className="page-description">
            Configura PANEL_ADMIN_USERNAME y PANEL_ADMIN_PASSWORD para acceder al
            registro operativo en producción.
          </p>
        </section>
      </SiteShell>
    );
  }

  const records = await listEntryLogRecords();

  return (
    <SiteShell compact>
      <section className="page-intro">
        <p className="demo-kicker">Operativa</p>
        <h1 className="page-title">Registro de entrada</h1>
        <p className="page-description">
          Lista de reservas y solicitudes que el equipo debe revisar antes de
          pasarlas a Sheets o marcarlas como gestionadas.
        </p>
      </section>

      <section className="demo-panel entry-log-panel">
        {records.length === 0 ? (
          <div className="conversation-empty">
            <strong>Aún no hay reservas confirmadas registradas por el chatbot.</strong>
            <span>
              Cuando entren reservas o revisiones desde la operativa, aparecerán aquí.
            </span>
          </div>
        ) : (
          <div className="entry-log-table" aria-label="Registro de entrada">
            <div className="entry-log-row entry-log-head">
              <span>Creación</span>
              <span>Origen</span>
              <span>Acción</span>
              <span>Cliente</span>
              <span>Estado cliente</span>
              <span>Identificador</span>
              <span>Servicio</span>
              <span>Fecha</span>
              <span>Hora</span>
              <span>Reserva</span>
              <span>Notas</span>
              <span>Sheets</span>
            </div>
            {records.map((record) => (
              <article key={record.reservationId} className="entry-log-row">
                <time>{formatSpanishDateTime(record.createdAt)}</time>
                <span>{record.source}</span>
                <span className="demo-state demo-state-manual">{record.action}</span>
                <strong>{record.clientName}</strong>
                <span>{record.clientStatus}</span>
                <span>{record.phoneNormalized}</span>
                <strong>{record.petName}</strong>
                <span>{formatSpanishDate(record.checkInDate)}</span>
                <span>{formatSpanishDate(record.checkOutDate)}</span>
                <code>{record.reservationId}</code>
                <span>{record.notes}</span>
                <span>{record.gestetStatus}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </SiteShell>
  );
}
