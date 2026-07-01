# Conversation Latency Runbook

## Fuente De Verdad

Para Maternaly, mirar primero:

- `maternaly_authority_timing_completed`
- `maternaly_authority_turn_completed`
- `maternaly_outbox_sent`

Los flags `usedDeterministicFastPath`, `usedFallback` e invariantes `state_after` viven dentro de `maternaly_authority_turn_completed` para reducir escrituras por turno.

## Campos De Timing

- `totalDurationMs`
- `nluTotalMs`
- `reducerMs`
- `policyMs`
- `toolsMs`
- `rendererMs`
- `outboxMs`
- `persistenceMs`
- `eventLogMs`
- `openaiCalls`
- `usedDeterministicFastPath`
- `usedFallback`

## Diagnostico

1. Si `nluTotalMs` domina, revisar proveedor LLM, timeout y fallback determinista.
2. Si `toolsMs` domina, revisar disponibilidad/preinscripcion normalizada y evitar lecturas duplicadas.
3. Si `rendererMs` domina, revisar copy renderer, no saltarlo.
4. Si `persistenceMs`/`eventLogMs` dominan, revisar store local/Postgres y volumen de eventos.
5. Si hay human mode, confirmar que no se auto-responde salvo reset/volver al bot.

## No Hacer

- No apagar NLU para ganar latencia.
- No dejar que OpenAI redacte copy visible.
- No saltarse reducer/policy/renderer por fast path.
- No enviar canal fuera de Outbox.
- No ejecutar sends reales ni writes reales durante smoke local.

## Smoke Local

Comandos seguros:

```bash
npm run maternaly:authority:check
npm run test:run -- src/lib/maternaly/conversation/authority.test.ts
```

El smoke esperado usa `LLM_PROVIDER=mock`, no llama OpenAI, no envia WhatsApp real y no escribe sistemas externos reales.
