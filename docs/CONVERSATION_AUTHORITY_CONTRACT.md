# Conversation Authority Contract

## Pipeline Obligatorio

Toda respuesta visible automatica de Maternaly debe seguir este orden:

1. `MaternalyNormalizedInbound`
2. NLU/LLM como interpretacion estructurada
3. `MaternalyStateReducer`
4. `MaternalyConversationPolicy`
5. `MaternalyToolExecutor` solo si la policy autoriza una accion real
6. `MaternalyCopyRenderer`, que primero construye un borrador seguro y puede delegar solo su estilo informativo en `MaternalyGroundedCopyGenerator`
7. `MaternalyConversationOutbox`
8. Persistencia de estado, mensajes y eventos
9. `MaternalyAuthorityTurnTrace`

## Reglas Duras

- El NLU/LLM de interpretacion no redacta texto visible final.
- `StructuredIntent` no puede contener `reply`, `replyText`, `message`, `botReply` ni `visibleText`.
- `StructuredIntent.service_question_focus` es solo una señal estructurada para adaptar el renderer; no contiene copy visible.
- El reducer actualiza estado y `pendingFields`; no redacta copy.
- La policy decide accion y handoff; no redacta copy final.
- El ToolExecutor solo ejecuta acciones autorizadas por policy.
- Si una tool falla, esta en dry-run o queda bloqueada, el renderer no puede afirmar accion completada.
- `MaternalyCopyRenderer` sigue siendo la autoridad y la fuente de copy visible del bot.
- `MaternalyGroundedCopyGenerator` es una dependencia subordinada del renderer: en `service_info` y `general` solo selecciona IDs de apertura/cierre desde bancos revisados; nunca reformula el contenido decidido por el renderer.
- El borrador seguro, los hechos y los turnos no se envian al selector. OpenAI recibe solo accion y metadatos abstractos cerrados, y devuelve exactamente dos planes con `opening_id` y `closing_id` enumerados, sin ningun campo de texto libre.
- La composicion visible se hace localmente como `apertura revisada + safeDraft literal e inmutable + cierre revisado`. El generador no tiene tools ni una ruta para crear servicios, fechas, horas, precios, sedes, reservas, pagos, confirmaciones o afirmaciones clinicas.
- Los planes duplicados, IDs invalidos, framing redundante o una respuesta estructurada invalida se rechazan en codigo. Si falta configuracion, hay timeout/error o ningun plan es valido, se usa exactamente el borrador seguro determinista.
- `catalog_info` se mantiene determinista para garantizar que ningun servicio canonico desaparezca. `reset`, handoff, privacidad, pagos, facturas, inscripcion, disponibilidad y seguridad clinica tampoco pasan por el generador de estilo.
- `MaternalyConversationOutbox` solo acepta `MaternalyRenderedMessage` y construye el canal.
- Human mode no auto-responde salvo comando explicito de reset/volver al bot.
- Handoff clinico por senales de riesgo debe pasar a modo humano/manual review, emitir evento seguro y avisar desde `MaternalyCopyRenderer`.

## ToolExecutor

No se inventan tools externas. En este repo existe la tool conversacional historica `normalized_sheets_registration` para disponibilidad/preinscripcion Maternaly. Debe permanecer detras de policy, con modo dry-run/live guardado, sin Uelz/Holded y sin confirmaciones criticas sin exito real.

## Global Intent Escape Hatch

La policy debe manejar antes del flujo activo:

- reset / empezar de cero / volver al bot
- humano / equipo / profesional
- cancelaciones o cambios de fecha/sede
- pagos, facturas y justificantes
- privacidad/RGPD
- stop/no seguir
- FAQ informativa dentro de un flujo activo sin borrar `state_after`

## State After Invariants

- Policy consume el estado reducido, no el estado previo.
- Renderer consume `state_after`.
- `pendingFields` se calcula desde el resultado real del flujo.
- FAQ puede responder dentro de un flujo sin borrar slots.
- Reset limpia estado y devuelve modo bot.
- Human mode suprime salida visible automatica.

## Eventos Persistidos Minimos

- `maternaly_nlu_interpreted`
- `maternaly_policy_decision`
- `maternaly_authority_timing_completed`
- `maternaly_authority_turn_completed`
- `maternaly_outbox_sent` cuando hay respuesta visible enviada al canal
- `maternaly_clinical_safety_handoff` cuando hay handoff clinico por seguridad

`maternaly_authority_turn_completed` contiene renderer, outbox e invariantes `state_after` para evitar escrituras de eventos excesivas en flujos multi-turn.

## Seguridad

Las trazas no deben incluir telefonos completos, texto bruto innecesario, tokens, claves ni credenciales. No se hacen sends reales ni writes externos durante validaciones locales.
