# Maternaly Warm Maternal Tone + Pilates KB v1

## Causa

La clienta pidió que el bot Maternaly suene más cálido, humano y cercano, casi como acompañamiento de matrona/equipo, con emojis moderados y sin tono frío, robótico ni venta agresiva.

## Decisiones de Tono

- Trato siempre de tú.
- Identidad mantenida como asistente de Maternaly; no dice "soy matrona".
- Copy visible controlado por `MaternalyCopyRenderer`.
- Mensajes más cálidos en saludo, información general, recogida de datos, fallback de disponibilidad, preinscripción y handoff.
- Emojis con moderación: máximo 1-2 por respuesta estándar en los tests añadidos.
- No emojis en handoff clínico.

## KB Pilates Incorporada

Actualizado `src/lib/maternaly/knowledge/catalog.ts`:

- Pilates Embarazo sigue como servicio `informational`, sin `normalizedServiceKey`.
- Desde semana 14 y hasta el final de la gestación.
- Beneficios: tono muscular, forma física, fuerza, resistencia, circulación de piernas, postura/espalda, respiración, conciencia corporal, suelo pélvico, bienestar y relajación.
- Grupos reducidos, atención personalizada y medidas de higiene/seguridad.
- Bilbao: lunes 10:00-11:00, 11:00-12:00, 17:00-18:00, 18:15-19:15; miércoles 10:00-11:00, 17:00-18:00, 18:15-19:15.
- Erandio: martes 17:30-18:30; jueves 10:00-11:00, 11:00-12:00, 17:30-18:30.
- Precio: 59 €/mes 1 clase/semana; 99 €/mes 2 clases/semana.
- No se incorporó el teléfono informativo porque la KB actual no gestiona teléfonos como campo de servicio y no se deben tocar configuraciones de WhatsApp/env.

## Límites Clínicos

- El NLU sigue sin redactar copy visible.
- Se añadió detección transversal de señales clínicas fuertes: dolor fuerte, sangrado, fiebre, contracciones, pérdida de líquido, mareo fuerte, desmayo, urgencia, contraindicación, malestar importante, mastitis y diagnóstico clínico/personalizado.
- Si aparece una señal fuerte, el core hace handoff profesional con copy del renderer y sin diagnóstico.
- Preguntas informativas sobre Detesex/Diagnóstico Prenatal siguen respondiendo desde la KB controlada si no incluyen señal clínica fuerte.

## Archivos Modificados

- `docs/MATERNALY_TONE_GUIDE.md`
- `src/lib/maternaly/knowledge/catalog.ts`
- `src/lib/maternaly/conversation/copy-renderer.ts`
- `src/lib/maternaly/llm/interpreter.ts`
- `src/lib/maternaly/conversation/core.ts`
- `src/lib/maternaly/conversation/response-engine.ts`
- `src/lib/maternaly/public-chat.ts`
- Tests de catalog, renderer, response engine, public chat, interpreter, authority y flow normalizado.

## Validaciones Ejecutadas

- `npm.cmd run lint`: OK.
- `npm.cmd run test:run`: OK, 67 test files passed, 467 tests passed, 1 todo heredado.
- `npm.cmd run build`: OK, Next.js 16.2.1/Turbopack compilado y TypeScript verde.
- `npm.cmd run maternaly:authority:check`: OK, `checkedFiles=45`.
- `npm.cmd run maternaly:health`: OK local; Google Sheets en dry-run, `writeEnabled=false`, `liveWriteEnabled=false`, normalized sheets disabled.
- `npm.cmd run smoke:conversation`: OK; smoke local heredado, sin envíos externos reales.

## No Tocado

- No se tocaron Sheets reales.
- No se enviaron WhatsApps ni emails reales.
- No se cambiaron variables de entorno productivas ni defaults live.
- No se tocó Vercel.
- No se tocó Uelz/Holded.
- No hubo deploy ni restart.

## Cómo Probar

1. `hola`
2. `qué beneficios tiene pilates embarazo`
3. `horarios pilates embarazo bilbao`
4. `desde qué semana puedo hacer pilates`
5. `quiero reservar pilates embarazo`
6. `tengo dolor fuerte y sangrado, puedo hacer pilates embarazo`

## Riesgos / Pendientes

- Pilates Embarazo no está conectado al flujo normalizado de agenda/Sheets reservable. El bot informa y propone dejar el interés preparado para revisión del equipo.
- Si la clienta quiere reserva real de Pilates por plazas/horarios, hace falta una tarea separada de modelo de agenda/sheet y validación de disponibilidad.
