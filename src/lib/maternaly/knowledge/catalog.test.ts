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
  });
});
