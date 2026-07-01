# Maternaly Clinical Copy And Context Pricing V1

## Scope

- Repo: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Branch: `codex/maternaly-clinical-copy-context-pricing-v1`
- No live Sheets writes, no WhatsApp sends, no deploy and no restart were performed.

## Clinical Copy

The clinical handoff keeps the same controlled CopyRenderer path, with empathy, no diagnosis by WhatsApp and handoff to the Maternaly team.

Exact closing now used:

`Si el sangrado, el dolor o cualquier síntoma importante empeora, mi recomendación es que contactes lo antes posible con tu médico o acudas a urgencias.`

Removed legacy fragments from the controlled clinical handoff:

- `no esperes a la respuesta del bot`
- `continúa o te preocupa`

The handoff still goes through the authority pipeline and preserves human/manual review flags and urgent priority.

## Contextual Pricing

Short pricing follow-ups now reuse a clear previous service context when the NLU detects pricing but no explicit service.

Covered path:

1. `Dime los horarios pilates embarazo bilbao`
2. `vale, dime precios venga`

The second turn is enriched with the previous `Pilates Embarazo` context and renders the Pilates pricing copy with `59 €/mes` and `99 €/mes`, without falling back to the general service menu and without repeating full schedules.

If there is no previous clear service context, a bare `precio` stays general/safe and does not invent a price.

Active normalized BLW/charla flows keep their `choosing_session` state and selected session/group when price is asked as an FAQ.

## Tests Added Or Updated

- Clinical handoff exact closing phrase.
- Clinical handoff absence of legacy fragments.
- Clinical handoff no emojis.
- Clinical handoff human/manual review patch and handoff events.
- Two-turn Pilates schedule-to-pricing context.
- Bare `precio` without context stays safe.
- BLW/charla `choosing_session` state is preserved during pricing FAQ.
- NLU visible-copy fields remain stripped.

## How To Try Locally

1. `Dime los horarios pilates embarazo bilbao`
2. `vale, dime precios venga`
3. `tengo dolor fuerte y sangrado`
4. `reiniciar`
