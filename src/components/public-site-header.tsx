import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { demoFormUrl } from "@/components/demo-data";

export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/8 bg-[#fffaf1]/95 backdrop-blur-sm">
      <div className="mx-auto grid min-h-[5rem] max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-3 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Maternaly">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#201911] text-white">
            <HeartPulse size={20} />
          </span>
          <span>
            <strong className="block font-serif text-lg text-[#201911]">
              Maternaly
            </strong>
            <small className="text-xs uppercase tracking-[0.2em] text-[#8d6b51]">
              WhatsApp bot
            </small>
          </span>
        </Link>

        <nav
          className="hidden items-center justify-center gap-8 md:flex"
          aria-label="Navegación principal"
        >
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:text-[#201911]"
          >
            Inicio
          </Link>
          <Link
            href="/admin/conversations"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:text-[#201911]"
          >
            Panel conversaciones
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={demoFormUrl}
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:bg-[#f8f2e8]"
          >
            Web Maternaly
          </a>
        </div>
      </div>
    </header>
  );
}
