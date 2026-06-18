import { describe, expect, it } from "vitest";
import { readNormalizedServiceSheet } from "@/lib/maternaly/sheets/normalized-client";
import { listAvailableSessionsFromSnapshot } from "@/lib/maternaly/sheets/normalized-availability";
import {
  applyRegistrationWritePlan,
  buildRegistrationWritePlan,
} from "@/lib/maternaly/sheets/normalized-write";
import {
  InMemoryNormalizedSheetsClient,
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

describe("normalized Maternaly write plan", () => {
  it("blocks registration when the session is full", async () => {
    const { snapshot, session } = await buildFixture({
      sessionCapacity: "1",
      registrations: [["taller_blw", "sesion_blw_martes", "grupo_blw_1", "Activa"]],
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
    expect(client.appended.map((item) => item.tabTitle)).toEqual([
      "Clientes_Local",
      "Inscripciones",
      "Interacciones_Chatbot",
    ]);
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
          "sesion_blw_martes",
          "grupo_blw_1",
          "Preinscrita",
          "Marta Lopez",
          "+34600111222",
          "marta@example.test",
          "1",
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
});
