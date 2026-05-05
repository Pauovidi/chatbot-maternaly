import type { ReactNode } from "react";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";

export function ProductShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5efe4] text-[#201911]">
      <PublicSiteHeader />
      <main>{children}</main>
      <PublicSiteFooter />
    </div>
  );
}
