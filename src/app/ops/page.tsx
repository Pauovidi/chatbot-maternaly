import Link from "next/link";
import { ProductShell } from "@/components/product-shell";
import { ReservationLab } from "@/components/reservation-lab";
import { getGoogleSheetsLiveStatus } from "@/lib/hotel/config/google-sheets-live";
import { verifyPanelPageAccess } from "@/lib/hotel/conversations/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OpsPage() {
  const auth = await verifyPanelPageAccess();
  if (!auth.ok) {
    return (
      <ProductShell>
        <section className="mx-auto max-w-6xl px-6 py-16 lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8d6b51]">
            Zona protegida
          </p>
          <h1 className="mt-4 font-serif text-5xl leading-[0.95] md:text-6xl">
            Operativa interna
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#5d4a3a]">
            Configura credenciales de panel para acceder a esta vista en produccion.
          </p>
        </section>
      </ProductShell>
    );
  }

  const sheetsStatus = await getGoogleSheetsLiveStatus();

  return (
    <ProductShell>
      <section className="relative overflow-hidden border-b border-black/8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.75),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(191,153,113,0.2),transparent_28%)]" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:px-10 lg:py-16">
          <div className="flex flex-wrap gap-3">
            <span className="rounded-full border border-black/8 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
              Google Sheets dry-run
            </span>
            <span className="rounded-full border border-black/8 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
              Seguridad operativa
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8d6b51]">
                Operativa Maternaly
              </p>
              <h1 className="max-w-3xl font-serif text-5xl leading-[0.95] tracking-[-0.04em] md:text-6xl">
                Disponibilidad, WritePlan y revision humana
              </h1>
              <p className="max-w-3xl text-base leading-8 text-[#5d4a3a] md:text-lg">
                Esta zona conserva la base tecnica importada, pero Maternaly ya
                prepara lectura de Sheets, escritura dry-run y handoff cuando el
                mapping no sea fiable.
              </p>
            </div>

            <article className="rounded-[28px] border border-black/8 bg-white p-7 shadow-[0_12px_36px_rgba(34,49,35,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8d6b51]">
                Estado de Google Sheets
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
                {sheetsStatus.mode === "real"
                  ? sheetsStatus.connectionStatus === "ok"
                    ? "Integración real activa"
                    : "Integración real con incidencia"
                  : "Integración pendiente"}
              </h2>
              <p className="mt-4 leading-7 text-[#5d4a3a]">
                {sheetsStatus.mode === "real"
                  ? sheetsStatus.connectionReason ??
                    `Adapter real activo en el spreadsheet ${sheetsStatus.spreadsheetIdSummary}.`
                  : sheetsStatus.reason}
              </p>
              <div className="mt-5">
                <Link
                  href="/#chatbot"
                  className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#201911] transition-colors hover:bg-[#fffaf1]"
                >
                  Volver al chat web
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12 lg:px-10">
        <ReservationLab sheetsStatus={sheetsStatus} startEmpty />
      </section>
    </ProductShell>
  );
}
