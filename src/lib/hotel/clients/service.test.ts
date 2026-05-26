import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeName, normalizePhone } from "./normalize";
import { ClientDirectoryService, createStaticClientDirectory } from "./service";

describe("client directory", () => {
  it("normalizes Spanish WhatsApp and local phone formats to comparable digits", () => {
    expect(normalizePhone("whatsapp:+34682621177")).toBe("34682621177");
    expect(normalizePhone("+34 682 62 11 77")).toBe("34682621177");
    expect(normalizePhone("682621177")).toBe("34682621177");
    expect(normalizePhone("34682621177")).toBe("34682621177");
  });

  it("normalizes email and names for lookup", () => {
    expect(normalizeEmail(" CLIENTE@Example.COM ")).toBe("cliente@example.com");
    expect(normalizeName("  Ána   López-Ruiz ")).toBe("ana lopez ruiz");
  });

  it("finds strong matches by phone and email", async () => {
    const service = new ClientDirectoryService(
      createStaticClientDirectory([
        {
          nombre: "Cliente Habitual",
          telefonoMovil: "682621177",
          email: "cliente@example.com",
        },
      ]),
    );

    await expect(service.findClientByPhone("whatsapp:+34682621177")).resolves.toMatchObject({
      status: "known",
      confidence: "strong",
      client: { nombre: "Cliente Habitual" },
    });
    await expect(service.findClientByEmail("CLIENTE@example.com")).resolves.toMatchObject({
      status: "known",
      confidence: "strong",
      client: { nombre: "Cliente Habitual" },
    });
  });

  it("treats name-only matches as medium or weak suggestions", async () => {
    const service = new ClientDirectoryService(
      createStaticClientDirectory([{ nombre: "Ana Lopez Ruiz" }]),
    );

    await expect(service.findClientByNameWeak("Ana López Ruiz")).resolves.toMatchObject({
      status: "known",
      confidence: "medium",
    });
    await expect(service.findClientByNameWeak("Ana Lopez")).resolves.toMatchObject({
      status: "known",
      confidence: "weak",
    });
  });

  it("marks duplicate phone matches as ambiguous", async () => {
    const service = new ClientDirectoryService(
      createStaticClientDirectory([
        { nombre: "Cliente A", telefonoMovil: "682621177" },
        { nombre: "Cliente B", telefonoMovil: "+34 682 62 11 77" },
      ]),
    );

    await expect(service.findClientByPhone("34682621177")).resolves.toMatchObject({
      status: "ambiguous",
      confidence: "strong",
    });
  });

  it("blocks dangerous notes and keeps missing sheets non-fatal", async () => {
    const blocked = new ClientDirectoryService(
      createStaticClientDirectory([
        {
          nombre: "Cliente Bloqueado",
          telefonoMovil: "682621177",
          notas: "NO COGER RESERVAS",
        },
      ]),
    );
    await expect(blocked.findClientByPhone("682621177")).resolves.toMatchObject({
      status: "blocked",
      warnings: ["NO COGER RESERVA"],
    });

    const missing = new ClientDirectoryService(
      createStaticClientDirectory([], ["CLIENTES no disponible: pestaña ausente"]),
    );
    await expect(missing.findClientByPhone("682621177")).resolves.toMatchObject({
      status: "unknown",
      warnings: ["CLIENTES no disponible: pestaña ausente"],
    });
  });
});
