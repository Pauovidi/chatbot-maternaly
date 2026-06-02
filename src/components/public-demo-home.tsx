import { CalendarDays, FileCheck2, ShieldCheck } from "lucide-react";
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
                  Servicios Maternaly
                </span>
                <span className="rounded-full border border-black/8 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
                  WhatsApp + Sheets
                </span>
              </div>

              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8d6b51]">
                  Maternaly
                </p>
                <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-normal md:text-6xl">
                  Chatbot WhatsApp para reservas asistidas
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[#5d4a3a] md:text-lg">
                  Interpreta mensajes caoticos, consulta disponibilidad fiable y
                  deja la reserva pendiente hasta que pago y factura existan de verdad.
                </p>
              </div>

              <div className="flex flex-col items-start gap-3">
                <Link
                  href="/admin/conversations"
                  className="inline-flex min-h-[3.5rem] items-center justify-center rounded-full border border-black/10 bg-white px-6 py-3.5 text-sm font-semibold tracking-[0.02em] text-[#201911] shadow-[0_16px_34px_rgba(32,25,17,0.08)] transition-transform hover:-translate-y-0.5 hover:bg-[#fffaf1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#201911]"
                >
                  Abrir panel de conversaciones
                </Link>
                <p className="text-sm leading-7 text-[#6a5746]">
                  En esta V1 la escritura real en Sheets esta bloqueada por defecto.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <article className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_10px_32px_rgba(34,49,35,0.08)]">
                  <CalendarDays className="mb-4 text-[#8d6b51]" size={18} />
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8d6b51]">
                    Disponibilidad
                  </p>
                  <strong className="mt-2 block text-base">
                    Solo se muestran horarios procedentes de Sheets fiables
                  </strong>
                </article>
                <article className="rounded-[24px] border border-black/8 bg-white p-5 shadow-[0_10px_32px_rgba(34,49,35,0.08)]">
                  <FileCheck2 className="mb-4 text-[#8d6b51]" size={18} />
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8d6b51]">
                    Pagos y facturas
                  </p>
                  <strong className="mt-2 block text-base">
                    No se confirma plaza ni factura sin evento real
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
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">
              Separa servicios y sedes
            </h2>
            <p className="mt-4 leading-7 text-[#5d4a3a]">
              AIPAP Agua, AIPAP Terra, Pilates y talleres mantienen contexto
              separado para evitar mezclas peligrosas.
            </p>
          </article>
          <article className="rounded-[28px] border border-black/8 bg-white p-7 shadow-[0_12px_36px_rgba(34,49,35,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
              2. Reserva
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">
              Consulta fuentes operativas
            </h2>
              <p className="mt-4 leading-7 text-[#5d4a3a]">
                La disponibilidad sale del catalogo normalizado construido desde
              los dos Google Sheets configurados.
            </p>
          </article>
          <article className="rounded-[28px] border border-black/8 bg-white p-7 shadow-[0_12px_36px_rgba(34,49,35,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
              3. Recepción
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">
              El equipo conserva control
            </h2>
            <p className="mt-4 leading-7 text-[#5d4a3a]">
              El panel permite tomar conversaciones, bloquear el bot y revisar
              reservas pendientes, pagos y facturas.
            </p>
          </article>
        </section>
    </ProductShell>
  );
}
