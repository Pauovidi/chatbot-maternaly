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
- `MATERNALY_DIALOGUE_MODEL`: opcional; si falta utiliza `LLM_MODEL`. No se cambia el modelo existente como parte de esta entrega.
- `MATERNALY_DIALOGUE_EVAL_ENABLED=true`: permite al administrador ejecutar exclusivamente los casos ficticios incorporados. Dejar `false` fuera de evaluaciones.

El endpoint autenticado `POST /api/maternaly/admin/dialogue/evaluate` admite solo un offset de casos predefinidos, hasta cuatro casos por petición y una ejecución simultánea por proceso. No acepta mensajes libres, no consulta conversaciones reales, no escribe en Sheets, no usa persistencia ni envía WhatsApp. Llama al modelo real y tiene coste de API. Nunca devolver credenciales ni respuestas con datos de usuarios en sus resultados.

## Verificación y límites

Las pruebas unitarias e integradas prueban fronteras de autorización, memoria, recuperación ante fallo y ausencia de escrituras en turnos mixtos. No sustituyen a la evaluación real. La batería semántica incluye 20 casos, 7 inicialmente reservados; si estos casos se utilizan para ajustar el prompt dejan de ser evidencia independiente y debe añadirse un nuevo conjunto no utilizado.

No activar para conversaciones normales antes de examinar los resultados reales y probar conversaciones completas en el canal de pruebas. No se promete comprensión perfecta ni se considera el JSON válido prueba suficiente de comprensión.

Reversión: `MATERNALY_DIALOGUE_MODE=off`, guardar y volver a implementar el servicio. Los campos de memoria son aditivos y compatibles con el recorrido anterior. No se migran ni borran reservas.
