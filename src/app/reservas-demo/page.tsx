import { ReservationLab } from "@/components/reservation-lab";
import { SiteShell } from "@/components/site-shell";

export default function ReservasDemoPage() {
  return (
    <SiteShell>
      <section className="page-intro">
        <p className="demo-kicker">Pantalla 2</p>
        <h1 className="page-title">Procesamiento de reservas por email</h1>
        <p className="page-description">
          Pega el contenido del email, procesa la solicitud y enseña extracción,
          disponibilidad, precio, WhatsApp de salida, preparación para Sheets y
          recordatorios.
        </p>
      </section>
      <ReservationLab />
    </SiteShell>
  );
}
