import { demoOperationalBanner } from "@/components/demo-data";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-shell">
      <div className="demo-backdrop" aria-hidden="true" />
      <PublicSiteHeader />
      <main className="demo-shell-inner">
        <div className="demo-banner">{demoOperationalBanner}</div>
        <div className="demo-main">{children}</div>
      </main>
      <PublicSiteFooter />
    </div>
  );
}
