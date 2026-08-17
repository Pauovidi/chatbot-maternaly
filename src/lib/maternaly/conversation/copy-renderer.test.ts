import { describe, expect, it, vi } from "vitest";
import {
  ensureDistinctMaternalyReply,
  MaternalyCopyRenderer,
  type MaternalyCopyToolResult,
} from "@/lib/maternaly/conversation/copy-renderer";
import { MaternalyGroundedCopyGenerator } from "@/lib/maternaly/conversation/grounded-copy-generator";
import {
  getKnowledgeService,
  MATERNALY_KNOWLEDGE_SERVICES,
} from "@/lib/maternaly/knowledge/catalog";

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

function charlaSession(input: {
  id: string;
  groupId: string;
  location: "Erandio" | "Bilbao" | "online";
  modality: "presencial" | "online";
  date: string;
  startTime: string;
}): MaternalyCopyToolResult["sessions"][number] {
  return {
    serviceKey: "charla_embarazo_1_20",
    serviceLabel: "Charla Informativa",
    groupId: input.groupId,
    groupName: input.location,
    sessionId: input.id,
    sessionName: `Charla ${input.location}`,
    location: input.location,
    modality: input.modality,
    date: input.date,
    startTime: input.startTime,
    capacityTotal: 14,
    occupied: 0,
    availableSeats: 14,
    full: false,
    availabilityStatus: "available",
  };
}

