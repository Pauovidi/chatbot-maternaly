import { describe, expect, it } from "vitest";
import { findKnowledgeService, getKnowledgeServiceByNormalizedKey } from "./catalog";

describe("Maternaly knowledge catalog", () => {
  it("keeps AIPAP Agua and Terra separate", () => {
    expect(findKnowledgeService("aipap agua piscina")?.id).toBe("aipap_agua");
    expect(findKnowledgeService("aipap terra")?.id).toBe("aipap_terra");
  });

  it("maps BLW and Charla to normalized services", () => {
    expect(findKnowledgeService("quiero apuntarme al taller BLW")?.normalizedServiceKey).toBe("taller_blw");
    expect(findKnowledgeService("charla informativa embarazo")?.normalizedServiceKey).toBe("charla_embarazo_1_20");
    expect(getKnowledgeServiceByNormalizedKey("taller_blw")?.pricing).toContain("45 €/persona");
    expect(getKnowledgeServiceByNormalizedKey(undefined)).toBeNull();
  });

  it("includes the enriched Pilates embarazo knowledge without making it a normalized Sheet flow", () => {
    const service = findKnowledgeService("qué beneficios tiene pilates embarazo");

    expect(service).toMatchObject({
      id: "pilates",
      category: "informational",
    });
    expect(service?.normalizedServiceKey).toBeUndefined();
    expect(service?.summary).toMatch(/semana 14|final de la gestaci[oó]n/i);
    expect(service?.details.join(" ")).toMatch(/tono muscular|circulaci[oó]n|suelo p[eé]lvico/i);
    expect(service?.details.join(" ")).toMatch(/Bilbao: lunes|Erandio: martes/i);
    expect(service?.pricing).toEqual(["59 €/mes 1 clase/semana", "99 €/mes 2 clases/semana"]);
    expect(service?.safetyNotes.join(" ")).toMatch(/dolor fuerte|sangrado|profesional/i);
  });
});
