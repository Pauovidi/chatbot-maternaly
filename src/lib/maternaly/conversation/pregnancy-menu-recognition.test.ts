import { describe, expect, it } from "vitest";
import { buildMaternalyWhatsAppReply } from "@/lib/maternaly/conversation/response-engine";
import { findKnowledgeService } from "@/lib/maternaly/knowledge/catalog";

const pregnancyMenuCases = [
  ["¿Qué opciones hay para un ADN prenatal?", "test_adn_fetal", /Test ADN fetal/i],
  [
    "Quería un análisis para saber el sexo del bebé",
    "detesex",
    /Detesex/i,
  ],
  ["Me interesan las clases preparto", "preparacion_parto", /Preparación al parto/i],
  ["¿Qué es el Método Maternaly?", "metodo_maternaly", /Método Maternaly/i],
  ["¿Hacéis eco emocional?", "ecografia_5d", /Ecografía 5D/i],
  ["¿Cómo es la actividad de piscina para embarazadas?", "aipap_agua", /AIPAP Agua/i],
  ["¿Qué ofrecéis de pilates prenatal?", "pilates", /Pilates embarazo/i],
  ["Me interesa yoga para embarazadas", "yoga_prenatal", /Yoga Prenatal/i],
  ["Quiero conocer el Winner Flow", "metodo_5p", /Método 5P/i],
  [
    "¿Tenéis entrenamiento funcional?",
    "entrenamiento_funcional_embarazo",
    /Entrenamiento funcional para el embarazo/i,
  ],
  [
    "Necesito información de fisio para embarazadas",
    "fisioterapia_embarazo",
    /Unidad de Fisioterapia en el embarazo/i,
  ],
  [
    "Quiero saber cómo pedir cita con la psicóloga perinatal",
    "psicologia_perinatal",
    /Unidad de Psicología perinatal/i,
  ],
] as const;

describe("selección en lenguaje natural del menú de embarazo del Word", () => {
  it.each(pregnancyMenuCases)(
    "reconoce %s como servicio específico",
    (message, expectedServiceId) => {
      expect(findKnowledgeService(message)?.id).toBe(expectedServiceId);
    },
  );

  it.each(pregnancyMenuCases)(
    "responde sobre el servicio seleccionado: %s",
    async (message, expectedServiceId, replyPattern) => {
      const result = await buildMaternalyWhatsAppReply(message);

      expect(result.intent.service_scope).toBe("explicit");
      expect(result.intent.service_candidate).toBe(expectedServiceId);
      expect(result.reply).toMatch(replyPattern);
    },
  );

  it.each([
    ["Me interesan las clases preparto", "preparacion_parto"],
    ["¿Qué es el Método Maternaly?", "metodo_maternaly"],
    [
      "¿Tenéis entrenamiento funcional?",
      "entrenamiento_funcional_embarazo",
    ],
    [
      "Quiero saber cómo pedir cita con la psicóloga perinatal",
      "psicologia_perinatal",
    ],
  ] as const)(
    "no inventa precios ni horarios cuando la ficha no los documenta: %s",
    async (message, expectedServiceId) => {
      const result = await buildMaternalyWhatsAppReply(message);

      expect(result.intent.service_candidate).toBe(expectedServiceId);
      expect(result.reply).toMatch(/equipo|confirm/i);
      expect(result.reply).not.toMatch(/\b\d{1,2}:\d{2}\b|\b\d+(?:[.,]\d+)?\s*€|euros?/i);
    },
  );
});
