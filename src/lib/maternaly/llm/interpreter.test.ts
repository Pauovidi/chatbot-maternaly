import { describe, expect, it } from "vitest";
import { LlmIntentClassifier, SafeToolRouter } from "./interpreter";

describe("LlmIntentClassifier mock fallback", () => {
  it("detects AIPAP Agua reservation interest without inventing confirmation", () => {
    const classifier = new LlmIntentClassifier();
    const intent = classifier.classifyWithMock(
      "Quiero reservar AIPAP agua en Bilbao por la mañana para 1 persona",
    );

    expect(intent.intent).toBe("reservation_interest");
    expect(intent.service_candidate).toBe("aipap_agua");
    expect(intent.needs_availability_lookup).toBe(true);
    expect(intent.safety_flags).toContain("pool_access_justification_required");
  });

  it("routes interview services to handoff", () => {
    const classifier = new LlmIntentClassifier();
    const router = new SafeToolRouter();
    const intent = classifier.classifyWithMock("Preparacion al parto");

    expect(router.route(intent)).toBe("handoff");
  });
});
