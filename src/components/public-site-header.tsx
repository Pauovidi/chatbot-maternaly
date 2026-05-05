import Link from "next/link";
import { PawPrint } from "lucide-react";
import { demoFormUrl } from "@/components/demo-data";

export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/8 bg-[#fffaf1]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-6 px-6 py-4 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#201911] text-white">
            <PawPrint size={20} />
          </span>
          <span>
            <strong className="block font-serif text-lg text-[#201911]">
              Somos Muy Perros
            </strong>
            <small className="text-xs uppercase tracking-[0.2em] text-[#8d6b51]">
              Chat web
            </small>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Navegación principal"
        >
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:text-[#201911]"
          >
            Inicio
          </Link>
          <Link
            href="/#chatbot"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:text-[#201911]"
          >
            Chat
          </Link>
          <Link
            href="/ops"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:text-[#201911]"
          >
            Recepción emails
          </Link>
        </nav>

        <a
          href={demoFormUrl}
          className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:bg-[#f8f2e8]"
        >
          Formulario oficial
        </a>
      </div>
    </header>
  );
}
