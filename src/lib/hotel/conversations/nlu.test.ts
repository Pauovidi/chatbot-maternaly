import { describe, expect, it } from "vitest";
import {
  buildConversationReplyPlan,
  classifyConversationIntent,
} from "./nlu";

describe("conversation NLU", () => {
  it.each([
    ["Hola", "greeting"],
    ["Hola, quiero información", "general_information"],
    ["¿Qué tengo que llevar?", "faq_what_to_bring"],
    ["¿Puedo visitar el hotel?", "faq_visits"],
    ["¿Qué vacunas necesita?", "faq_vaccines"],
    ["¿Mandáis fotos o vídeos?", "faq_photos_videos"],
    ["¿Tenéis sitio del 14 al 18 de abril?", "availability_request"],
    ["Quiero reservar para Luna del 10 al 15 de agosto", "availability_request"],
    ["Sí, confirma", "reservation_confirm"],
    ["Quiero cancelar mi reserva", "reservation_cancel"],
    ["Quiero cambiar la fecha", "reservation_modify"],
    ["Quiero hablar con una persona", "human_handoff"],
    ["¿Ha comido mi perro?", "stay_status_question"],
  ] as const)("classifies %s as %s", (message, intent) => {
    expect(classifyConversationIntent(message).intent).toBe(intent);
  });

  it("answers general information without sending the conversation to human mode", () => {
    const plan = buildConversationReplyPlan("Hola, quiero información");

    expect(plan.intent).toBe("general_information");
    expect(plan.handoff).toBe(false);
    expect(plan.reply).toContain("horarios");
    expect(plan.reply).toContain("visitas");
    expect(plan.reply).not.toContain("Ese caso prefiero");
    expect(plan.reply).not.toContain("por aqui");
  });

  it("does not invent live stay status", () => {
    const plan = buildConversationReplyPlan("¿Ha comido mi perro?");

    expect(plan.intent).toBe("stay_status_question");
    expect(plan.handoff).toBe(true);
    expect(plan.reply).toContain("respuesta real");
    expect(plan.reply).toContain("persona del equipo");
  });

  it("asks for clarification on unknown messages without aggressive fallback", () => {
    const plan = buildConversationReplyPlan("xyz abc");

    expect(plan.intent).toBe("unknown");
    expect(plan.handoff).toBe(false);
    expect(plan.reply).toContain("¿Quieres información general");
    expect(plan.reply).not.toContain("Ese caso prefiero");
  });
});
