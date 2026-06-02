import { describe, expect, it } from "vitest";
import { advanceTestAdnDemoFlow } from "./test-adn-flow";

describe("Test ADN / Detesex demo conversation flow", () => {
  it("asks for location, data, confirmation and returns the fixed Uelz link", async () => {
    const first = await advanceTestAdnDemoFlow({ message: "Quiero reservar Test ADN", executeWrite: false });
    expect(first.handled).toBe(true);
    expect(first.reply).toContain("08/06/2026");
    expect(first.reply).toContain("18:20");
    expect(first.reply).toContain("Bilbao");
    expect(first.reply).toContain("Erandio");

    const location = await advanceTestAdnDemoFlow({
      message: "Bilbao",
      previousState: first.state,
      fallbackPhone: "+34600000123",
      executeWrite: false,
    });
    expect(location.state?.selectedLocation).toBe("BILBAO");
    expect(location.reply).toContain("nombre y apellidos");

    const data = await advanceTestAdnDemoFlow({
      message: "Erika Ramírez, erika@test.com",
      previousState: location.state,
      fallbackPhone: "+34600000123",
      executeWrite: false,
    });
    expect(data.state?.phase).toBe("awaiting_confirmation");
    expect(data.reply).toContain("Confirmo los datos");
    expect(data.reply).toContain("08/06/2026 a las 18:20");
    expect(data.reply).toContain("¿Quieres que deje la reserva fijada pendiente de pago?");

    const final = await advanceTestAdnDemoFlow({
      message: "Sí",
      previousState: data.state,
      fallbackPhone: "+34600000123",
      executeWrite: false,
    });
    expect(final.state?.phase).toBe("completed");
    expect(final.reply).toContain("reserva fijada pendiente de pago");
    expect(final.reply).toContain("https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh");
    expect(final.reply).not.toMatch(/reserva confirmada|pago confirmado|factura enviada|plaza confirmada/i);
  });

  it("keeps Erandio when the user chooses Erandio", async () => {
    const first = await advanceTestAdnDemoFlow({ message: "Detesex", executeWrite: false });
    const location = await advanceTestAdnDemoFlow({
      message: "Erandio",
      previousState: first.state,
      fallbackPhone: "+34600000123",
      executeWrite: false,
    });

    expect(location.state?.selectedLocation).toBe("ERANDIO");
  });

  it("answers invoice requests without claiming the invoice was sent", async () => {
    const result = await advanceTestAdnDemoFlow({ message: "Necesito factura", executeWrite: false });

    expect(result.handled).toBe(true);
    expect(result.reply).toContain("emitir la factura cuando el pago esté validado");
    expect(result.reply).not.toMatch(/factura enviada|pago confirmado/i);
  });
});
