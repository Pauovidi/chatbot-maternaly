# Arquitectura LLM

Implementado en `src/lib/maternaly/llm/interpreter.ts`:

- `MaternalyConversationInterpreter`
- `LlmIntentClassifier`
- `StructuredIntent`
- `ConversationStateReducer`
- `SafeToolRouter`

El LLM interpreta mensajes y devuelve JSON estructurado validado. Si falta `OPENAI_API_KEY`, el mock determinista permite tests y build.

El LLM no puede:

- inventar disponibilidad.
- inventar precios.
- confirmar reservas.
- confirmar pagos.
- marcar facturas enviadas.
- escribir en Sheets.
- modificar cupos.

Las operaciones criticas pasan por servicios deterministas y `ReservationWritePlan`.
