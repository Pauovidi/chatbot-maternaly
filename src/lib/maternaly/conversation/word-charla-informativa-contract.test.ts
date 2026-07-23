import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileConversationStore } from "@/lib/hotel/conversations/file-store";
import { handleInboundMaternalyWhatsApp } from "@/lib/maternaly/conversation/twilio-inbound";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

const CHARLA_SERVICE_ID = "charla_embarazo_1_20";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const pregnancyCatalogContract = [
  /charla informativa gratuita[\s\S]{0,80}(?:semana 1[\s\S]{0,20}20|1\s*[-a]\s*20)/i,
  /test[\s\S]{0,30}ADN fetal/i,
  /Detesex/i,
  /preparaci[oó]n al parto/i,
  /m[eé]todo Maternaly/i,
  /ecograf[ií]a 5\s*D/i,
  /AIPAP[\s\S]{0,30}agua/i,
  /Pilates[\s\S]{0,30}embarazo/i,
  /Yoga[\s\S]{0,30}(?:embarazo|prenatal)/i,
  /m[eé]todo 5\s*P/i,
  /entrenamiento funcional[\s\S]{0,30}embarazo/i,
  /fisioterapia[\s\S]{0,40}embarazo/i,
  /psicolog[ií]a perinatal/i,
] as const;

function createWordCharlaWorkbook(): Record<string, unknown[][]> {
  const workbook = createRealTemplateWorkbook({
    serviceKey: CHARLA_SERVICE_ID,
    visualHeaderRows: false,
  });
  const groupsHeader = workbook.Grupos_Ediciones[0];
  const sessionsHeader = workbook.Sesiones[0];

  workbook.Grupos_Ediciones = [
    groupsHeader,
    [
      "grupo_charla_erandio",
      CHARLA_SERVICE_ID,
      "Charla informativa Erandio",
      "Erandio",
      "Presencial",
      "20",
      "Activa",
      "sí",
      "sí",
    ],
    [
      "grupo_charla_bilbao",
      CHARLA_SERVICE_ID,
      "Charla informativa Bilbao",
      "Bilbao",
      "Presencial",
      "20",
      "Activa",
      "sí",
      "sí",
    ],
    [
      "grupo_charla_online",
      CHARLA_SERVICE_ID,
      "Charla informativa online",
      "Online",
      "Online",
      "40",
      "Activa",
      "sí",
      "sí",
    ],
  ];
  workbook.Sesiones = [
    sessionsHeader,
    [
      "sesion_charla_erandio_20260820",
      "grupo_charla_erandio",
      CHARLA_SERVICE_ID,
      "2026-08-20",
      "18:30",
      "20:00",
      "Erandio",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_erandio_20260924",
      "grupo_charla_erandio",
      CHARLA_SERVICE_ID,
      "2026-09-24",
      "18:30",
      "20:00",
      "Erandio",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_erandio_20261008",
      "grupo_charla_erandio",
      CHARLA_SERVICE_ID,
      "2026-10-08",
      "18:30",
      "20:00",
      "Erandio",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_bilbao_20261006",
      "grupo_charla_bilbao",
      CHARLA_SERVICE_ID,
      "2026-10-06",
      "17:00",
      "18:30",
      "Bilbao",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_bilbao_20261215",
      "grupo_charla_bilbao",
      CHARLA_SERVICE_ID,
      "2026-12-15",
      "17:00",
      "18:30",
      "Bilbao",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_online_20260810",
      "grupo_charla_online",
      CHARLA_SERVICE_ID,
      "2026-08-10",
      "19:00",
      "20:30",
      "Online",
      "Online",
      "Activa",
      "40",
      "0",
      "40",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_online_20260907",
      "grupo_charla_online",
      CHARLA_SERVICE_ID,
      "2026-09-07",
      "19:00",
      "20:30",
      "Online",
      "Online",
      "Activa",
      "40",
      "0",
      "40",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_online_20261005",
      "grupo_charla_online",
      CHARLA_SERVICE_ID,
      "2026-10-05",
      "19:00",
      "20:30",
      "Online",
      "Online",
      "Activa",
      "40",
      "0",
      "40",
      "sí",
      "sí",
      "",
    ],
    // Fechas antiguas o meramente ilustrativas que aparecen en las confirmaciones
    // del Word. Aunque la hoja las conserve, nunca deben ofrecerse como próximas.
    [
      "sesion_charla_erandio_20260625_historica",
      "grupo_charla_erandio",
      CHARLA_SERVICE_ID,
      "2026-06-25",
      "18:30",
      "20:00",
      "Erandio",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_erandio_20260716_historica",
      "grupo_charla_erandio",
      CHARLA_SERVICE_ID,
      "2026-07-16",
      "18:30",
      "20:00",
      "Erandio",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_bilbao_20260616_historica",
      "grupo_charla_bilbao",
      CHARLA_SERVICE_ID,
      "2026-06-16",
      "17:00",
      "18:30",
      "Bilbao",
      "Presencial",
      "Activa",
      "20",
      "0",
      "20",
      "sí",
      "sí",
      "",
    ],
    [
      "sesion_charla_online_20260720_ejemplo",
      "grupo_charla_online",
      CHARLA_SERVICE_ID,
      "2026-07-20",
      "19:00",
      "20:30",
      "Online",
      "Online",
      "Activa",
      "40",
      "0",
      "40",
      "sí",
      "sí",
      "",
    ],
  ];

  return workbook;
}

