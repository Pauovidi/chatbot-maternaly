import { demoOperationalBanner } from "@/components/demo-data";
import { PublicSiteHeader } from "@/components/public-site-header";

export function SiteShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="demo-shell">
      <div className="demo-backdrop" aria-hidden="true" />
      <PublicSiteHeader />
      <main className="demo-shell-inner">
        {compact ? null : <div className="demo-banner">{demoOperationalBanner}</div>}
        <div className="demo-main">{children}</div>
      </main>
    </div>
  );
}
