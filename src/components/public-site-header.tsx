import Link from "next/link";
import Image from "next/image";
import { demoFormUrl } from "@/components/demo-data";

export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--primary-border)] bg-[rgba(251,247,250,0.95)] backdrop-blur-sm">
      <div className="mx-auto grid min-h-[5rem] max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-3 lg:px-10">
        <Link href="/" className="flex items-center" aria-label="Maternaly">
          <Image
            src="/brand/maternaly-logo-fondo-transparente.png"
            alt="Maternaly"
            width={275}
            height={69}
            priority
            className="h-12 w-auto object-contain sm:h-14"
          />
          <span className="sr-only">Maternaly WhatsApp bot</span>
        </Link>

        <nav
          className="hidden items-center justify-center gap-8 md:flex"
          aria-label="Navegación principal"
        >
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-text)] transition-colors hover:text-[var(--primary-strong)]"
          >
            Inicio
          </Link>
          <Link
            href="/admin/conversations"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-text)] transition-colors hover:text-[var(--primary-strong)]"
          >
            Panel conversaciones
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={demoFormUrl}
            className="rounded-full border border-[var(--primary-border)] bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary-text)] transition-colors hover:bg-[var(--primary-soft)]"
          >
            Web Maternaly
          </a>
        </div>
      </div>
    </header>
  );
}
