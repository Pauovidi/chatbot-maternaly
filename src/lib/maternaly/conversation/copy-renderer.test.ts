import { describe, expect, it } from "vitest";
import {
  MaternalyCopyRenderer,
  type MaternalyCopyToolResult,
} from "@/lib/maternaly/conversation/copy-renderer";

const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function countEmojis(text: string): number {
  return Array.from(text.matchAll(emojiPattern)).length;
}

describe("MaternalyCopyRenderer availability guardrails", () => {
  it("renders sessions instead of availability fallback when sessions are present", () => {
    const renderer = new MaternalyCopyRenderer();
    const toolResult: MaternalyCopyToolResult = {
      status: "read_error",
      serviceKey: "taller_blw",
      sessions: [
        {
          serviceKey: "taller_blw",
          serviceLabel: "Taller BLW",
          groupId: "grupo_blw_erandio",
          groupName: "Erandio",
          sessionId: "sesion_blw_erandio_20260902",
          sessionName: "Taller BLW",
          date: "2026-09-02",
          startTime: "17:00",
          endTime: "20:00",
          capacityTotal: 14,
          occupied: 0,
          availableSeats: 14,
          full: false,
          availabilityStatus: "available",
        },
      ],
      missingFields: [],
    };

    const reply = renderer.render({
      decision: {
        action: "normalized_registration",
        serviceKey: "taller_blw",
      },
      toolResult,
    });

    expect(reply).toContain("Opciones para Taller BLW");
    expect(reply).toContain("2026-09-02 17:00 Erandio (14 plazas disponibles)");
    expect(reply).not.toMatch(/no puedo validar disponibilidad/i);
  });

  it("keeps greeting warm and within the emoji policy", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({ decision: { action: "greeting" } }) ?? "";

    expect(reply).toMatch(/calma|ayudarte/i);
    expect(reply).toContain("Maternaly");
    expect(reply).not.toMatch(/robot|cl[ií]nica fría/i);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("asks for missing fields with careful wording", () => {
    const renderer = new MaternalyCopyRenderer();
    const toolResult: MaternalyCopyToolResult = {
      status: "collecting_fields",
      serviceKey: "taller_blw",
      sessions: [],
      selectedSession: {
        serviceKey: "taller_blw",
        serviceLabel: "Taller BLW",
        groupId: "grupo_blw_bilbao",
        groupName: "Bilbao",
        sessionId: "sesion_blw_bilbao_20260925",
        sessionName: "Taller BLW",
        date: "2026-09-25",
        startTime: "17:00",
        endTime: "20:00",
        capacityTotal: 14,
        occupied: 0,
        availableSeats: 14,
        full: false,
        availabilityStatus: "available",
      },
      missingFields: ["fullName", "email", "babyBirthDate"],
    };

    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "taller_blw" },
      toolResult,
    }) ?? "";

    expect(reply).toMatch(/con cuidado|me faltan/i);
    expect(reply).toMatch(/nombre y apellidos/i);
    expect(reply).toMatch(/email/i);
    expect(reply).toMatch(/fecha de nacimiento del beb[eé]/i);
    expect(reply).not.toMatch(/necesito:/i);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("renders Pilates with enriched knowledge and soft availability close", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: {
          id: "pilates",
          name: "Pilates Embarazo",
          aliases: ["pilates"],
          category: "informational",
          summary: "Pilates para embarazo en grupos reducidos.",
          details: [],
          requiredData: [],
          pricing: ["59 €/mes 1 clase/semana", "99 €/mes 2 clases/semana"],
          safetyNotes: [],
          nextQuestion: "¿Te apetece que deje tu interés preparado para que el equipo revise disponibilidad?",
        },
      },
    }) ?? "";

    expect(reply).toMatch(/grupos reducidos/i);
    expect(reply).toMatch(/semana 14/i);
    expect(reply).toMatch(/tono muscular|suelo p[eé]lvico|circulaci[oó]n/i);
    expect(reply).toContain("59 €/mes");
    expect(reply).toContain("99 €/mes");
    expect(reply).toMatch(/te apetece/i);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("does not add emojis to clinical handoff copy", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "handoff", reason: "clinical_safety_requires_professional" },
    }) ?? "";

    expect(reply).toMatch(/profesional|equipo de Maternaly/i);
    expect(reply).toMatch(/No puedo hacer diagn[oó]stico/i);
    expect(countEmojis(reply)).toBe(0);
  });

  it("does not force emojis into every standard message", () => {
    const renderer = new MaternalyCopyRenderer();
    const replies = [
      renderer.render({ decision: { action: "greeting" } }) ?? "",
      renderer.render({ decision: { action: "privacy" } }) ?? "",
      renderer.render({ decision: { action: "invoice" } }) ?? "",
    ];

    expect(replies.some((reply) => countEmojis(reply) === 0)).toBe(true);
    expect(replies.every((reply) => countEmojis(reply) <= 2)).toBe(true);
  });
});
