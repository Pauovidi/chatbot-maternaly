import { describe, expect, it } from "vitest";
import { findKnowledgeService } from "./catalog";

describe("Maternaly knowledge catalog", () => {
  it("keeps AIPAP Agua and Terra separate", () => {
    expect(findKnowledgeService("aipap agua piscina")?.id).toBe("aipap_agua");
    expect(findKnowledgeService("aipap terra")?.id).toBe("aipap_terra");
  });
});
