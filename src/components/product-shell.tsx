import type { ReactNode } from "react";
import { PublicSiteHeader } from "@/components/public-site-header";

export function ProductShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--primary-soft-2)] text-[var(--primary-ink)]">
      <PublicSiteHeader />
      <main>{children}</main>
    </div>
  );
}