describe("MaternalyCopyRenderer availability guardrails", () => {
  it("does not promise that a reminder was cancelled when that step failed", () => {
    const reply = new MaternalyCopyRenderer().render({
      decision: { action: "cancel_registration" },
      cancellationResult: { status: "cancelled" },
      reminderCancellationStatus: "failed",
    }) ?? "";

    expect(reply).toMatch(/he cancelado tu inscripci[oó]n/i);
    expect(reply).toMatch(/no he podido verificar.*recordatorio/i);
    expect(reply).not.toMatch(/no recibir[aá]s el recordatorio/i);
  });

  it("warns when the registration is cancelled after the reminder stopped being pending", () => {
    const reply = new MaternalyCopyRenderer().render({
      decision: { action: "cancel_registration" },
      cancellationResult: { status: "cancelled" },
      reminderCancellationStatus: "not_pending",
    }) ?? "";

    expect(reply).toMatch(/he cancelado tu inscripci[oó]n/i);
    expect(reply).toMatch(/podr[ií]a encontrarse en proceso de env[ií]o/i);
    expect(reply).toMatch(/es posible que a[uú]n recibas/i);
    expect(reply).not.toMatch(/cancelado.*recordatorio correctamente/i);
  });

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

  it("keeps an unlimited internal capacity out of the customer-facing copy", () => {
    const renderer = new MaternalyCopyRenderer();
    const session = charlaSession({
      id: "sesion_charla_erandio_20260924",
      groupId: "grupo_charla_erandio",
      location: "Erandio",
      modality: "presencial",
      date: "2026-09-24",
      startTime: "18:30",
    });
    session.capacityTotal = undefined;
    session.availableSeats = undefined;
    session.availabilityStatus = "unlimited";

    const reply = renderer.render({
      decision: {
        action: "normalized_registration",
        serviceKey: "charla_embarazo_1_20",
      },
      toolResult: {
        status: "sessions_available",
        serviceKey: "charla_embarazo_1_20",
        sessions: [session],
        missingFields: [],
      },
    }) ?? "";

    expect(reply).toContain("24 de septiembre de 2026, 18:30 — Erandio — presencial");
    expect(reply).not.toMatch(/inscripci[oó]n libre/i);
    expect(reply).not.toMatch(/validar|por confirmar/i);
  });

  it("keeps greeting warm and within the emoji policy", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({ decision: { action: "greeting" } }) ?? "";

    expect(reply).toMatch(/Soy Ane, la asistente virtual de Maternaly/i);
    expect(reply).toMatch(/Macarena.*contactar contigo personalmente/i);
    expect(reply).toMatch(/EMBARAZO[\s\S]*POSTPARTO[\s\S]*OTROS/);
    expect(reply).not.toMatch(/robot|cl[ií]nica fría/i);
    expect(countEmojis(reply)).toBeLessThanOrEqual(2);
  });

  it("does not ask for the journey stage again on a later greeting", () => {
    const reply = new MaternalyCopyRenderer().render({
      decision: { action: "greeting" },
      state: {
        journeyStage: "embarazo",
        pregnancyMonth: 5,
        stage: "collecting_service",
        updatedAt: "2026-07-20T10:00:00.000Z",
      },
      message: "buenas tardes",
    }) ?? "";

    expect(reply).toMatch(/embarazada de 5 meses/i);
    expect(reply).not.toMatch(/en qu[eé] momento|EMBARAZO[\s\S]*POSTPARTO/i);
  });

  it("lists the pregnancy menu from the conversational contract", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "catalog_info", journeyStage: "embarazo" },
      message: "Estoy embarazada",
    }) ?? "";

    expect(reply).toMatch(/Charla informativa gratuita.*semana 1.*semana 20/i);
    expect(reply).toMatch(/Preparaci[oó]n al parto[\s\S]*M[eé]todo Maternaly/i);
    expect(reply).toMatch(/Taller BLW.*Baby-Led Weaning/i);
    expect(reply).toMatch(/AIPAP Agua[\s\S]*Pilates para el embarazo[\s\S]*Yoga para el embarazo/i);
    expect(reply).toMatch(/Fisioterapia en el embarazo[\s\S]*Psicolog[ií]a perinatal/i);
  });

  it("acknowledges the known pregnancy month instead of asking for the stage again", () => {
    const reply = new MaternalyCopyRenderer().render({
      decision: { action: "catalog_info", journeyStage: "embarazo" },
      state: {
        journeyStage: "embarazo",
        pregnancyMonth: 5,
        stage: "collecting_service",
        updatedAt: "2026-07-20T10:00:00.000Z",
      },
      message: "Estoy embarazada de 5 meses y necesito saber qué servicios ofrecéis",
    }) ?? "";

    expect(reply).toMatch(/embarazada de 5 meses/i);
    expect(reply).not.toMatch(/en qu[eé] momento est[aá]s|en qu[eé] etapa est[aá]s/i);
  });

  it("explains the Charla completely before offering dates", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "service_info",
        service: getKnowledgeService("charla_embarazo_1_20"),
        serviceQuestionFocus: "general",
      },
      message: "¿Qué me puedes contar de la charla?",
    }) ?? "";

    expect(reply).toMatch(/desde el comienzo del embarazo|semana 1.*20/i);
    expect(reply).toMatch(/matronas/i);
    expect(reply).toMatch(/cambios.*cuerpo[\s\S]*autocuidados[\s\S]*alimentaci[oó]n[\s\S]*actividad f[ií]sica/i);
    expect(reply).toMatch(/pruebas.*ex[aá]menes[\s\S]*medicaci[oó]n.*segura/i);
    expect(reply).toMatch(/sexualidad[\s\S]*cambios emocionales/i);
    expect(reply).toMatch(/presencial[\s\S]*online en directo/i);
    expect(reply).toMatch(/sola o acompa[nñ]ada/i);
    expect(reply).toMatch(/¿Quieres reservar tu plaza\?/i);
    expect(reply).not.toMatch(/2026-\d{2}-\d{2}|plazas disponibles/i);
  });

  it("shows the Charla sessions published in the agenda with their real availability", () => {
    const renderer = new MaternalyCopyRenderer();
    const toolResult: MaternalyCopyToolResult = {
      status: "sessions_available",
      serviceKey: "charla_embarazo_1_20",
      sessions: [
        charlaSession({
          id: "sesion_charla_bilbao_20261006",
          groupId: "grupo_charla_bilbao",
          location: "Bilbao",
          modality: "presencial",
          date: "2026-10-06",
          startTime: "17:00",
        }),
        charlaSession({
          id: "sesion_charla_online_20260810",
          groupId: "grupo_charla_online",
          location: "online",
          modality: "online",
          date: "2026-08-10",
          startTime: "19:00",
        }),
        charlaSession({
          id: "sesion_charla_erandio_20260820",
          groupId: "grupo_charla_erandio",
          location: "Erandio",
          modality: "presencial",
          date: "2026-08-20",
          startTime: "18:30",
        }),
      ],
      missingFields: [],
    };

    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "charla_embarazo_1_20" },
      toolResult,
    }) ?? "";

    expect(reply).toContain("sesiones publicadas para la Charla Informativa");
    expect(reply).toContain("10 de agosto de 2026, 19:00 — online (14 plazas disponibles)");
    expect(reply).toContain("20 de agosto de 2026, 18:30 — Erandio — presencial (14 plazas disponibles)");
    expect(reply).toContain("6 de octubre de 2026, 17:00 — Bilbao — presencial (14 plazas disponibles)");
    expect(reply.indexOf("10 de agosto")).toBeLessThan(reply.indexOf("20 de agosto"));
    expect(reply.indexOf("20 de agosto")).toBeLessThan(reply.indexOf("6 de octubre"));
  });

  it("asks Charla attendance count before any contact field", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "charla_embarazo_1_20" },
      toolResult: {
        status: "collecting_fields",
        serviceKey: "charla_embarazo_1_20",
        sessions: [],
        selectedSession: charlaSession({
          id: "sesion_charla_erandio_20260820",
          groupId: "grupo_charla_erandio",
          location: "Erandio",
          modality: "presencial",
          date: "2026-08-20",
          startTime: "18:30",
        }),
        missingFields: ["peopleCount", "fullName", "phone", "partnerName", "fppOrDueDate"],
      },
    }) ?? "";

    expect(reply).toMatch(/¿acudir[eé]is una o dos personas\?/i);
    expect(reply).not.toMatch(/nombre y apellidos|tel[eé]fono|email|fecha probable de parto/i);
  });

  it("uses request-prepared wording for a dry-run Charla result", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "charla_embarazo_1_20" },
      toolResult: {
        status: "write_result",
        serviceKey: "charla_embarazo_1_20",
        sessions: [],
        selectedSession: charlaSession({
          id: "sesion_charla_erandio_20260820",
          groupId: "grupo_charla_erandio",
          location: "Erandio",
          modality: "presencial",
          date: "2026-08-20",
          startTime: "18:30",
        }),
        missingFields: [],
        plan: { blocked: false, blockedReasons: [] },
        writeResult: { ok: true, mode: "dry_run", applied: false },
      },
    }) ?? "";

    expect(reply).toMatch(/solicitud preparada/i);
    expect(reply).not.toMatch(/preinscripci[oó]n.*registrada|plaza confirmada/i);
    expect(reply).toMatch(/Charla informativa presencial en Erandio/i);
    expect(reply).toMatch(/Jos[eé] Luis Goyoaga 32[\s\S]*timbre 112/i);
  });

  it("confirms a live Charla registration after the append succeeds", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "charla_embarazo_1_20" },
      toolResult: {
        status: "write_result",
        serviceKey: "charla_embarazo_1_20",
        sessions: [],
        selectedSession: charlaSession({
          id: "sesion_charla_online_20260810",
          groupId: "grupo_charla_online",
          location: "online",
          modality: "online",
          date: "2026-08-10",
          startTime: "19:00",
        }),
        missingFields: [],
        plan: { blocked: false, blockedReasons: [] },
        writeResult: { ok: true, mode: "live", applied: true },
      },
    }) ?? "";

    expect(reply).toMatch(/reserva.*confirmada/i);
    expect(reply).not.toMatch(/preinscripci[oó]n|pendiente de validaci[oó]n/i);
    expect(reply).toMatch(/online en directo por Zoom/i);
    expect(reply).toMatch(/enlace.*clave.*antes del inicio/i);
  });

  it("reports an existing active BLW row as confirmed instead of pending", () => {
    const renderer = new MaternalyCopyRenderer();
    const selectedSession = {
      ...charlaSession({
        id: "sesion_blw_bilbao_20260925",
        groupId: "grupo_blw_bilbao",
        location: "Bilbao",
        modality: "presencial",
        date: "2026-09-25",
        startTime: "17:00",
      }),
      serviceKey: "taller_blw" as const,
      serviceLabel: "Taller BLW",
    };
    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "taller_blw" },
      toolResult: {
        status: "write_result",
        serviceKey: "taller_blw",
        sessions: [selectedSession],
        selectedSession,
        missingFields: [],
        plan: { blocked: false, blockedReasons: [] },
        writeResult: {
          ok: true,
          mode: "live",
          applied: false,
          registrationPersisted: true,
          registrationStatus: "confirmada",
        },
      },
    }) ?? "";

    expect(reply).toMatch(/activa y confirmada/i);
    expect(reply).not.toMatch(/pendiente|no queda cerrada/i);
  });

  it("uses only reliable online access data from the selected session", () => {
    const renderer = new MaternalyCopyRenderer();
    const session = charlaSession({
      id: "sesion_charla_online_20260810",
      groupId: "grupo_charla_online",
      location: "online",
      modality: "online",
      date: "2026-08-10",
      startTime: "19:00",
    });
    session.onlineJoinUrl = "https://zoom.example.test/j/123456";
    session.onlineAccessCode = "MATERNALY-26";

    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "charla_embarazo_1_20" },
      toolResult: {
        status: "write_result",
        serviceKey: "charla_embarazo_1_20",
        sessions: [],
        selectedSession: session,
        missingFields: [],
        plan: { blocked: false, blockedReasons: [] },
        writeResult: { ok: true, mode: "live", applied: true },
      },
    }) ?? "";

    expect(reply).toContain("Enlace de acceso: https://zoom.example.test/j/123456");
    expect(reply).toContain("Clave de acceso: MATERNALY-26");
    expect(reply).not.toMatch(/te enviar[aá].*enlace/i);
  });

  it.each([
    {
      label: "only a reliable link",
      joinUrl: "https://zoom.example.test/j/123456",
      accessCode: undefined,
      expectedData: "Enlace de acceso: https://zoom.example.test/j/123456",
      expectedPending: /enviará la clave de acceso pendiente/i,
      forbiddenData: /Clave de acceso:/i,
    },
    {
      label: "only an access code",
      joinUrl: undefined,
      accessCode: "MATERNALY-26",
      expectedData: "Clave de acceso: MATERNALY-26",
      expectedPending: /enviará el enlace de acceso pendiente/i,
      forbiddenData: /Enlace de acceso:/i,
    },
    {
      label: "an insecure link and an access code",
      joinUrl: "http://zoom.example.test/j/123456",
      accessCode: "MATERNALY-26",
      expectedData: "Clave de acceso: MATERNALY-26",
      expectedPending: /enviará el enlace de acceso pendiente/i,
      forbiddenData: /http:\/\//i,
    },
  ])("does not present partial online credentials as sufficient with $label", ({
    joinUrl,
    accessCode,
    expectedData,
    expectedPending,
    forbiddenData,
  }) => {
    const renderer = new MaternalyCopyRenderer();
    const session = charlaSession({
      id: "sesion_charla_online_20260810",
      groupId: "grupo_charla_online",
      location: "online",
      modality: "online",
      date: "2026-08-10",
      startTime: "19:00",
    });
    session.onlineJoinUrl = joinUrl;
    session.onlineAccessCode = accessCode;

    const reply = renderer.render({
      decision: { action: "normalized_registration", serviceKey: "charla_embarazo_1_20" },
      toolResult: {
        status: "write_result",
        serviceKey: "charla_embarazo_1_20",
        sessions: [],
        selectedSession: session,
        missingFields: [],
        plan: { blocked: false, blockedReasons: [] },
        writeResult: { ok: true, mode: "live", applied: true },
      },
    }) ?? "";

    expect(reply).toContain(expectedData);
    expect(reply).toMatch(expectedPending);
    expect(reply).not.toMatch(forbiddenData);
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

  it("asks for the service when the user wants an appointment without restarting the greeting", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: {
        action: "booking_service_selection",
        journeyStage: "embarazo",
      },
      message: "no, lo que quiero es agendar cita",
    }) ?? "";

    expect(reply).toMatch(/vamos a agendarla|quieres agendar/i);
    expect(reply).toMatch(/servicio concreto|qu[eé] servicio/i);
    expect(reply).toMatch(/Charla Informativa.*Taller BLW/is);
    expect(reply).toMatch(/agenda vinculada|fechas y plazas reales/i);
    expect(reply).not.toMatch(/equipo confirme la agenda/i);
    expect(reply).not.toMatch(/soy Ane|en qu[eé] etapa|EMBARAZO, POSTPARTO|Puntos clave/i);
  });

  it("does not use structural labels to disguise a repeated reply", () => {
    const reply = "El taller BLW es presencial y dura tres horas.";
    const distinct = ensureDistinctMaternalyReply({
      reply,
      recentAssistantReplies: [reply],
      action: "service_info",
    });

    expect(distinct.reply).not.toMatch(/^Puntos clave|^Datos concretos|^En concreto,/i);
  });

  it("repeats the concrete answer instead of losing context when every alternative was used", () => {
    const reply = "El taller BLW es presencial y dura tres horas.";
    const naturalAlternative = "El taller BLW se realiza de forma presencial y dura tres horas.";
    const distinct = ensureDistinctMaternalyReply({
      reply,
      recentAssistantReplies: [reply, naturalAlternative],
      action: "service_info",
    });

    expect(distinct).toEqual({ reply, changed: false, duplicateCount: 1 });
    expect(distinct.reply).toMatch(/BLW.*presencial.*tres horas/i);
    expect(distinct.reply).not.toMatch(/Dime qu[eé] necesitas resolver|Puntos clave/i);
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

  it("builds the general portfolio from every canonical service", () => {
    const renderer = new MaternalyCopyRenderer();
    const reply = renderer.render({
      decision: { action: "catalog_info" },
      message: "¿Qué servicios dais?",
    }) ?? "";

    for (const service of MATERNALY_KNOWLEDGE_SERVICES) {
      expect(reply).toContain(service.name);
    }
    expect(reply).toContain("Taller BLW");
  });

  it("keeps the complete catalog deterministic even when adaptive copy is configured", async () => {
    const fetchMock = vi.fn();
    const renderer = new MaternalyCopyRenderer(
      new MaternalyGroundedCopyGenerator({
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    );
    const result = await renderer.renderGrounded(
      {
        decision: { action: "catalog_info" },
        message: "¿Qué servicios dais?",
        intent: {
          intent: "service_discovery",
          slots: {},
          service_scope: "catalog",
          service_question_focus: "general",
          needs_availability_lookup: false,
          confidence: 0.99,
          missing_fields: [],
          should_handoff: false,
          safety_flags: [],
        },
      },
      { OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv,
    );

    for (const service of MATERNALY_KNOWLEDGE_SERVICES) {
      expect(result?.text).toContain(service.name);
    }
    expect(result).toMatchObject({ mode: "skipped", attempted: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses grounded copy to acknowledge gestational context without opening BLW availability", async () => {
    const contextualDraft =
      "Gracias por contármelo; eso me ayuda a situar mejor la consulta. Durante el embarazo, el taller BLW puede servirte para preparar una etapa posterior: está pensado para cuando el bebé se acerque al inicio de la alimentación complementaria. Si te apetece, seguimos viendo BLW con calma para más adelante o te oriento ahora entre los servicios de embarazo de Maternaly. 💛";
    const fetchMock = vi.fn(
      async (...args: Parameters<typeof fetch>) => {
        void args;
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              plans: [
                { opening_id: "none", closing_id: "available" },
                { opening_id: "none", closing_id: "unhurried" },
              ],
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const renderer = new MaternalyCopyRenderer(
      new MaternalyGroundedCopyGenerator({
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    );
    const result = await renderer.renderGrounded(
      {
        decision: {
          action: "service_info",
          service: getKnowledgeService("taller_blw"),
          serviceQuestionFocus: "general",
        },
        message: "estoy en el quinto mes, por cierto",
        recentTurns: [
          { role: "assistant", text: "Te he contado el Taller BLW." },
          { role: "user", text: "Estoy en [etapa de embarazo compartida], por cierto." },
        ],
        intent: {
          intent: "general_info",
          slots: { pregnancy_month: 5 },
          service_scope: "contextual",
          service_candidate: "taller_blw",
          service_question_focus: "general",
          pregnancy_month: 5,
          needs_availability_lookup: false,
          confidence: 0.98,
          missing_fields: [],
          should_handoff: false,
          safety_flags: [],
        },
      },
      {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "test-key",
        LLM_MODEL: "gpt-4.1-mini-test",
      } as NodeJS.ProcessEnv,
    );

    expect(result).toMatchObject({
      text: `${contextualDraft}\n\nEstoy aquí para seguir contigo.`,
      mode: "generated",
      source: "grounded_generator",
      attempted: true,
    });
    expect(result?.text).toContain(contextualDraft);
    expect(result?.text).not.toMatch(/plazas disponibles|2026-\d{2}-\d{2}|Opciones para/i);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      input: Array<{ role: string; content: string }>;
    };
    const requestInput = JSON.parse(requestBody.input[1].content) as {
      action: string;
      context_mode: string;
      draft_shape: Record<string, unknown>;
    };
    expect(requestInput).toMatchObject({
      action: "service_info",
      context_mode: "shared_context",
    });
    expect(requestInput).not.toHaveProperty("authorized_facts");
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("Taller BLW");
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain(contextualDraft);
  });

  it("keeps a contextual BLW answer when grounded generation is unavailable", async () => {
    const renderer = new MaternalyCopyRenderer();
    const result = await renderer.renderGrounded(
      {
        decision: { action: "general" },
        state: {
          serviceKey: "taller_blw",
          stage: "collecting_service",
          updatedAt: "2026-07-17T00:00:00.000Z",
        },
        message: "estoy en el quinto mes, por cierto",
        intent: {
          intent: "general_info",
          slots: { pregnancy_month: 5 },
          service_scope: "unknown",
          service_question_focus: "unknown",
          pregnancy_month: 5,
          needs_availability_lookup: false,
          confidence: 0.98,
          missing_fields: [],
          should_handoff: false,
          safety_flags: [],
        },
      },
      { LLM_PROVIDER: "openai", OPENAI_API_KEY: "" } as NodeJS.ProcessEnv,
    );

    expect(result).toMatchObject({
      mode: "skipped",
      reason: "missing_api_key",
      attempted: false,
    });
    expect(result?.text).toMatch(/BLW.*preparar una etapa posterior/i);
    expect(result?.text).not.toMatch(/plazas disponibles|2026-\d{2}-\d{2}|Opciones para/i);
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
