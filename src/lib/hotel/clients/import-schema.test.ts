import { describe, expect, it } from "vitest";
import { mapClientRow } from "./google-sheets-client-directory";
import { CLIENTS_SHEET_HEADERS } from "./types";

describe("CLIENTES import schema", () => {
  it("keeps the CLIENTES import schema stable", () => {
    expect(CLIENTS_SHEET_HEADERS).toEqual([
      "activo",
      "fecha_alta",
      "fecha_baja",
      "nombre",
      "nif",
      "telefono_fijo",
      "telefono_movil",
      "telefono_normalizado",
      "email",
      "notas",
      "bloqueado_no_reservar",
      "origen",
      "updated_at",
    ]);
  });

  it("accepts NIF in import schema but does not project it at runtime", () => {
    const record = mapClientRow(
      [
        "true",
        "2026-01-01",
        "",
        "Cliente Sintetico Uno",
        "12345678Z",
        "911111111",
        "600111222",
        "",
        "demo.owner@example.test",
        "nota sintetica",
        "",
        "test",
        "2026-01-01T00:00:00.000Z",
      ],
      2,
      "CLIENTES",
    );

    expect(record).not.toHaveProperty("nif");
    expect(JSON.stringify(record)).not.toContain("12345678Z");
  });
});
