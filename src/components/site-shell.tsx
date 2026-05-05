import Link from "next/link";
import {
  demoFormUrl,
  demoNavItems,
  demoOperationalBanner,
} from "@/components/demo-data";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-shell">
      <div className="demo-backdrop" aria-hidden="true" />
      <div className="demo-shell-inner">
        <header className="demo-header">
          <Link href="/" className="demo-brand">
            <span className="demo-brand-mark">SM</span>
            <span>
              <strong>Somos Muy Perros</strong>
              <small>Demo hotel canino</small>
            </span>
          </Link>
          <nav className="demo-nav" aria-label="Navegación principal">
            {demoNavItems.map((item) => (
              <Link key={item.href} className="demo-nav-link" href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <a className="demo-nav-cta" href={demoFormUrl}>
            Formulario real
          </a>
        </header>

        <div className="demo-banner">{demoOperationalBanner}</div>

        <main className="demo-main">{children}</main>

        <footer className="demo-footer">
          <span>Demo funcional hoy</span>
          <span>FAQ + reservas + admin</span>
        </footer>
      </div>
    </div>
  );
}