function expectCompleteCharlaExplanation(reply: string) {
  expect(reply.length).toBeGreaterThan(350);
  expect(reply).toMatch(/gratuita/i);
  expect(reply).toMatch(/semana 1[\s\S]{0,20}(?:semana )?20/i);
  expect(reply).toMatch(/matronas/i);
  expect(reply).toMatch(/cambios[\s\S]{0,40}(?:cuerpo|f[ií]sicos|corporales)/i);
  expect(reply).toMatch(/cuid/i);
  expect(reply).toMatch(/alimentaci[oó]n/i);
  expect(reply).toMatch(/actividad f[ií]sica|ejercicio/i);
  expect(reply).toMatch(/ex[aá]menes|revisiones/i);
  expect(reply).toMatch(/medicaci[oó]n[\s\S]{0,50}segur/i);
  expect(reply).toMatch(/sexualidad/i);
  expect(reply).toMatch(/emocional/i);
  expect(reply).toMatch(/pareja|acompa[nñ](?:ante|ad[ao])/i);
  expect(reply).toMatch(/quieres[\s\S]{0,30}reservar[\s\S]{0,20}plaza/i);
  expect(reply).not.toMatch(/Opciones para|plazas disponibles|2026-\d{2}-\d{2}/i);
}

describe("contrato conversacional del Word: Charla Informativa Gratuita", () => {
  let tempDir = "";
  let harnessSequence = 0;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00.000Z"));
    tempDir = await mkdtemp(path.join(os.tmpdir(), "maternaly-word-charla-"));
    harnessSequence = 0;
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeHarness(
    from = "whatsapp:+34600111222",
    options: { liveWrite?: boolean } = {},
  ) {
    const store = new FileConversationStore(
      path.join(tempDir, `conversation-${++harnessSequence}.json`),
    );
    const client = new InMemoryNormalizedSheetsClient(createWordCharlaWorkbook());
    const env = normalizedTestEnv({
      LLM_PROVIDER: "mock",
      OPENAI_API_KEY: "",
      APP_BASE_URL: "https://maternaly.example.test",
      ...(options.liveWrite
        ? {
            MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
            GOOGLE_SHEETS_ACCESS_MODE: "live",
            BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
          }
        : {}),
    });
    let turn = 0;

    return {
      client,
      async send(body: string) {
        turn += 1;
        return handleInboundMaternalyWhatsApp(
          {
            from,
            body,
            messageSid: `SM_WORD_CHARLA_${harnessSequence}_${turn}`,
          },
          store,
          { normalizedSheetsClient: client, normalizedEnv: env },
        );
      },
    };
  }

  async function reachAvailableOptions(harness: ReturnType<typeof makeHarness>) {
    await harness.send("Cuéntame la charla informativa gratuita para las primeras veinte semanas");

    return harness.send("Sí, me encaja; adelante, guárdame una plaza");
  }

  it("presenta a Ane y pregunta claramente la etapa en el primer saludo", async () => {
    const harness = makeHarness();

    const result = await harness.send("Hola, buenos días");
    const reply = result.botReply?.body ?? "";

    expect(reply).toMatch(/\bAne\b/i);
    expect(reply).toMatch(/en qu[eé][\s\S]{0,40}(?:momento|etapa)[\s\S]{0,30}est[aá]s/i);
    expect(reply).toMatch(/EMBARAZO/i);
    expect(reply).toMatch(/POSTPARTO/i);
    expect(reply).toMatch(/OTROS/i);
  });

  it("devuelve todo el catálogo de embarazo definido en el Word", async () => {
    const harness = makeHarness();
    await harness.send("Hola");

    const result = await harness.send("EMBARAZO");
    const reply = result.botReply?.body ?? "";

    expect(reply).toMatch(/servicios[\s\S]{0,80}embarazo/i);
    for (const servicePattern of pregnancyCatalogContract) {
      expect(reply).toMatch(servicePattern);
    }
    expect(reply).toMatch(/d[ií]melo de uno en uno|cu[aá]l te interesa/i);
  });

  it.each([
    "¿En qué consiste la charla de las primeras veinte semanas? No quiero reservar aún",
    "Estoy de doce semanas y quería saber qué contáis en esa charla gratuita",
    "Antes de apuntarme, explícame bien la sesión que dan las matronas al comienzo del embarazo",
  ])("comprende la paráfrasis y explica la charla antes de abrir la reserva: %s", async (message) => {
    const harness = makeHarness();

    const result = await harness.send(message);

    expect(result.conversation.serviceDetected ?? "").toMatch(/Charla informativa/i);
    expectCompleteCharlaExplanation(result.botReply?.body ?? "");
    expect(result.conversation.maternalyNormalizedFlow?.stage).not.toBe("choosing_session");
  });

  it.each(["no", "no, gracias", "ahora no"])(
    "cierra la invitación de reserva con '%s' sin repetir la charla ni volver a presionar",
    async (decline) => {
      const harness = makeHarness();
      const information = await harness.send(
        "Cuéntame la charla informativa gratuita para las primeras veinte semanas",
      );
      expect(information.conversation.maternalyNormalizedFlow?.stage).toBe(
        "awaiting_booking_decision",
      );

      const declined = await harness.send(decline);
      const reply = declined.botReply?.body ?? "";

      expect(reply).toMatch(/no reservo nada|sin problema/i);
      expect(reply).toMatch(/otros servicios|otra duda/i);
      expect(reply).not.toMatch(
        /cambios que se producen|autocuidados|sexualidad|medicaci[oó]n|quieres reservar tu plaza/i,
      );
      expect(reply).not.toMatch(/Erandio|Bilbao|18:30|17:00|19:00|2026-/i);
      expect(declined.conversation.maternalyNormalizedFlow).toMatchObject({
        stage: "collecting_service",
        pendingFields: [],
      });
      expect(declined.conversation.maternalyNormalizedFlow?.serviceKey).toBeUndefined();
      expect(declined.conversation.serviceDetected).toBeUndefined();

      const catalog = await harness.send("¿Qué otros servicios ofrecéis durante el embarazo?");
      expect(catalog.botReply?.body).toMatch(/Pilates|AIPAP|Yoga/i);
      expect(catalog.botReply?.body).not.toMatch(/quieres reservar tu plaza/i);
    },
  );

  it("al aceptar muestra únicamente las sesiones futuras publicadas en la agenda", async () => {
    const harness = makeHarness();

    const result = await reachAvailableOptions(harness);
    const reply = result.botReply?.body ?? "";

    expect(reply).toMatch(/Erandio[\s\S]{0,90}18:30|18:30[\s\S]{0,90}Erandio/i);
    expect(reply).toMatch(/Bilbao[\s\S]{0,90}17:00|17:00[\s\S]{0,90}Bilbao/i);
    expect(reply).toMatch(/online[\s\S]{0,90}19:00|19:00[\s\S]{0,90}online/i);
    for (const publishedDate of [
      /2026-07-20|20[\/-]07[\/-]2026|20 de julio/i,
      /2026-08-20|20[\/-]08[\/-]2026|20 de agosto/i,
      /2026-09-24|24[\/-]09[\/-]2026|24 de septiembre/i,
      /2026-10-08|08[\/-]10[\/-]2026|8 de octubre/i,
      /2026-10-06|06[\/-]10[\/-]2026|6 de octubre/i,
      /2026-08-10|10[\/-]08[\/-]2026|10 de agosto/i,
      /2026-09-07|07[\/-]09[\/-]2026|7 de septiembre/i,
      /2026-10-05|05[\/-]10[\/-]2026|5 de octubre/i,
    ]) {
      expect.soft(reply).toMatch(publishedDate);
    }
    for (const unpublishedDate of [
      /2026-06-25|25[\/-]06[\/-]2026|25 de junio/i,
      /2026-07-16|16[\/-]07[\/-]2026|16 de julio/i,
      /2026-06-16|16[\/-]06[\/-]2026|16 de junio/i,
      /2026-12-15|15[\/-]12[\/-]2026|15 de diciembre/i,
    ]) {
      expect.soft(reply).not.toMatch(unpublishedDate);
    }
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("choosing_session");
  });

  it("mantiene la misma numeración mostrada al elegir solo la opción 1", async () => {
    const harness = makeHarness();
    await reachAvailableOptions(harness);

    const selected = await harness.send("1");

    expect(selected.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe(
      "sesion_charla_online_20260720_ejemplo",
    );
    expect(selected.botReply?.body).toMatch(/una o dos personas|1 o 2 personas/i);
  });

  it("entiende 'Sí, en la online', muestra solo sus fechas y resuelve el ordinal sobre esa lista", async () => {
    const harness = makeHarness();
    await harness.send("Cuéntame la charla informativa gratuita para las primeras veinte semanas");

    const options = await harness.send("Sí, en la online");
    const reply = options.botReply?.body ?? "";

    const detectedIntent = [...options.conversation.events]
      .reverse()
      .find((event) => event.eventType === "maternaly_intent_detected");
    expect(detectedIntent?.payload).toMatchObject({
      intent: "registration_start",
      needsAvailabilityLookup: true,
    });
    expect(options.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "choosing_session",
      location: "online",
      modality: "online",
    });
    expect(reply).toMatch(/online[\s\S]{0,80}19:00/i);
    expect(reply).toMatch(/1\.\s*20 de julio/i);
    expect(reply).toMatch(/2\.\s*10 de agosto/i);
    expect(reply).toMatch(/3\.\s*7 de septiembre/i);
    expect(reply).toMatch(/4\.\s*5 de octubre/i);
    expect(reply).not.toMatch(/Erandio|Bilbao|18:30|17:00/i);
    expect(reply).not.toMatch(/quieres reservar tu plaza/i);
    expect(harness.client.appended).toHaveLength(0);

    const selected = await harness.send("1");
    expect(selected.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe(
      "sesion_charla_online_20260720_ejemplo",
    );
    expect(selected.botReply?.body).toMatch(/una o dos personas|1 o 2 personas/i);
    expect(harness.client.appended).toHaveLength(0);
  });

  it("conserva una preferencia online declarada al pedir la explicación y la aplica al aceptar", async () => {
    const harness = makeHarness();
    const information = await harness.send(
      "Cuéntame la charla informativa gratuita online para las primeras veinte semanas",
    );
    expect(information.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "awaiting_booking_decision",
      location: "online",
      modality: "online",
    });

    const options = await harness.send("Sí");
    const reply = options.botReply?.body ?? "";
    expect(reply).toMatch(/online[\s\S]{0,80}19:00/i);
    expect(reply).not.toMatch(/Erandio|Bilbao|18:30|17:00/i);
    expect(options.conversation.maternalyNormalizedFlow?.stage).toBe("choosing_session");
    expect(harness.client.appended).toHaveLength(0);
  });

  it.each([
    {
      answer: "vale, la de Bilbao",
      expectedLocation: "bilbao",
      expectedSession: "sesion_charla_bilbao_20261006",
      expectedDates: [/1\.\s*6 de octubre/i, /2\.\s*15 de diciembre/i],
      excluded: /Erandio|Online|18:30|19:00/i,
    },
    {
      answer: "de acuerdo, presencial en Erandio",
      expectedLocation: "erandio",
      expectedSession: "sesion_charla_erandio_20260820",
      expectedDates: [/1\.\s*20 de agosto/i, /2\.\s*24 de septiembre/i, /3\.\s*8 de octubre/i],
      excluded: /Bilbao|Online|17:00|19:00/i,
    },
  ])(
    "compone '$answer' y mantiene alineadas lista y selección",
    async ({ answer, expectedLocation, expectedSession, expectedDates, excluded }) => {
      const harness = makeHarness();
      await harness.send("Cuéntame la charla informativa gratuita para las primeras veinte semanas");

      const options = await harness.send(answer);
      const reply = options.botReply?.body ?? "";
      expect(options.conversation.maternalyNormalizedFlow).toMatchObject({
        stage: "choosing_session",
        location: expectedLocation,
        modality: "presencial",
      });
      for (const expectedDate of expectedDates) {
        expect(reply).toMatch(expectedDate);
      }
      expect(reply).not.toMatch(excluded);
      expect(harness.client.appended).toHaveLength(0);

      const selected = await harness.send("1");
      expect(selected.conversation.maternalyNormalizedFlow?.selectedSessionId).toBe(expectedSession);
      expect(harness.client.appended).toHaveLength(0);
    },
  );

  it("responde la duda previa sin convertirla en consentimiento ni guardar modalidad", async () => {
    const harness = makeHarness();
    await harness.send("Cuéntame la charla informativa gratuita para las primeras veinte semanas");

    const result = await harness.send("Sí, online, pero antes dime cuánto dura");
    const reply = result.botReply?.body ?? "";

    const detectedIntent = [...result.conversation.events]
      .reverse()
      .find((event) => event.eventType === "maternaly_intent_detected");
    expect(detectedIntent?.payload).toMatchObject({
      intent: "service_question",
      serviceQuestionFocus: "duration",
      needsAvailabilityLookup: false,
    });
    expect(result.conversation.maternalyNormalizedFlow?.stage).toBe("awaiting_booking_decision");
    expect(result.conversation.maternalyNormalizedFlow?.location).toBeUndefined();
    expect(result.conversation.maternalyNormalizedFlow?.modality).toBeUndefined();
    expect(reply).toMatch(/dur|hora|minut/i);
    expect(reply).not.toMatch(/10 de agosto|7 de septiembre|5 de octubre/i);
    expect(harness.client.appended).toHaveLength(0);
  });

  it("completa y escribe la cita con el diálogo exacto observado en WhatsApp", async () => {
    const harness = makeHarness("whatsapp:+34999000142", { liveWrite: true });
    await harness.send("Cuéntame la charla informativa gratuita para las primeras veinte semanas");

    const agenda = await harness.send("pues si, quiero agendar ¿es posible?");
    expect(agenda.botReply?.body).toMatch(/10 de agosto de 2026/i);
    expect(agenda.botReply?.body).not.toMatch(/Te sigo|elegir un servicio/i);

    const selected = await harness.send("quiero el 10 de agosto");
    expect(selected.botReply?.body).toMatch(/acudir[eé]is una o dos personas/i);

    const attendees = await harness.send("yo y mi pareja");
    expect(attendees.botReply?.body).toMatch(/nombre y apellidos/i);

    const completed = await harness.send(
      'Mi nombre es "Paola Esto Es Una Prueba" y mi pareja Manolo. fecha probable de parto 14 de Oct',
    );
    expect(completed.conversation.maternalyNormalizedFlow).toMatchObject({
      stage: "write_planned",
      selectedSessionId: "sesion_charla_online_20260810",
      fullName: "Paola Esto Es Una Prueba",
      peopleCount: 2,
      partnerName: "Manolo",
      fppOrDueDate: "2026-10-14",
    });
    expect(harness.client.appended.map((entry) => entry.tabTitle)).toContain("Inscripciones");
    const registrationWrite = harness.client.appended.find(
      (entry) => entry.tabTitle === "Inscripciones",
    );
    expect(registrationWrite?.values.join("|")).toMatch(/Paola\|Esto Es Una Prueba/i);
    expect(registrationWrite?.values.join("|")).toMatch(/sesion_charla_online_20260810/i);
    expect(registrationWrite?.values.join("|")).toMatch(/2026-10-14/i);
    expect(registrationWrite?.values.join("|")).toMatch(/Manolo/i);
    const writeEvent = [...completed.conversation.events]
      .reverse()
      .find(
        (event) =>
          event.eventType === "maternaly_tool_executed" &&
          isRecord(event.payload) &&
          event.payload.status === "write_result",
      );
    expect(writeEvent?.payload).toMatchObject({ applied: true, mode: "live" });
    expect(completed.botReply?.body).toMatch(
      /preinscripci[oó]n[\s\S]{0,50}registrad|pendiente de validaci[oó]n/i,
    );
    expect(completed.botReply?.body).not.toMatch(/me faltan estos datos|Te sigo/i);
  });

  it.each([
    {
      label: "Erandio",
      option: "Opción 1: Erandio, 20 de agosto",
      sessionId: "sesion_charla_erandio_20260820",
      from: "whatsapp:+34600111221",
      phone: "+34 600 111 221",
      datePattern: /20 de agosto|20[\/-]08[\/-]2026|2026-08-20/i,
      confirmationPatterns: [
        /Erandio/i,
        /18:30/,
        /Jos[eé] Luis Goyoaga,? 32/i,
        /timbre[\s\S]{0,40}112/i,
      ],
    },
    {
      label: "Bilbao",
      option: "Opción 2: Bilbao, 6 de octubre",
      sessionId: "sesion_charla_bilbao_20261006",
      from: "whatsapp:+34600111222",
      phone: "+34 600 111 222",
      datePattern: /6 de octubre|06[\/-]10[\/-]2026|2026-10-06/i,
      confirmationPatterns: [/Bilbao/i, /17:00/, /Paseo Uribitarte 22/i],
    },
    {
      label: "online",
      option: "Opción 3: online, 10 de agosto",
      sessionId: "sesion_charla_online_20260810",
      from: "whatsapp:+34600111223",
      phone: "+34 600 111 223",
      datePattern: /10 de agosto|10[\/-]08[\/-]2026|2026-08-10/i,
      confirmationPatterns: [/on\s*line|online/i, /19:00/, /Zoom/i, /claves|conectar/i],
    },
  ])(
    "recoge los datos del Word y usa la confirmación específica de $label",
    async ({ option, sessionId, from, phone, datePattern, confirmationPatterns }) => {
      const harness = makeHarness(from, { liveWrite: true });
      await reachAvailableOptions(harness);

      const selected = await harness.send(option);
      expect.soft(selected.botReply?.body).toMatch(/una o dos personas|1 o 2 personas/i);

      const attendees = await harness.send("Iremos dos personas");
      const collectionPrompt = attendees.botReply?.body ?? "";
      expect.soft(collectionPrompt).toMatch(/nombre y apellidos/i);
      expect.soft(collectionPrompt).not.toMatch(/email|correo electr[oó]nico/i);

      const completed = await harness.send(
        `Soy Laura Ruiz Martínez, teléfono ${phone}, pareja: Mario López, FPP 31/12/2026`,
      );
      const state = completed.conversation.maternalyNormalizedFlow;
      const confirmation = completed.botReply?.body ?? "";

      expect.soft(state).toMatchObject({
        selectedSessionId: sessionId,
        fullName: "Laura Ruiz Martínez",
        phone: from.replace(/^whatsapp:/, ""),
        peopleCount: 2,
        partnerName: "Mario López",
      });
      expect.soft(state?.fppOrDueDate).toMatch(/2026-12-31|31\/12\/2026/);
      expect.soft(harness.client.appended.length).toBeGreaterThan(0);
      const writeEvent = [...completed.conversation.events]
        .reverse()
        .find(
          (event) =>
            event.eventType === "maternaly_tool_executed" &&
            isRecord(event.payload) &&
            event.payload.status === "write_result",
        );
      expect.soft(writeEvent?.payload).toMatchObject({ applied: true, mode: "live" });
      expect.soft(confirmation).not.toMatch(/email|correo electr[oó]nico/i);
      expect.soft(confirmation).toMatch(/preinscripci[oó]n[\s\S]{0,50}registrad|pendiente de validaci[oó]n/i);
      expect.soft(confirmation).not.toMatch(/plaza[\s\S]{0,20}confirmada|reserva[\s\S]{0,20}confirmada/i);
      expect.soft(confirmation).toMatch(datePattern);
      expect.soft(confirmation).toMatch(/634\s*402\s*760/);
      expect.soft(confirmation).toMatch(/info@maternaly\.es/i);
      for (const pattern of confirmationPatterns) {
        expect.soft(confirmation).toMatch(pattern);
      }
    },
  );

  it("en dry-run prepara la solicitud sin afirmar que la plaza esté confirmada", async () => {
    const harness = makeHarness("whatsapp:+34600111224");
    await reachAvailableOptions(harness);
    await harness.send("Online, 10 de agosto");
    await harness.send("Irá una persona");

    const completed = await harness.send(
      "Soy Alba Pérez García, teléfono +34 600 111 224, FPP 30/12/2026",
    );
    const reply = completed.botReply?.body ?? "";

    expect(completed.conversation.maternalyNormalizedFlow?.stage).toBe("write_planned");
    expect(harness.client.appended).toHaveLength(0);
    expect(reply).toMatch(/solicitud[\s\S]{0,40}preparada|pendiente de validaci[oó]n/i);
    expect(reply).not.toMatch(/plaza[\s\S]{0,20}confirmada|reserva[\s\S]{0,20}confirmada/i);
  });

  it("permite cambiar de tema durante la elección y conserva el nuevo contexto", async () => {
    const harness = makeHarness();
    await reachAvailableOptions(harness);

    const pilates = await harness.send(
      "Antes de elegir, cambio de tema: ¿desde qué semana puedo hacer Pilates de embarazo?",
    );
    const pilatesReply = pilates.botReply?.body ?? "";
    expect(pilates.conversation.serviceDetected).toMatch(/Pilates/i);
    expect(pilatesReply).toMatch(/semana 14/i);
    expect(pilatesReply).not.toMatch(/Opciones para Charla|plazas disponibles|2026-08-20/i);

    const followUp = await harness.send("¿Y cuánto cuesta al mes?");
    const followUpReply = followUp.botReply?.body ?? "";
    expect(followUp.conversation.serviceDetected).toMatch(/Pilates/i);
    expect(followUpReply).toMatch(/59\s*€|99\s*€/i);
    expect(followUpReply).not.toMatch(/charla informativa|18:30|17:00|19:00/i);
  });
});
