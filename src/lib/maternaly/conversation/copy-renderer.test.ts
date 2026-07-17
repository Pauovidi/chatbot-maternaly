import { describe, expect, it } from "vitest";
import {
  ensureDistinctMaternalyReply,
  MaternalyCopyRenderer,
  type MaternalyCopyToolResult,
} from "@/lib/maternaly/conversation/copy-renderer";
import { getKnowledgeService } from "@/lib/maternaly/knowledge/catalog";

const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const clinicalClosing =
  "Si el sangrado, el dolor o cualquier síntoma importante empeora, mi recomendación es que contactes lo antes posible con tu médico o acudas a urgencias.";

function countEmojis(text: string): number {
  return Array.from(text.matchAll(emojiPattern)).length;
}

function pilatesService() {
  return {
    id: "pilates" as const,
    name: "Pilates Embarazo",
    aliases: ["pilates"],
    category: "informational" as const,
    summary: "Pilates para embarazo en grupos reducidos.",
    details: [],
    requiredData: [],
    pricing: ["59 €/mes 1 clase/semana", "99 €/mes 2 clases/semana"],
    safetyNotes: [],
    nextQuestion: "¿Te apetece que deje tu interés preparado para que el equipo revise disponibilidad?",
  };
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

  it("keeps reset copy technical even when the same acknowledgement was already sent", () => {
    const reply = "Listo, conversación reiniciada. Empezamos desde cero. ¿En qué puedo ayudarte?";
    const distinct = ensureDistinctMaternalyReply({
      reply,
      recentAssistantReplies: [reply],
      action: "reset",
    });

    expect(distinct).toEqual({ reply, changed: false, duplicateCount: 1 });
    expect(distinct.reply).not.toMatch(/repetitiva|otra manera|otro [aá]ngulo/i);
  });

  it("never hides a word-for-word duplicate behind a new opening", () => {
    const reply = "El taller BLW es presencial y dura tres horas.";
    const distinct = ensureDistinctMaternalyReply({
      reply,
      recentAssistantReplies: [reply],
      action: "service_info",
    });

    expect(distinct.changed).toBe(true);
    expect(distinct.reply).not.toContain(reply);
    expect(distinct.reply).not.toMatch(/repetitiva|otra manera|misma respuesta/i);
  });

  it("keeps the concrete answer when it reformulates a repeated price reply", () => {
    const renderer = new MaternalyCopyRenderer();
    const renderInput = {
      decision: {
        action: "service_info" as const,
        service: getKnowledgeService("taller_blw"),
        serviceQuestionFocus: "pricing" as const,
      },
    };
    const reply = renderer.render(renderInput) ?? "";
    const distinct = ensureDistinctMaternalyReply({
      reply,
      recentAssistantReplies: [reply],
      action: "service_info",
      preferredAlternatives: renderer.renderAlternatives(renderInput),
    });

    expect(distinct.reply).not.toContain(reply);
    expect(distinct.reply).toMatch(/45\s*€[\s\S]*75\s*€/);
    expect(distinct.reply).toMatch(/precio|cuesta/i);
    expect(distinct.reply).toMatch(/reserva y el pago han sido validados/i);
    expect(distinct.reply).not.toMatch(/se han la reserva/i);
  });

  it("uses a natural full redaction for repeated general BLW information", () => {
    const renderer = new MaternalyCopyRenderer();
    const renderInput = {
      decision: {
        action: "service_info" as const,
        service: getKnowledgeService("taller_blw"),
        serviceQuestionFocus: "general" as const,
      },
      message: "¿qué me puedes contar del taller?",
    };
    const reply = renderer.render(renderInput) ?? "";
    const distinct = ensureDistinctMaternalyReply({
      reply,
      recentAssistantReplies: [reply],
      action: "service_info",
      preferredAlternatives: renderer.renderAlternatives(renderInput),
    });

    expect(distinct.reply).not.toContain(reply);
    expect(distinct.reply).toMatch(/seguridad|cortes|alergias/i);
    expect(distinct.reply).toMatch(/45\s*€[\s\S]*75\s*€/);
    expect(distinct.reply).not.toMatch(/^Puntos clave|En concreto,/i);
  });

  it("answers a catalog-wide online workshop question without centering BLW", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "catalog_info", modalityPreference: "online" },
      message: "¿tenéis algún taller online?",
    }) ?? "";

    expect(reply).toMatch(/taller online.*ninguno confirmado|opci[oó]n online/i);
    expect(reply).toMatch(/charla informativa gratuita/i);
    expect(reply).not.toMatch(/^El taller BLW|te cuento c[oó]mo es el BLW/i);
  });

  it("answers a catalog-wide presencial question with confirmed presencial options", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "catalog_info", modalityPreference: "presencial" },
      message: "¿qué actividades presenciales tenéis?",
    }) ?? "";

    expect(reply).toMatch(/opciones presenciales/i);
    expect(reply).toMatch(/Charla[\s\S]*Taller BLW[\s\S]*Pilates/i);
    expect(reply).not.toMatch(/opci[oó]n online/i);
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

  it("renders Pilates general info without the full schedule and pricing block", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: pilatesService(),
        serviceQuestionFocus: "general",
      },
    }) ?? "";

    expect(reply).toMatch(/grupos reducidos|semana 14/i);
    expect(reply).toMatch(/beneficios|horarios|precios/i);
    expect(reply).not.toMatch(/lunes 10:00-11:00/i);
    expect(reply).not.toContain("59 €/mes");
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("renders Pilates benefits without full schedules or prices", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: pilatesService(),
        serviceQuestionFocus: "benefits",
      },
    }) ?? "";

    expect(reply).toMatch(/tono muscular|suelo p[eé]lvico|circulaci[oó]n/i);
    expect(reply).not.toMatch(/lunes 10:00-11:00|Erandio: martes/i);
    expect(reply).not.toContain("59 €/mes");
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("renders only Bilbao schedules when focus and location request Bilbao", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: pilatesService(),
        serviceQuestionFocus: "schedule",
        locationPreference: "Bilbao",
      },
    }) ?? "";

    expect(reply).toContain("Bilbao");
    expect(reply).toMatch(/lunes 10:00-11:00/i);
    expect(reply).toMatch(/mi[eé]rcoles 18:15-19:15/i);
    expect(reply).not.toContain("Erandio");
    expect(reply).not.toContain("59 €/mes");
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("renders start week without full Pilates blocks", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: pilatesService(),
        serviceQuestionFocus: "start_week",
      },
    }) ?? "";

    expect(reply).toMatch(/semana 14/i);
    expect(reply).toMatch(/final de la gestaci[oó]n/i);
    expect(reply).not.toMatch(/lunes 10:00-11:00|59 €\/mes|tono muscular/i);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("renders pricing without full Pilates schedules", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: pilatesService(),
        serviceQuestionFocus: "pricing",
      },
    }) ?? "";

    expect(reply).toContain("59 €/mes");
    expect(reply).toContain("99 €/mes");
    expect(reply).not.toMatch(/lunes 10:00-11:00|martes 17:30-18:30/i);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("renders booking focus without inventing an automatic Pilates place", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: pilatesService(),
        serviceQuestionFocus: "booking",
      },
    }) ?? "";

    expect(reply).toMatch(/no.*confirmo plaza|agenda autom[aá]tica/i);
    expect(reply).toMatch(/equipo de Maternaly revise disponibilidad/i);
    expect(reply).not.toMatch(/plaza confirmada|pago confirmado/i);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it.each([
    ["contents" as const, /cambios del cuerpo|alimentaci[oó]n|medicaci[oó]n segura/i],
    ["eligibility" as const, /semana 1 y la 20|pareja o acompa[nñ]ante/i],
    ["pricing" as const, /gratuita/i],
    ["duration" as const, /no fija una duraci[oó]n [uú]nica/i],
  ])("answers charla focus %s without dumping unrelated blocks", (focus, expected) => {
    const renderer = new MaternalyCopyRenderer();
    const reply =
      renderer.render({
        decision: {
          action: "service_info",
          service: getKnowledgeService("charla_embarazo_1_20"),
          serviceQuestionFocus: focus,
        },
      }) ?? "";

    expect(reply).toMatch(expected);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it.each([
    ["contents" as const, /autorregulaci[oó]n|alergias alimentarias|alimentaci[oó]n saludable/i],
    ["duration" as const, /3 horas|17:00 a 20:00/i],
    ["eligibility" as const, /comenzar la alimentaci[oó]n complementaria|requisitos de inicio/i],
    ["pricing" as const, /45 €\/persona|75 €\/pareja/i],
  ])("answers BLW focus %s with source-backed detail", (focus, expected) => {
    const renderer = new MaternalyCopyRenderer();
    const reply =
      renderer.render({
        decision: {
          action: "service_info",
          service: getKnowledgeService("taller_blw"),
          serviceQuestionFocus: focus,
        },
      }) ?? "";

    expect(reply).toMatch(expected);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("does not add emojis to clinical handoff copy", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "handoff", reason: "clinical_safety_requires_professional" },
    }) ?? "";

    expect(reply).toMatch(/profesional|equipo de Maternaly/i);
    expect(reply).toMatch(/No puedo hacer diagn[oó]stico/i);
    expect(reply).toContain(clinicalClosing);
    expect(reply).not.toContain("no esperes a la respuesta del bot");
    expect(reply).not.toContain("continúa o te preocupa");
    expect(reply).not.toMatch(/lo dejo preparado/i);
    expect(countEmojis(reply)).toBe(0);
  });

  it("keeps emojis moderate and varied across standard messages", () => {
    const renderer = new MaternalyCopyRenderer();
    const replies = [
      renderer.render({ decision: { action: "greeting" } }) ?? "",
      renderer.render({ decision: { action: "privacy" } }) ?? "",
      renderer.render({ decision: { action: "invoice" } }) ?? "",
      renderer.render({
        decision: { action: "service_info", service: pilatesService(), serviceQuestionFocus: "benefits" },
      }) ?? "",
      renderer.render({
        decision: { action: "service_info", service: pilatesService(), serviceQuestionFocus: "pricing" },
      }) ?? "",
    ];
    const emojis = replies.flatMap((reply) => Array.from(reply.matchAll(emojiPattern), (match) => match[0]));

    expect(replies.some((reply) => countEmojis(reply) === 0)).toBe(true);
    expect(replies.every((reply) => countEmojis(reply) <= 2)).toBe(true);
    expect(new Set(emojis).size).toBeGreaterThanOrEqual(2);
    expect(replies.join("\n").match(/con calma/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
