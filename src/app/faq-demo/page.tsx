import { PublicChatWidget } from "@/components/public-chat-widget";
import { SiteShell } from "@/components/site-shell";

export default function FaqDemoPage() {
  return (
    <SiteShell>
      <section className="page-intro">
        <p className="demo-kicker">Maternaly WhatsApp</p>
        <h1 className="page-title">Chat con respuestas seguras y desvío humano</h1>
        <p className="page-description">
          Responde sobre servicios, sedes y próximos pasos sin confirmar plazas,
          pagos ni facturas fuera de Sheets y revisión del equipo.
        </p>
      </section>
      <PublicChatWidget />
    </SiteShell>
  );
}
