import type { DemoDashboardData } from "@/lib/hotel/application/types";
import {
  formatSpanishDate,
  formatSpanishDateTime,
  formatTurn,
  reservationStatusLabels,
} from "@/components/demo-data";

const statusOrder = [
  "pendiente",
  "disponible",
  "sin_disponibilidad",
  "confirmada",
  "cancelada",
] as const;

export function AdminDashboard({
  dashboard,
}: {
  dashboard: DemoDashboardData;
}) {
  const counts = statusOrder.reduce<Record<string, number>>(
    (accumulator, status) => {
      accumulator[status] = dashboard.reservations.filter(
        (item) => item.status === status,
      ).length;
      return accumulator;
    },
    {},
  );

  return (
    <section className="demo-grid demo-grid-admin">
      <div className="demo-panel demo-admin-summary">
        <div className="demo-summary-top">
          <div>
            <p className="demo-kicker">Estado operativo</p>
            <h2 className="demo-section-title">
              Mocks visibles y listos para conectar
            </h2>
          </div>
          <div className="demo-chip-row">
            {Object.entries(dashboard.integrationModes).map(([key, value]) => (
              <span key={key} className={`demo-state demo-state-${value}`}>
                {key}: {value}
              </span>
            ))}
          </div>
        </div>

        <div className="demo-metric-grid">
          {statusOrder.map((status) => (
            <article key={status} className="demo-metric-card">
              <span className={`demo-state demo-state-${status}`}>
                {reservationStatusLabels[status]}
              </span>
              <strong>{counts[status] ?? 0}</strong>
              <p>reservas en este estado</p>
            </article>
          ))}
        </div>
      </div>

      <div className="demo-panel demo-admin-table">
        <div className="demo-panel-head">
          <div>
            <p className="demo-kicker">Reservas procesadas</p>
            <h2 className="demo-section-title">Listado simple para la demo</h2>
          </div>
        </div>

        <div className="demo-table">
          <div className="demo-table-row demo-table-head">
            <span>Reserva</span>
            <span>Fechas</span>
            <span>Estado</span>
          </div>
          {dashboard.reservations.map((item) => (
            <div key={item.reservationId} className="demo-table-row">
              <div>
                <strong>{item.petName ?? "Mascota pendiente"}</strong>
                <p>{item.ownerName ?? "Propietario pendiente"}</p>
              </div>
              <div>
                <strong>
                  {formatSpanishDate(item.checkInDate)} -{" "}
                  {formatSpanishDate(item.checkOutDate)}
                </strong>
                <p>
                  {formatTurn(item.checkInSlot)} / {formatTurn(item.checkOutSlot)}
                </p>
              </div>
              <div className="demo-table-status">
                <span className={`demo-state demo-state-${item.status}`}>
                  {reservationStatusLabels[item.status]}
                </span>
                <p>{item.reviewState === "ok" ? "Automatizable" : "Revisión manual"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="demo-panel demo-admin-reminders">
        <div className="demo-panel-head">
          <div>
            <p className="demo-kicker">Recordatorios 48 h</p>
            <h2 className="demo-section-title">Cola preparada</h2>
          </div>
        </div>

        <div className="demo-reminder-list">
          {dashboard.reminders.map((item) => (
            <article key={item.reminderId} className="demo-reminder-card">
              <div>
                <strong>{item.petName ?? "Mascota"}</strong>
                <p>{item.ownerName ?? "Cliente pendiente"}</p>
              </div>
              <div className="demo-reminder-meta">
                <span>{formatSpanishDateTime(item.scheduledFor)}</span>
                <span>{item.channel}</span>
              </div>
              <p className="demo-result-copy">{item.messagePreview}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="demo-panel">
        <div className="demo-panel-head">
          <div>
            <p className="demo-kicker">Logs de demo</p>
            <h2 className="demo-section-title">Últimos eventos</h2>
          </div>
        </div>

        <div className="demo-log-list">
          {dashboard.logs.length > 0 ? (
            dashboard.logs.slice(0, 5).map((log) => (
              <article key={log.id} className="demo-log-card">
                <div className="demo-log-meta">
                  <span>{log.level}</span>
                  <span>{formatSpanishDateTime(log.at)}</span>
                </div>
                <strong>{log.event}</strong>
                <p>{log.message}</p>
              </article>
            ))
          ) : (
            <p className="demo-result-copy">
              Todavía no hay logs nuevos. Procesa una reserva para ver trazabilidad.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
