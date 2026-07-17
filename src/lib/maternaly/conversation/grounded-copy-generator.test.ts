import { describe, expect, it, vi } from "vitest";

import {
  MATERNALY_GROUNDED_COPY_CLOSINGS,
  MATERNALY_GROUNDED_COPY_OPENINGS,
  MaternalyGroundedCopyGenerator,
  validateMaternalyGroundedCopyCandidate,
} from "@/lib/maternaly/conversation/grounded-copy-generator";

const safeDraft =
  "El Taller BLW es presencial, dura tres horas de 17:00 a 20:00 y cuesta 45 €/persona o 75 €/pareja. Incluye cortes seguros y alergias.";

type Plan = { opening_id: string; closing_id: string; [key: string]: unknown };

function openAiPlanResponse(plans: Plan[]): Response {
  return new Response(
    JSON.stringify({ output_text: JSON.stringify({ plans }) }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    OPENAI_API_KEY: "unit-test-key",
    ...overrides,
  };
}

function compose(openingId: keyof typeof MATERNALY_GROUNDED_COPY_OPENINGS, closingId: keyof typeof MATERNALY_GROUNDED_COPY_CLOSINGS): string {
  return [
    MATERNALY_GROUNDED_COPY_OPENINGS[openingId],
    safeDraft,
    MATERNALY_GROUNDED_COPY_CLOSINGS[closingId],
  ]
    .filter(Boolean)
    .join("\n\n");
}

describe("MaternalyGroundedCopyGenerator framing-only contract", () => {
  it("chooses closed framing IDs and keeps the safe draft literally immutable", async () => {
    const plans = [
      { opening_id: "friendly", closing_id: "invite_continue" },
      { opening_id: "attentive", closing_id: "available" },
    ];
    const fetchMock = vi.fn(async () => openAiPlanResponse(plans));
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await generator.generate(
      {
        action: "service_info",
        safeDraft,
        authorizedFacts: ["Este contenido nunca debe enviarse al selector."],
        redactedContext: "La usuaria comparte contexto personal.",
        recentTurns: [{ role: "user", text: "Contexto abstracto ya redactado." }],
      },
      env({ LLM_MODEL: "gpt-4.1-mini-test" }),
    );

    expect(result).toMatchObject({
      text: compose("friendly", "invite_continue"),
      source: "grounded_generator",
      mode: "generated",
      reason: "accepted",
      attempted: true,
      model: "gpt-4.1-mini-test",
    });
    expect(result.text).toContain(safeDraft);
    expect(result.text.split(safeDraft)).toHaveLength(2);
    expect(result.candidateAudits[0]).toEqual({ index: 0, accepted: true, reasons: [] });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as {
      store: boolean;
      tools: unknown[];
      input: Array<{ role: string; content: string }>;
      text: {
        format: {
          type: string;
          strict: boolean;
          schema: {
            properties: {
              plans: { items: { properties: Record<string, unknown> } };
            };
          };
        };
      };
    };
    expect(body).toMatchObject({
      store: false,
      tools: [],
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(Object.keys(body.text.format.schema.properties.plans.items.properties).sort()).toEqual([
      "closing_id",
      "opening_id",
    ]);
    const serializedSchema = JSON.stringify(body.text.format.schema);
    expect(serializedSchema).not.toMatch(/candidate|free.?text|message/i);
    const requestText = String(init?.body);
    expect(requestText).not.toContain(safeDraft);
    expect(requestText).not.toContain("Este contenido nunca debe enviarse");
    expect(requestText).not.toContain("Contexto abstracto ya redactado");
  });

  it("keeps every reviewed framing fragment free of business and clinical claims", () => {
    const framingBank = [
      ...Object.values(MATERNALY_GROUNDED_COPY_OPENINGS),
      ...Object.values(MATERNALY_GROUNDED_COPY_CLOSINGS),
    ].join(" ");

    expect(framingBank).not.toMatch(
      /\b(?:servicios?|taller|charla|pilates|blw|fecha|hora|precio|euros?|€|sede|bilbao|erandio|madrid|nutricionista|reserva|plaza|pago|solicitud|confirmad[ao]|diagn[oó]stico|tratamiento)\b/i,
    );
    expect(framingBank).not.toMatch(/\d/);
    expect(MATERNALY_GROUNDED_COPY_OPENINGS.direct).not.toMatch(/^s[ií]\b/i);
  });

  it.each([
    {
      label: "redundant opening on an already warm draft",
      draft: "Gracias por contármelo. Aquí tienes la información revisada.",
      first: { opening_id: "friendly", closing_id: "none" },
      second: { opening_id: "none", closing_id: "available" },
      expected: "Gracias por contármelo. Aquí tienes la información revisada.\n\nEstoy aquí para seguir contigo.",
    },
    {
      label: "second closing after a draft question",
      draft: "Esta es la información revisada. ¿Qué te gustaría mirar ahora?",
      first: { opening_id: "none", closing_id: "open_question" },
      second: { opening_id: "attentive", closing_id: "none" },
      expected: "Te leo y lo vemos con calma.\n\nEsta es la información revisada. ¿Qué te gustaría mirar ahora?",
    },
    {
      label: "too many framing emojis",
      draft: "Esta es la información revisada.",
      first: { opening_id: "friendly", closing_id: "invite_detail" },
      second: { opening_id: "attentive", closing_id: "available" },
      expected: "Te leo y lo vemos con calma.\n\nEsta es la información revisada.\n\nEstoy aquí para seguir contigo.",
    },
  ])("rejects $label and tries the second plan", async ({ draft, first, second, expected }) => {
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(async () => openAiPlanResponse([first, second])) as unknown as typeof fetch,
    });

    const result = await generator.generate(
      { action: "service_info", safeDraft: draft },
      env(),
    );

    expect(result.text).toBe(expected);
    expect(result.candidateAudits[0].reasons).toContain("incompatible_framing");
    expect(result.candidateAudits[1]).toMatchObject({ accepted: true, reasons: [] });
  });

  it("rejects a personal-context acknowledgement on a plain informational turn", async () => {
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(async () =>
        openAiPlanResponse([
          { opening_id: "warm_ack", closing_id: "none" },
          { opening_id: "attentive", closing_id: "available" },
        ]),
      ) as unknown as typeof fetch,
    });

    const result = await generator.generate(
      {
        action: "service_info",
        safeDraft: "Esta es la información revisada.",
        redactedContext: "Movimiento del turno: consulta informativa.",
      },
      env(),
    );

    expect(result.text).toBe(
      "Te leo y lo vemos con calma.\n\nEsta es la información revisada.\n\nEstoy aquí para seguir contigo.",
    );
    expect(result.candidateAudits[0].reasons).toContain("incompatible_framing");
    expect(result.candidateAudits[1]).toMatchObject({ accepted: true, reasons: [] });
  });

  it.each([
    [
      [
        { opening_id: "invented", closing_id: "available" },
        { opening_id: "friendly", closing_id: "invite_continue" },
      ],
      "invalid opening ID",
    ],
    [
      [
        { opening_id: "friendly", closing_id: "invented" },
        { opening_id: "attentive", closing_id: "available" },
      ],
      "invalid closing ID",
    ],
    [
      [
        {
          opening_id: "friendly",
          closing_id: "available",
          text: "Madrid, nutricionista y reserva confirmada.",
        },
        { opening_id: "attentive", closing_id: "invite_continue" },
      ],
      "free-text field",
    ],
  ])("falls back exactly for %s", async (plans) => {
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(async () => openAiPlanResponse(plans as Plan[])) as unknown as typeof fetch,
    });

    const result = await generator.generate(
      { action: "service_info", safeDraft },
      env(),
    );

    expect(result).toMatchObject({
      text: safeDraft,
      source: "safe_draft",
      mode: "fallback",
      reason: "invalid_response",
    });
    expect(result.text).not.toMatch(/Madrid|nutricionista|reserva confirmada/i);
  });

  it("cannot accept legacy free-text candidates containing hallucinations", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            candidates: [
              `${safeDraft} También atendemos en Madrid.`,
              `${safeDraft} Tu reserva está confirmada.`,
            ],
          }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await new MaternalyGroundedCopyGenerator({
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).generate({ action: "service_info", safeDraft }, env());

    expect(result).toMatchObject({ text: safeDraft, reason: "invalid_response" });
    expect(result.text).not.toMatch(/Madrid|reserva est[aá] confirmada/i);
  });

  it("falls back for duplicate plans instead of pretending to offer two candidates", async () => {
    const duplicate = { opening_id: "friendly", closing_id: "available" };
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(async () => openAiPlanResponse([duplicate, duplicate])) as unknown as typeof fetch,
    });

    const result = await generator.generate(
      { action: "general", safeDraft },
      env(),
    );

    expect(result).toMatchObject({
      text: safeDraft,
      source: "safe_draft",
      mode: "fallback",
      reason: "no_safe_candidate",
    });
    expect(result.candidateAudits).toEqual([
      { index: 0, accepted: false, reasons: ["duplicate_plan"] },
      { index: 1, accepted: false, reasons: ["duplicate_plan"] },
    ]);
  });

  it("uses the second distinct plan when the first would repeat the previous reply", async () => {
    const first = compose("friendly", "invite_continue");
    const second = compose("attentive", "available");
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(async () =>
        openAiPlanResponse([
          { opening_id: "friendly", closing_id: "invite_continue" },
          { opening_id: "attentive", closing_id: "available" },
        ]),
      ) as unknown as typeof fetch,
    });

    const result = await generator.generate(
      {
        action: "service_info",
        safeDraft,
        recentTurns: [{ role: "assistant", text: first }],
      },
      env(),
    );

    expect(first).not.toBe(second);
    expect(result.text).toBe(second);
    expect(result.candidateAudits[0]).toMatchObject({
      accepted: false,
      reasons: ["too_similar_to_recent_reply"],
    });
    expect(result.candidateAudits[1]).toMatchObject({ accepted: true, reasons: [] });
  });

  it("rejects any composed text that mutates the draft or adds unapproved copy", () => {
    expect(
      validateMaternalyGroundedCopyCandidate({
        candidate: safeDraft.replace("45 €/persona", "75 €/persona"),
        safeDraft,
      }),
    ).toContain("safe_draft_mutated");
    expect(
      validateMaternalyGroundedCopyCandidate({
        candidate: `${safeDraft}\n\nTambién atendemos en Madrid con nutricionista.`,
        safeDraft,
      }),
    ).toContain("unapproved_framing");
  });

  it("does not call OpenAI for transactional actions or unredacted sensitive context", async () => {
    const fetchMock = vi.fn(async () =>
      openAiPlanResponse([
        { opening_id: "friendly", closing_id: "available" },
        { opening_id: "attentive", closing_id: "invite_continue" },
      ]),
    );
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const transactional = await generator.generate(
      { action: "normalized_registration", safeDraft },
      env(),
    );
    const sensitive = await generator.generate(
      {
        action: "general",
        safeDraft,
        redactedContext: "La usuaria está en el quinto mes de embarazo.",
      },
      env(),
    );

    expect(transactional).toMatchObject({
      text: safeDraft,
      mode: "skipped",
      reason: "unsupported_action",
      attempted: false,
    });
    expect(sensitive).toMatchObject({
      text: safeDraft,
      mode: "skipped",
      reason: "sensitive_or_unredacted_context",
      attempted: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the exact safe draft on HTTP, malformed response and timeout failures", async () => {
    const http = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch,
    });
    const malformed = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(async () => openAiPlanResponse([{ opening_id: "friendly", closing_id: "available" }])) as unknown as typeof fetch,
    });
    const timeout = new MaternalyGroundedCopyGenerator({
      fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch,
      timeoutMs: 10,
    });

    await expect(http.generate({ action: "general", safeDraft }, env())).resolves.toMatchObject({
      text: safeDraft,
      reason: "http_error",
    });
    await expect(
      malformed.generate({ action: "general", safeDraft }, env()),
    ).resolves.toMatchObject({ text: safeDraft, reason: "invalid_response" });
    await expect(
      timeout.generate({ action: "general", safeDraft }, env()),
    ).resolves.toMatchObject({ text: safeDraft, reason: "timeout" });
  });

  it("skips cleanly when OpenAI is unavailable or explicitly disabled", async () => {
    const fetchMock = vi.fn();
    const generator = new MaternalyGroundedCopyGenerator({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      generator.generate({ action: "general", safeDraft }, { NODE_ENV: "test" } as NodeJS.ProcessEnv),
    ).resolves.toMatchObject({ text: safeDraft, reason: "missing_api_key", attempted: false });
    await expect(
      generator.generate(
        { action: "service_info", safeDraft },
        { LLM_PROVIDER: "mock", OPENAI_API_KEY: "unit-test-key" } as NodeJS.ProcessEnv,
      ),
    ).resolves.toMatchObject({ text: safeDraft, reason: "provider_disabled", attempted: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
