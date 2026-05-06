import { describe, expect, it } from "vitest";
import { demoNavItems, demoRoutes } from "../../../components/demo-data";

describe("routing público de la experiencia", () => {
  it("pone la demo pública primero y deja ops como zona secundaria", () => {
    const navHrefs = demoNavItems.map((item) => item.href);

    expect(navHrefs[0]).toBe("/");
    expect(navHrefs).toContain("/ops");
    expect(navHrefs).not.toContain("/admin");
  });

  it("mantiene la demo, ops y el panel de conversaciones como rutas navegables", () => {
    expect(demoRoutes.map((route) => route.href)).toEqual([
      "/",
      "/ops",
      "/admin/conversations",
    ]);
  });
});
