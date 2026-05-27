import Link from "next/link";
import { demoFormUrl } from "@/components/demo-data";

export function PublicSiteFooter() {
  return (
    <footer className="border-t border-black/8 bg-[#fffaf1]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 lg:px-10">
        <nav
          className="flex flex-wrap items-center gap-5"
          aria-label="Enlaces del pie"
        >
          <a
            href={demoFormUrl}
            className="text-xs uppercase tracking-[0.18em] text-[#6f543d] transition-colors hover:text-[#201911]"
          >
            Formulario web
          </a>
          <a
            href="https://somosmuyperros.com/contacto/"
            className="text-xs uppercase tracking-[0.18em] text-[#6f543d] transition-colors hover:text-[#201911]"
          >
            Contacto
          </a>
          <Link
            href="/ops"
            className="text-xs uppercase tracking-[0.18em] text-[#6f543d] transition-colors hover:text-[#201911]"
          >
            Recepción emails
          </Link>
        </nav>

        <p className="text-xs uppercase tracking-[0.18em] text-[#8d6b51]">
          Chat web y operativa del hotel canino
        </p>
      </div>
      <div className="bg-[#201911]">
        <div className="mx-auto max-w-6xl px-6 py-4 lg:px-10">
          <p className="text-center text-xs uppercase tracking-[0.18em] text-[#f8f4ec]">
            El chat responde preguntas frecuentes y la recepción revisa la
            solicitud que llega por el formulario web
          </p>
        </div>
      </div>
    </footer>
  );
}
