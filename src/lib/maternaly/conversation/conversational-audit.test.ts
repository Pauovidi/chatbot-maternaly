import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMaternalyWhatsAppReply } from "@/lib/maternaly/conversation/response-engine";

describe("Maternaly conversational audit matrix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [
      "¿De qué habláis en la charla informativa?",
      "charla_embarazo_1_20",
      "contents",
      /cambios del cuerpo|medicaci[oó]n segura|cambios emocionales/i,
    ],
    [
      "¿Qué me aporta la charla de embarazo?",
      "charla_embarazo_1_20",
      "benefits",
      /(?=.*\bmatronas\b)(?=.*cambios que se producen en tu cuerpo)/is,
    ],
    [
      "¿Qué vale ir los dos al curso de alimentación del bebé?",
      "taller_blw",
      "pricing",
      /45 €\/persona|75 €\/pareja/i,
    ],
    [
      "¿Cuántas horas son el taller BLW?",
      "taller_blw",
      "duration",
      /3 horas|17:00 a 20:00/i,
    ],
    [
      "Mi bebé tiene seis meses, ¿este taller BLW es para nosotros?",
      "taller_blw",
      "eligibility",
      /comenzar la alimentaci[oó]n complementaria|requisitos de inicio/i,
    ],
    [
      "Quiero reservar pilates embarazo",
      "pilates",
      "booking",
      /no te confirmo plaza|agenda autom[aá]tica/i,
    ],
  ])(
    "answers paraphrase '%s' with focused service information",
    async (message, serviceId, focus, replyPattern) => {
      vi.stubEnv("LLM_PROVIDER", "mock");

      const result = await buildMaternalyWhatsAppReply(message);

      expect(result.intent).toMatchObject({
        service_candidate: serviceId,
        service_question_focus: focus,
      });
      expect(result.reply).toMatch(replyPattern);
    },
  );

  it.each([
    ["Necesito una factura del pago", /equipo de Maternaly|pago validado/i],
    ["Quiero borrar mis datos y saber sobre privacidad", /datos|privacidad|derechos/i],
    ["Tengo dolor fuerte y sangrado", /profesional|m[eé]dico|urgencias/i],
  ])("keeps safety and control routing for '%s'", async (message, replyPattern) => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply(message);

    expect(result.reply).toMatch(replyPattern);
  });

  it("does not invent a service when an isolated follow-up has no conversation context", async () => {
    vi.stubEnv("LLM_PROVIDER", "mock");

    const result = await buildMaternalyWhatsAppReply("¿y cuánto dura?");

    expect(result.intent.service_candidate).toBeUndefined();
    expect(result.reply).toMatch(
      /(?=.*\bAne\b)(?=.*\bEMBARAZO\b)(?=.*\bPOSTPARTO\b)(?=.*\bOTROS\b)/is,
    );
  });
});
