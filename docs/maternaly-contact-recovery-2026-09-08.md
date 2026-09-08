# Recuperación de datos y elegibilidad de la Charla

Revisión del código: `2026-09-08-contact-recovery-v1` (visible en `/api/health`, campo `build.conversationRevision`).

## Causas corregidas

- La extracción de nombres dependía de mayúsculas y prefijos; no interpretaba la respuesta con titular, acompañante y FPP en líneas separadas.
- Una FPP ya guardada impedía aceptar otra fecha sin etiqueta. La respuesta podía acabar en la ruta general aunque siguiera existiendo una sesión seleccionada.
- Un nombre recibido solo podía rellenar a la vez titular y acompañante.
- Las fechas ofrecidas no compartían el filtro de semanas 1–20 que se ejecutaba al confirmar.

## Comportamiento

- Admite los dos nombres separados por líneas, coma, punto y coma o «y», conservando los límites entre personas. No divide arbitrariamente dos nombres desconocidos concatenados en una línea.
- Una FPP pasada o inválida pide aclaración, conserva datos y sesión, y no reserva ni activa atención humana por ese posible error de escritura.
- La fecha corregida retoma la solicitud. Una corrección de nombre sin etiquetas solo reutiliza el límite del acompañante si este ya estaba identificado.
- Una respuesta de datos reconocible prevalece sobre una clasificación genérica de NLU. Las preguntas, cambios explícitos de servicio y derivaciones de seguridad mantienen su tratamiento.
- Un saludo o mensaje desconocido durante la recogida de campos pendientes no reinicia el recorrido.
- Si se conoce la FPP, las opciones y su numeración usan las sesiones compatibles. Si no se conoce, se avisa de que falta comprobar las semanas. La validación final y la revalidación antes de escribir siguen vigentes.

## Verificación

- `npx vitest run --maxWorkers=2`: 1.031 pruebas pasan; una omitida y una pendiente preexistentes.
- Se reproducen mensajes multilínea, año pasado seguido de año corregido, corrección de apellido con acompañante conocido, nombres en mensajes separados, nombres ambiguos, saludo intermedio y clasificación errónea de NLU.
- Las pruebas de conversación utilizan almacenamiento temporal y hojas simuladas: no envían WhatsApp ni crean reservas reales.
- Las pruebas antiguas de disponibilidad se fijan en agosto de 2026 para que sus sesiones de ejemplo no caduquen con el reloj real.
- Se excluyen de lint las copias de trabajo y cachés locales, manteniendo el análisis de código de la aplicación.

## Publicación y recuperación

Aplicación EasyPanel: proyecto y servicio `maternaly-chatbot`, dominio `maternaly-chatbot-maternaly-chatbot.0yiwev.easypanel.host`.
La revisión anterior es `5116b7240afb747067b90bee7e1caac80f9c4967`, rama `codex/maternaly-conversational-quality-fix-v2`.
La nueva rama es `codex/maternaly-contextual-appointment-fix`.

Tras implementar, comprobar éxito de compilación, `/api/health` con `ok: true` y la revisión indicada arriba. El marcador no sustituye al resultado de una prueba WhatsApp real.
No se modifican conversaciones existentes, agendas, credenciales, recordatorios ni otros proyectos del servidor. Una conversación que ya estaba en modo humano conserva ese modo; en una conversación de pruebas puede enviarse «reiniciar» para empezar un recorrido nuevo.
