import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { demoNavItems, demoRoutes } from "../../../components/demo-data";

describe("routing público de la experiencia", () => {
  it("pone la demo pública primero y retira ops de la navegación visible", () => {
    const navHrefs = demoNavItems.map((item) => item.href);

    expect(navHrefs[0]).toBe("/");
    expect(navHrefs).not.toContain("/ops");
    expect(navHrefs).not.toContain("/admin");
    expect(navHrefs).toContain("/admin/conversations");
  });

  it("mantiene inicio y el panel de conversaciones como rutas navegables", () => {
    expect(demoRoutes.map((route) => route.href)).toEqual([
      "/",
      "/admin/conversations",
    ]);
  });

  it("convierte ops en redirect al panel sin renderizar la UI heredada de email", () => {
    const source = readFileSync(join(process.cwd(), "src/app/ops/page.tsx"), "utf8");

    expect(source).toContain('redirect("/admin/conversations")');
    expect(source).not.toContain("ReservationLab");
    expect(source).not.toContain("Lógica de recepción de emails");
  });
});
