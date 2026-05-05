import { FaqChatDemo } from "@/components/faq-chat-demo";
import { SiteShell } from "@/components/site-shell";
import { getHotelFeatureFlags, getHotelRuntimeConfig } from "@/lib/hotel/config";

export default function FaqDemoPage() {
  const flags = getHotelFeatureFlags();
  const runtime = getHotelRuntimeConfig();

  return (
    <SiteShell>
      <section className="page-intro">
        <p className="demo-kicker">Pantalla 1</p>
        <h1 className="page-title">Chat FAQ con intents controlados y desvío seguro</h1>
        <p className="page-description">
          Usa una base FAQ cerrada en español, separa FAQ de workflow y deriva a
          humano cuando toca. El bot no improvisa fuera del catálogo permitido.
        </p>
      </section>
      <FaqChatDemo
        debugAvailable={flags.useDemoPersistence}
        runtimeLinks={{
          bookingFormUrl: runtime.bookingFormUrl,
          reservationsDemoUrl: "/reservas-demo",
          whatsappUrl: runtime.whatsappUrl,
          contactPageUrl: "https://somosmuyperros.com/contacto/",
          contactEmail: "info@somosmuyperros.com",
          contactPhone: runtime.whatsappPhone,
        }}
      />
    </SiteShell>
  );
}
