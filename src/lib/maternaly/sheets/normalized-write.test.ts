import { describe, expect, it } from "vitest";
import { readNormalizedServiceSheet } from "@/lib/maternaly/sheets/normalized-client";
import { listAvailableSessionsFromSnapshot } from "@/lib/maternaly/sheets/normalized-availability";
import {
  applyRegistrationWritePlan,
  buildRegistrationWritePlan,
} from "@/lib/maternaly/sheets/normalized-write";
import {
  InMemoryNormalizedSheetsClient,
  createRealTemplateWorkbook,
  createNormalizedWorkbook,
  normalizedTestEnv,
} from "@/lib/maternaly/sheets/normalized-test-utils";

async function buildFixture(options: Parameters<typeof createNormalizedWorkbook>[0] = {}) {
  const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook(options));
  const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
  const session = listAvailableSessionsFromSnapshot(snapshot)[0];
  if (!session) {
    throw new Error("missing test session");
  }

  return { client, snapshot, session };
}

async function buildRealFixture(options: Parameters<typeof createNormalizedWorkbook>[0] = {}) {
  const client = new InMemoryNormalizedSheetsClient(createRealTemplateWorkbook(options));
  const snapshot = await readNormalizedServiceSheet(options.serviceKey ?? "taller_blw", client, normalizedTestEnv());
  const session = listAvailableSessionsFromSnapshot(snapshot)[0];
  if (!session) {
    throw new Error("missing real template test session");
  }

  return { client, snapshot, session };
}

function appendedRowByHeader(headers: string[], values: Array<string | number | undefined>) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}

