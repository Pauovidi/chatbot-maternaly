# Conversation Authority Applicability Audit

## Verdict

Aplica migracion parcial/refuerzo. Este repo contiene conversacion real de Maternaly: WhatsApp/Twilio, YCloud como canal entrante compartido, webchat publico, panel conversacional y flujo de inscripcion para servicios Maternaly.

## Repo

- Repo auditado: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Remote esperado: `https://github.com/Pauovidi/chatbot-maternaly.git`
- Dominio conversacional real: Maternaly, no hotel canino.

## Canales

- WhatsApp Twilio/Twilio Sandbox: `src/app/api/twilio/whatsapp/route.ts`
- YCloud via payload compartido: `src/lib/maternaly/conversation/twilio-inbound.ts`
- Webchat publico: `src/lib/maternaly/public-chat.ts` y `src/components/public-chat-widget.tsx`
- Panel humano/manual: `src/app/admin/conversations/*` y rutas `src/app/api/conversations/*`

## Entrada De Mensaje

- Webhook WhatsApp: `POST /api/twilio/whatsapp`
- Normalizacion Maternaly: `handleInboundMaternalyWhatsApp`
- Webchat publico: `resolveMaternalyChatReply`
- Panel: rutas de conversaciones para lectura, modo y respuesta manual.

## Respuesta Visible

- Fuente principal: `MaternalyCopyRenderer`
- WhatsApp: el core devuelve `renderedMessage`; `MaternalyConversationOutbox` genera TwiML y borrador outbound.
- Webchat publico: usa `MaternalyCopyRenderer` con NLU determinista local para copy informativo.
- Respuestas manuales del panel son humanas, no bot authority.

## NLU/LLM

- `src/lib/maternaly/llm/interpreter.ts`
- OpenAI, si esta configurado, solo interpreta JSON estructurado.
- El validador descarta campos visibles prohibidos como `reply`, `replyText`, `message`, `botReply` y `visibleText`.
- El fast path determinista local produce `StructuredIntent` y sigue el pipeline.

## Estado Conversacional

- `maternalyNormalizedFlow` en `ConversationRecord`.
- Contiene servicio, fase, sesion seleccionada, datos de contacto, observaciones y `pendingFields`.
- `MaternalyStateReducer` fusiona slots NLU y contexto del mensaje.

## Acciones Criticas

- Cancelaciones, cambios de fecha/sede, pagos, facturas, justificantes, dudas clinicas y solicitud humana derivan a modo humano.
- La inscripcion automatica no confirma plaza. Solo prepara solicitud/preinscripcion y depende de tool result real/dry-run.

## Tools Externas

- No se introduce Uelz.
- No se introduce Holded.
- No se introduce STEL, Gesden, Directus ni verticales ajenos.
- Google Sheets aparece en el repo como tool existente del flujo normalizado de disponibilidad/preinscripcion. No se anade una tool nueva; se mantiene bajo policy, dry-run/live guardado y sin writes reales durante validacion local.

## Uelz/Holded/Sheets

- Uelz/Holded no forman parte de este flujo y no se tocan.
- Sheets se toca solo como codigo ya existente del chatbot Maternaly normalizado; no se ejecutan writes reales en esta tarea.

## Bypass Identificados

- `response-engine.ts` mantiene compatibilidad de reply-only, pero delega en `MaternalyCoreAdapter` para WhatsApp reply.
- `public-chat.ts` es un flujo informativo sync de UI; queda clasificado como `renderer_only`.
- `twilio-inbound.ts` queda reforzado para persistir/salir por Outbox.

## Conclusion

Aplica refuerzo completo proporcional: contrato, auditoria, trazas, timings, NLU estructurado, state_after invariants, CopyRenderer, Outbox y guardrail checker. No aplica importar logica de hotel/Somos Muy Perros ni crear tools externas nuevas.
