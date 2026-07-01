# Maternaly Adaptive NLU Tone + Clinical Handoff v1

## Problemas Observados

- Pilates respondía casi siempre con el mismo bloque largo, aunque la usuaria preguntara solo por beneficios, horarios, precio o semana de inicio.
- El tono había mejorado, pero repetía demasiado "con calma" y el emoji 🌸.
- El handoff clínico sonaba administrativo y no dejaba suficientemente claro que una profesional/equipo debía revisarlo cuanto antes.

## Cambios en NLU

- `StructuredIntent` incorpora `service_question_focus`, solo como señal estructurada.
- Valores soportados: `benefits`, `schedule`, `pricing`, `start_week`, `locations`, `booking`, `general`, `clinical_risk`, `unknown`.
- El fallback/mock determinista detecta foco por texto y ubicación.
- El prompt de OpenAI exige el campo `service_question_focus` sin permitir copy visible.
- Se mantiene el stripping de `reply`, `replyText`, `message`, `botReply` y `visibleText`.

## Cambios en CopyRenderer

- Pilates ahora responde por foco:
  - `benefits`: solo beneficios y cierre suave.
  - `schedule` + Bilbao: solo horarios Bilbao.
  - `schedule` + Erandio: solo horarios Erandio.
  - `start_week`: semana 14 y continuidad, sin horarios/precios.
  - `pricing`: 59 €/mes y 99 €/mes, sin horarios.
  - `booking`: aclara que no hay agenda automática de Pilates y no confirma plaza.
  - `general`: resumen breve y pregunta qué ampliar.
- Reply-only y webchat pasan el foco al renderer.

## Tono y Emojis

- Se redujo la repetición de "con calma".
- Se variaron cierres y emojis dentro del set permitido: 🌸, 💛, 😊, 🤰, ✅, 🫶.
- Tests garantizan máximo 2 emojis en respuestas estándar y variedad mínima.
- Mensajes clínicos no usan emojis.

## Handoff Clínico

- Señales como dolor fuerte, sangrado, fiebre, contracciones fuertes, no notar al bebé, urgencia o encontrarse muy mal activan `clinical_risk`.
- Policy decide `handoff` y el core pasa a:
  - `mode=human`
  - `humanRequested=true`
  - `requiresManualReview=true`
  - `maternalyReviewStatus=manual_review_required`
  - `priority=urgent`
- Eventos emitidos:
  - `maternaly_clinical_safety_handoff`
  - `maternaly_handoff_required`
  - `human_requested`
- Tras handoff clínico, el bot no responde servicios normales si no hay reset explícito.
- `reiniciar` vuelve a modo bot.

## Validaciones Ejecutadas

- `npm.cmd run test:run`: OK, 67 test files passed, 481 tests passed, 1 todo heredado.
- `npm.cmd run lint`: OK.
- `npm.cmd run build`: OK, Next.js 16.2.1/Turbopack compilado y TypeScript verde.
- `npm.cmd run maternaly:authority:check`: OK, `checkedFiles=45`.
- `npm.cmd run maternaly:health`: OK local; Google Sheets en dry-run, `writeEnabled=false`, `liveWriteEnabled=false`, normalized sheets disabled.
- `npm.cmd run smoke:conversation`: OK; smoke local heredado, sin envíos externos reales.

## No Tocado

- No se tocaron Sheets reales.
- No se enviaron WhatsApps ni emails reales.
- No se cambiaron variables productivas ni defaults live.
- No se tocó Vercel, EasyPanel, Railway, Twilio Console, Meta Console ni DNS.
- No se tocó Uelz/Holded.
- No hubo deploy ni restart.

## Cómo Probar

1. `hola`
2. `qué beneficios tiene pilates embarazo`
3. `Dime los horarios pilates embarazo bilbao`
4. `desde qué semana puedo hacer pilates`
5. `precio pilates embarazo`
6. `tengo dolor fuerte y sangrado`
7. `reiniciar`

## Riesgos / Pendientes

- Pilates sigue sin estar conectado a agenda/Sheets reservable automática; el bot solo informa o deja interés para revisión del equipo.
- El smoke `smoke:conversation` es heredado de conversación hotel/local y no prueba específicamente el dominio Maternaly, aunque la suite Maternaly sí cubre NLU, copy, authority y Twilio core.