describe("normalized Maternaly write plan", () => {
  it("blocks registration when the session is full", async () => {
    const { snapshot, session } = await buildFixture({
      sessionCapacity: "1",
      registrations: [["taller_blw", "sesion_blw_bilbao_20260925", "grupo_blw_bilbao", "Activa"]],
    });
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "taller_blw",
        fullName: "Marta Lopez",
        phone: "+34600111222",
        email: "marta@example.test",
        peopleCount: 1,
      },
      env: normalizedTestEnv(),
    });

    expect(plan.blocked).toBe(true);
    expect(plan.blockedReasons).toContain("session_full");
  });

  it("blocks registration when name or phone is missing", async () => {
    const { snapshot, session } = await buildFixture();
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "taller_blw",
        email: "marta@example.test",
        peopleCount: 1,
      },
      env: normalizedTestEnv(),
    });

    expect(plan.blockedReasons).toEqual(expect.arrayContaining(["missing_full_name", "missing_phone"]));
  });

  it("dry-run does not append rows", async () => {
    const { client, snapshot, session } = await buildFixture();
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "taller_blw",
        fullName: "Marta Lopez",
        phone: "+34600111222",
        email: "marta@example.test",
        peopleCount: 1,
      },
      env: normalizedTestEnv(),
    });
    const result = await applyRegistrationWritePlan({ snapshot, client, plan });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.formattedRanges).toEqual([]);
    expect(result.formatApplied).toBe(false);
    expect(result.formatWarnings).toEqual([]);
    expect(client.appended).toHaveLength(0);
  });

  it("live mode without all live flags does not write", async () => {
    const { client, snapshot, session } = await buildFixture();
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "taller_blw",
        fullName: "Marta Lopez",
        phone: "+34600111222",
        email: "marta@example.test",
        peopleCount: 1,
      },
      env: normalizedTestEnv({ MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live" }),
    });
    const result = await applyRegistrationWritePlan({ snapshot, client, plan });

    expect(result.ok).toBe(false);
    expect(result.applied).toBe(false);
    expect(client.appended).toHaveLength(0);
  });

  it("live mode with flags and allowlist appends only rows", async () => {
    const { client, snapshot, session } = await buildFixture();
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "taller_blw",
        fullName: "Marta Lopez",
        phone: "+34600111222",
        email: "marta@example.test",
        peopleCount: 1,
      },
      env: normalizedTestEnv({
        MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
        GOOGLE_SHEETS_ACCESS_MODE: "live",
        BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
      }),
    });
    const result = await applyRegistrationWritePlan({ snapshot, client, plan });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.formattedRanges).toEqual([
      "Clientes_Local!A2:Z2",
      "Inscripciones!A2:Z2",
      "Interacciones_Chatbot!A2:Z2",
    ]);
    expect(result.formatApplied).toBe(true);
    expect(result.formatWarnings).toEqual([]);
    expect(client.appended.map((item) => item.tabTitle)).toEqual([
      "Clientes_Local",
      "Inscripciones",
      "Interacciones_Chatbot",
    ]);
  });

  it("keeps live append success when visible formatting returns a warning", async () => {
    const client = new InMemoryNormalizedSheetsClient(createNormalizedWorkbook(), {
      failFormatting: true,
    });
    const snapshot = await readNormalizedServiceSheet("taller_blw", client, normalizedTestEnv());
    const session = listAvailableSessionsFromSnapshot(snapshot)[0];
    if (!session) {
      throw new Error("missing test session");
    }
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "taller_blw",
        fullName: "Marta Lopez",
        phone: "+34600111222",
        email: "marta@example.test",
        peopleCount: 1,
      },
      env: normalizedTestEnv({
        MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
        GOOGLE_SHEETS_ACCESS_MODE: "live",
        BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
      }),
    });

    const result = await applyRegistrationWritePlan({ snapshot, client, plan });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.updatedRanges).toHaveLength(3);
    expect(result.formattedRanges).toEqual([]);
    expect(result.formatApplied).toBe(false);
    expect(result.formatWarnings).toEqual([
      "Clientes_Local:synthetic_format_failure",
      "Inscripciones:synthetic_format_failure",
      "Interacciones_Chatbot:synthetic_format_failure",
    ]);
  });

  it("writes real-template columns without requiring technical idempotency columns", async () => {
    const { client, snapshot, session } = await buildRealFixture({
      visualHeaderRows: true,
      sessionCapacity: "14",
    });
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "taller_blw",
        fullName: "PRUEBA BOT BLW",
        phone: "+34999000111",
        email: "prueba.bot.blw@example.test",
        peopleCount: 2,
        babyBirthDate: "2025-01-15",
        notes: "PRUEBA_BOT_CODEX_NO_CLIENTE_REAL",
      },
      env: normalizedTestEnv({
        MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
        GOOGLE_SHEETS_ACCESS_MODE: "live",
        BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
      }),
    });

    expect(plan.blocked).toBe(false);
    expect(plan.blockedReasons).toEqual([]);

    const result = await applyRegistrationWritePlan({ snapshot, client, plan });
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.formatApplied).toBe(true);
    expect(result.formattedRanges).toEqual([
      "Clientes_Local!A4:Z4",
      "Inscripciones!A4:Z4",
      "Interacciones_Chatbot!A4:Z4",
    ]);

    const clientsRow = appendedRowByHeader(
      snapshot.tabs.Clientes_Local.headers,
      client.appended.find((item) => item.tabTitle === "Clientes_Local")?.values ?? [],
    );
    expect(clientsRow.cliente_id).toMatch(/^CLI_BOT_/);
    expect(clientsRow.nombre).toBe("PRUEBA");
    expect(clientsRow.apellidos).toBe("BOT BLW");
    expect(clientsRow.telefono_normalizado).toBe("+34999000111");
    expect(clientsRow.email).toBe("prueba.bot.blw@example.test");
    expect(clientsRow.fecha_nacimiento_bebe).toBe("2025-01-15");
    expect(clientsRow.estado_cliente).toBe("lead");

    const registrationsRow = appendedRowByHeader(
      snapshot.tabs.Inscripciones.headers,
      client.appended.find((item) => item.tabTitle === "Inscripciones")?.values ?? [],
    );
    expect(registrationsRow.inscripcion_id).toMatch(/^INS_BOT_/);
    expect(registrationsRow.cliente_id).toBe(clientsRow.cliente_id);
    expect(registrationsRow.grupo_id).toBe(session.groupId);
    expect(registrationsRow.servicio_id).toBe("taller_blw");
    expect(registrationsRow.precio_acordado).toBe("75 €/pareja");
    expect(registrationsRow.estado_pago).toBe("pendiente");
    expect(registrationsRow.estado_inscripcion).toBe("preinscrita");
    expect(String(registrationsRow.observaciones)).toContain("PRUEBA_BOT_CODEX_NO_CLIENTE_REAL");
    expect(String(registrationsRow.observaciones)).toContain(`session:${session.sessionId}`);

    const interactionsRow = appendedRowByHeader(
      snapshot.tabs.Interacciones_Chatbot.headers,
      client.appended.find((item) => item.tabTitle === "Interacciones_Chatbot")?.values ?? [],
    );
    expect(interactionsRow.interaccion_id).toMatch(/^INT_BOT_/);
    expect(interactionsRow.fecha_hora).toBeTruthy();
    expect(interactionsRow.canal).toBe("whatsapp");
    expect(interactionsRow.telefono).toBe("+34999000111");
    expect(interactionsRow.accion_realizada).toBe("maternaly_normalized_registration_write_plan");
    expect(interactionsRow.resultado).toBe("prepared");
    expect(interactionsRow.requiere_humano).toBe("no");
  });

  it("writes an unlimited Charla registration using the workbook service id", async () => {
    const workbookServiceId = "SER_CHARLA_INFO_EMBARAZO_1_20";
    const workbook = createRealTemplateWorkbook({
      serviceKey: "charla_embarazo_1_20",
      visualHeaderRows: false,
    });
    workbook.Servicio_Config[1][1] = workbookServiceId;
    workbook.Grupos_Ediciones[1][1] = workbookServiceId;
    workbook.Grupos_Ediciones[1][5] = "";
    workbook.Sesiones[1][2] = workbookServiceId;
    workbook.Sesiones[1][9] = "";
    workbook.Sesiones[1][10] = "0";
    workbook.Sesiones[1][11] = "";
    workbook.Sesiones[1][12] = "Sí";
    workbook.Sesiones[1][13] = "Sí";

    const client = new InMemoryNormalizedSheetsClient(workbook);
    const snapshot = await readNormalizedServiceSheet(
      "charla_embarazo_1_20",
      client,
      normalizedTestEnv(),
    );
    const session = listAvailableSessionsFromSnapshot(snapshot, {
      now: new Date(2026, 6, 23, 12),
    })[0];
    if (!session) {
      throw new Error("missing unlimited Charla session");
    }

    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "charla_embarazo_1_20",
        fullName: "PRUEBA BOT CHARLA",
        phone: "+34999000141",
        email: "prueba.bot.charla@example.test",
        peopleCount: 1,
        fppOrDueDate: "2026-12-31",
      },
      env: normalizedTestEnv({
        MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
        GOOGLE_SHEETS_ACCESS_MODE: "live",
        BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
      }),
    });

    expect(session.availabilityStatus).toBe("unlimited");
    expect(plan.blocked).toBe(false);
    expect(plan.blockedReasons).not.toContain("unknown_capacity_requires_manual_review");

    const result = await applyRegistrationWritePlan({ snapshot, client, plan });
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);

    const registrationsRow = appendedRowByHeader(
      snapshot.tabs.Inscripciones.headers,
      client.appended.find((item) => item.tabTitle === "Inscripciones")?.values ?? [],
    );
    expect(registrationsRow.servicio_id).toBe(workbookServiceId);
  });

  it("maps Charla partner name to the real-template pareja_nombre column", async () => {
    const { snapshot, session } = await buildRealFixture({
      serviceKey: "charla_embarazo_1_20",
      visualHeaderRows: true,
      sessionCapacity: "14",
    });
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "charla_embarazo_1_20",
        fullName: "PRUEBA BOT CHARLA",
        phone: "+34999000131",
        email: "prueba.bot.charla@example.test",
        peopleCount: 2,
        fppOrDueDate: "2026-12-31",
        partnerName: "Tono",
        notes: "Pareja/acompañante: Tono",
      },
      env: normalizedTestEnv(),
    });

    const registration = plan.operations.find((operation) => operation.tab === "Inscripciones");
    expect(plan.blocked).toBe(false);
    expect(registration?.values.pareja_nombre).toBe("Tono");
    expect(registration?.values.precio_acordado).toBe("0 €");
    expect(registration?.values.estado_pago).toBe("no_aplica");
  });

  it("keeps Charla write plan unblocked when companion name is pending", async () => {
    const { snapshot, session } = await buildRealFixture({
      serviceKey: "charla_embarazo_1_20",
      visualHeaderRows: true,
      sessionCapacity: "14",
    });
    const plan = buildRegistrationWritePlan({
      snapshot,
      session,
      draft: {
        serviceKey: "charla_embarazo_1_20",
        fullName: "PRUEBA BOT CHARLA",
        phone: "+34999000132",
        email: "prueba.bot.charla@example.test",
        peopleCount: 2,
        fppOrDueDate: "2026-12-31",
        notes: "Acompañante: pendiente/no indicado",
      },
      env: normalizedTestEnv(),
    });

    const registration = plan.operations.find((operation) => operation.tab === "Inscripciones");
    expect(plan.blocked).toBe(false);
    expect(registration?.values.pareja_nombre).toBeUndefined();
    expect(registration?.values.observaciones).toContain("Acompañante: pendiente/no indicado");
  });

  it("idempotency blocks duplicate person and session", async () => {
    const first = await buildFixture();
    const draft = {
      serviceKey: "taller_blw" as const,
      fullName: "Marta Lopez",
      phone: "+34600111222",
      email: "marta@example.test",
      peopleCount: 1,
    };
    const firstPlan = buildRegistrationWritePlan({
      snapshot: first.snapshot,
      session: first.session,
      draft,
      env: normalizedTestEnv(),
    });
    const second = await buildFixture({
      registrations: [
        [
          "taller_blw",
          "sesion_blw_bilbao_20260925",
          "grupo_blw_bilbao",
          "Preinscrita",
          "Marta Lopez",
          "+34600111222",
          "marta@example.test",
          "1",
          "",
          "",
          "",
          firstPlan.idempotencyKey,
        ],
      ],
    });
    const secondPlan = buildRegistrationWritePlan({
      snapshot: second.snapshot,
      session: second.session,
      draft,
      env: normalizedTestEnv(),
    });

    expect(secondPlan.blockedReasons).toContain("duplicate_idempotency_key");
  });

  it("serializes concurrent live writes with the same idempotency key", async () => {
    const { client, snapshot, session } = await buildFixture();
    const draft = {
      serviceKey: "taller_blw" as const,
      fullName: "Marta Lopez",
      phone: "+34600111222",
      email: "marta@example.test",
      peopleCount: 1,
    };
    const env = normalizedTestEnv({
      MATERNALY_NORMALIZED_SHEETS_WRITE_MODE: "live",
      GOOGLE_SHEETS_ACCESS_MODE: "live",
      BOT_SHEETS_LIVE_WRITE_ENABLED: "true",
    });
    const firstPlan = buildRegistrationWritePlan({ snapshot, session, draft, env });
    const secondPlan = buildRegistrationWritePlan({ snapshot, session, draft, env });

    expect(firstPlan.idempotencyKey).toBe(secondPlan.idempotencyKey);

    const results = await Promise.all([
      applyRegistrationWritePlan({ snapshot, client, plan: firstPlan }),
      applyRegistrationWritePlan({ snapshot, client, plan: secondPlan }),
    ]);

    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(results.filter((result) => !result.applied)).toHaveLength(1);
    expect(results.find((result) => !result.applied)?.blockedReason).toBe("duplicate_idempotency_key");
    expect(client.appended).toHaveLength(3);
    expect(client.appended.map((item) => item.tabTitle)).toEqual([
      "Clientes_Local",
      "Inscripciones",
      "Interacciones_Chatbot",
    ]);
  });
});
