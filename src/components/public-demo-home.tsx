import { Clock3, FileText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ProductShell } from "@/components/product-shell";
import { PublicChatWidget } from "@/components/public-chat-widget";

export function PublicDemoHome() {
  return (
    <ProductShell>
        <section className="relative overflow-hidden border-b border-black/8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.75),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(191,153,113,0.2),transparent_28%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:px-10 lg:py-20">
            <div className="flex flex-col justify-center gap-8">
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full border border-black/8 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
                  FAQ del hotel
                </span>
                <span className="rounded-full border border-black/8 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
                  Reserva por formulario
                </span>
              </div>

              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8d6b51]">
                  Somos Muy Perros
                </p>
                <h1 className="max-w-3xl font-serif text-5xl leading-[0.95] tracking-[-0.04em] md:text-6xl">
                  Chat web para el hotel canino
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[#5d4a3a] md:text-lg">
                  Resuelve preguntas frecuentes, deriva al formulario oficial y
                  deja preparada la revisión operativa de la reserva.
                </p>
              </div>

              <div className="flex flex-col items-start gap-3">
                <Link
                  href="/ops"
                  className="inline-flex min-h-[3.5rem] items-center justify-center rounded-full border border-black/10 bg-white px-6 py-3.5 text-sm font-semibold tracking-[0.02em] text-[#201911] shadow-[0_16px_34px_rgba(32,25,17,0.08)] transition-transform hover:-translate-y-0.5 hover:bg-[#fffaf1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#201911]"
                >
                  Ir a lógica de recepción de emails
                </Link>
                <p className="text-sm leading-7 text-[#6a5746]">
                  Si el cliente quiere reservar, el chat lo dirige al
                  formulario oficial.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <article className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_10px_32px_rgba(34,49,35,0.08)]">
                  <Clock3 className="mb-4 text-[#8d6b51]" size={18} />
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8d6b51]">
                    Horarios
                  </p>
                  <strong className="mt-2 block text-base">
                    Respuestas claras sobre horarios, precios y vacunas
                  </strong>
                </article>
                <article className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_10px_32px_rgba(34,49,35,0.08)]">
                  <FileText className="mb-4 text-[#8d6b51]" size={18} />
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8d6b51]">
                    Reserva
                  </p>
                  <strong className="mt-2 block text-base">
                    El chat encauza la solicitud al formulario oficial
                  </strong>
                </article>
                <article className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_10px_32px_rgba(34,49,35,0.08)]">
                  <ShieldCheck className="mb-4 text-[#8d6b51]" size={18} />
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8d6b51]">
                    Casos especiales
                  </p>
                  <strong className="mt-2 block text-base">
                    Cuando hace falta, el equipo toma el relevo
                  </strong>
                </article>
              </div>
            </div>

            <div id="chatbot" className="flex items-stretch">
              <PublicChatWidget />
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="mx-auto grid max-w-6xl gap-6 px-6 py-14 lg:grid-cols-3 lg:px-10"
        >
          <article className="rounded-[28px] border border-black/8 bg-white p-7 shadow-[0_12px_36px_rgba(34,49,35,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
              1. Preguntas frecuentes
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
              Responde lo esencial del hotel canino
            </h2>
            <p className="mt-4 leading-7 text-[#5d4a3a]">
              El chat resuelve las dudas más habituales con respuestas cortas,
              claras y controladas.
            </p>
          </article>
          <article className="rounded-[28px] border border-black/8 bg-white p-7 shadow-[0_12px_36px_rgba(34,49,35,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
              2. Reserva
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
              La solicitud entra por el canal correcto
            </h2>
            <p className="mt-4 leading-7 text-[#5d4a3a]">
              Si alguien quiere reservar o consultar fechas, el chat lo dirige
              al formulario oficial para que el equipo lo revise.
            </p>
          </article>
          <article className="rounded-[28px] border border-black/8 bg-white p-7 shadow-[0_12px_36px_rgba(34,49,35,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
              3. Recepción
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
              La recepción valida disponibilidad y turno
            </h2>
            <p className="mt-4 leading-7 text-[#5d4a3a]">
              La parte operativa sigue funcionando detrás para procesar emails,
              revisar hueco y dejar preparada la gestión interna.
            </p>
          </article>
        </section>
    </ProductShell>
  );
}
