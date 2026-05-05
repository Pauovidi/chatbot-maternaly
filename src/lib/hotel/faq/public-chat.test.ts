import { describe, expect, it } from "vitest";
import {
  PUBLIC_CHAT_QUICK_ACTIONS,
  resolvePublicChatReply,
} from "./public-chat";

describe("public chat FAQ replies", () => {
  it("expone la pregunta rápida de confianza en residencia", () => {
    expect(PUBLIC_CHAT_QUICK_ACTIONS).toContain(
      "¿Es recomendable dejar a mi perro en una residencia?",
    );
  });

  it("mantiene los dos CTA de confianza en el chat público", () => {
    const reply = resolvePublicChatReply(
      "¿es recomendable dejar a mi perro en una residencia?",
    );

    expect(reply.resolution.intent).toBe("faq_confianza_residencia");
    expect(reply.actions.map((action) => action.label)).toEqual([
      "Cómo funciona el alojamiento",
      "Ir al formulario de reserva",
    ]);
  });
});
