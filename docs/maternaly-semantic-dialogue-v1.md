# Núcleo conversacional semántico v1

## Separación de responsabilidades

`dialogue/understanding.ts` interpreta un turno completo con Responses y un esquema estricto: objetivo, autorización, actualizaciones con citas literales, correcciones, preguntas múltiples, ambigüedades y selección de una opción efectivamente mostrada.

La memoria de trabajo contiene los datos persistidos, etapa, campos pendientes, sesión seleccionada, opciones ofrecidas y preguntas pendientes. Incluye hasta 16 mensajes recientes, acotados, y nunca añade teléfono o correo a la memoria enviada al modelo. Las fechas se conservan al anonimizar contactos. Los nombres y datos de etapa necesarios sí forman parte del contexto: no es una anonimización total.

El nuevo intérprete no se somete a los reemplazos generales del clasificador anterior. Las propuestas de nombres deben estar sustentadas literalmente en el mensaje, pero no necesitan mayúsculas. La aplicación valida esquemas, evidencia, IDs y transiciones. La agenda, elegibilidad, escrituras, idempotencia y modo humano siguen bajo el control existente.

`dialogue/answer.ts` redacta respuestas a preguntas administrativas usando solo hechos del catálogo, sin calendarios estáticos ni herramientas de escritura. Comprueba referencias, cifras y determinadas afirmaciones prohibidas. Estas comprobaciones no prueban la veracidad semántica de toda paráfrasis: la evaluación real y la supervisión siguen siendo necesarias. Las confirmaciones de reserva continúan siendo texto controlado basado en el resultado de la escritura.

Un turno con preguntas o ambigüedades no escribe una reserva; puede guardar datos y responder antes de continuar. Las consultas de agenda son de solo lectura. Ante fallo del modelo, conserva estado, no escribe y pide aclaración; las derivaciones de seguridad detectadas por el sistema de respaldo siguen vigentes.

## Activación y reversión

- `MATERNALY_DIALOGUE_MODE=off`: comportamiento anterior, valor predeterminado.
- `MATERNALY_DIALOGUE_MODE=shadow`: evalúa interpretación nueva pero la respuesta y las acciones siguen el recorrido anterior. Añade coste y latencia; no activar globalmente sin revisar resultados.
- `MATERNALY_DIALOGUE_MODE=active`: nueva interpretación y respuesta conversacional, con las protecciones transaccionales existentes.
- `MATERNALY_DIALOGUE_MODEL`: si falta utiliza `LLM_MODEL`. Tras la comparación real del 8 de septiembre, la configuración seleccionada para la capa nueva es `gpt-5.4-2026-03-05`; las llamadas heredadas mantienen su modelo existente. GPT-5 usa razonamiento `low` en la comprensión, con un máximo de 20 segundos. La respuesta informativa tiene su propio límite de 10 segundos.
- `MATERNALY_DIALOGUE_EVAL_ENABLED=true`: permite al administrador ejecutar exclusivamente los casos ficticios incorporados. Dejar `false` fuera de evaluaciones.

El endpoint autenticado `POST /api/maternaly/admin/dialogue/evaluate` admite solo un offset de casos predefinidos, hasta cuatro casos por petición y una ejecución simultánea por proceso. No acepta mensajes libres, no consulta conversaciones reales, no escribe en Sheets, no usa persistencia ni envía WhatsApp. Llama al modelo real y tiene coste de API. Nunca devolver credenciales ni respuestas con datos de usuarios en sus resultados.

## Verificación y límites

Las pruebas unitarias e integradas prueban fronteras de autorización, memoria, recuperación ante fallo y ausencia de escrituras en turnos mixtos. No sustituyen a la evaluación real. La batería incluye 60 casos de comprensión, 35 conversaciones de varios turnos y 20 respuestas informativas. Los casos usados para ajustar el comportamiento son regresiones, aunque conserven etiquetas históricas de `holdout`; no son evidencia independiente.

El evaluador `scripts/maternaly-dialogue-live-eval.cjs`, incluido en el contenedor, admite `--suite=understanding|conversation|answers`, `--offset`, `--count` (máximo 40) y `--repeat` (máximo 3). Aísla Sheets en memoria, WhatsApp mock, sin DB ni recordatorios y limita la red a Responses. Sus informes `/tmp/maternaly-dialogue-*.json` son efímeros. Los resultados, fallos y criterios modificados quedan resumidos en `docs/maternaly-dialogue-live-evaluation-2026-09-08.md`.

La prueba integrada de entrada incluye mensajes concurrentes, almacenamiento y SID duplicado con modelo y Sheets simulados. La evaluación real del núcleo no prueba la entrega de Twilio ni una inscripción sobre Sheets real. No se debe presentar como un ensayo completo de extremo a extremo del canal externo.

La activación exige revisar las evaluaciones reales y conversaciones completas aisladas; una prueba manual controlada del canal de WhatsApp sigue siendo necesaria para validar el transporte externo. No se promete comprensión perfecta ni se considera el JSON válido prueba suficiente de comprensión.

Reversión: `MATERNALY_DIALOGUE_MODE=off`, guardar y volver a implementar el servicio. Los campos de memoria son aditivos y compatibles con el recorrido anterior. No se migran ni borran reservas.
