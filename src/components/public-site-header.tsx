import Link from "next/link";
import Image from "next/image";
import { demoFormUrl } from "@/components/demo-data";

export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/8 bg-[#fffaf1]/95 backdrop-blur-sm">
      <div className="mx-auto grid min-h-[5rem] max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-6 px-6 py-3 lg:px-10">
        <Link href="/" className="flex items-center" aria-label="Somos Muy Perros">
          <Image
            src="/brand/somos-muy-perros-logo.png"
            alt="Somos Muy Perros"
            width={160}
            height={103}
            priority
            className="h-16 w-auto object-contain"
          />
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
            href="/ops"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#4c3a2d] transition-colors hover:text-[#201911]"
          >
            Recepción emails
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
            Formulario web
          </a>
        </div>
      </div>
    </header>
  );
}
