# Conversation Bypass Audit

## Clasificacion

| Area | Ruta/archivo | Clasificacion | Notas |
| --- | --- | --- | --- |
| WhatsApp webhook | `src/app/api/twilio/whatsapp/route.ts` | outbox_only | Recibe payload, valida token y devuelve TwiML seguro; no decide copy de negocio. |
| Maternaly inbound | `src/lib/maternaly/conversation/twilio-inbound.ts` | outbox_only | Persiste inbound, llama core, persiste eventos, usa `MaternalyConversationOutbox`. |
| Core adapter | `src/lib/maternaly/conversation/core.ts` | policy_only | Orquesta NLU, reducer, policy, tools, renderer y trace. |
| NLU | `src/lib/maternaly/llm/interpreter.ts` | reducer_only | Produce `StructuredIntent`; campos visibles prohibidos se descartan y auditan. |
| Copy | `src/lib/maternaly/conversation/copy-renderer.ts` | renderer_only | Unica fuente de copy visible del bot automatico. |
| Public chat | `src/lib/maternaly/public-chat.ts` | renderer_only | Flujo sync informativo de UI; usa NLU mock y renderer, sin writes ni canal externo. |
| Response compatibility | `src/lib/maternaly/conversation/response-engine.ts` | legacy_allowed_temporarily_with_reason | Mantiene helper reply-only y delega WhatsApp en el core; permitido para tests/UI heredados. |
| Panel manual reply | `src/app/api/conversations/[id]/reply/route.ts` | legacy_allowed_temporarily_with_reason | Respuesta humana/admin, no bot automatico. |
| Hotel conversation core | `src/lib/hotel/conversations/service.ts` | legacy_allowed_temporarily_with_reason | Vertical historico compartido; no se modifica para Maternaly authority. |
| Normalized Sheets availability/write | `src/lib/maternaly/sheets/*` | policy_only | Tool existente, solo llamada desde `MaternalyToolExecutor` tras policy. |

## Bypasses Principales Corregidos

- Twilio inbound ya no construye/persiste respuesta bot directamente; usa Outbox con `renderedSource=copy_renderer`.
- Core emite `MaternalyAuthorityTurnTrace` y timings por etapa.
- NLU valida y marca campos visibles prohibidos.
- FAQ puede salir del flujo activo sin borrar estado.

## Excepciones Permitidas

- `public-chat.ts`: UI sync informativa; no canal externo ni tool write.
- `response-engine.ts`: compatibilidad de helper, pero usa renderer y core para WhatsApp reply.
- Rutas/admin manuales: copy humano, no bot authority.

## Guardrails

El comando `npm run maternaly:authority:check` bloquea:

- OpenAI directo fuera de `src/lib/maternaly/llm/interpreter.ts`.
- TwiML directo dentro de conversacion Maternaly fuera de `MaternalyConversationOutbox`.
- Campos visibles como propiedades de salida NLU.
- Ausencia de markers de trace/timing/invariants del core.

## Pendiente

El vertical hotel compartido sigue conviviendo en el repo. No se toca en esta tarea porque el prompt prohibe importar logica de hotel al dominio Maternaly.
