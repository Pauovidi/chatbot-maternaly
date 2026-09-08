# Evaluación real del diálogo — 2026-09-08

## Actualización tras corregir la credencial

La autenticación se verificó con HTTP 200 y respuesta completada. El bloqueo descrito más abajo es histórico, ya resuelto. Tras las rondas descritas en este informe, la nueva capa quedó **activa** en el servicio de EasyPanel el 8 de septiembre de 2026. Los apartados que indican `off` corresponden a las fases anteriores de evaluación.

Se añadió un evaluador CLI al artefacto Docker. Solo hereda la credencial y el modelo de OpenAI; usa Sheets en memoria, WhatsApp mock, sin persistencia ni recordatorios. Una segunda barrera de red solo permite Responses. Ejercita el núcleo conversacional real, NO el transporte WhatsApp completo.

Resultados antes de la segunda ronda de correcciones:

| Artefacto / modelo | Batería | Superados |
| --- | --- | --- |
| Primera revisión / gpt-4o-mini | 20 casos, dos repeticiones | 11/40 |
| Primera revisión / gpt-4.1-mini | 20 casos, dos repeticiones | 30/40 |
| 8de8b20 / gpt-4.1-mini | 40 casos de comprensión | 34/40 |
| 8de8b20 / gpt-4.1 | Los mismos 40 casos | 31/40 |
| 8de8b20 / gpt-4.1-mini | 29 conversaciones de varios turnos | 23/29 |
| 8de8b20 / gpt-4.1-mini | 20 respuestas informativas | 16/20 |

Los informes completos se generaron en `/tmp` del contenedor (datos ficticios, sin secretos); son efímeros. Resultados inspeccionados: understanding mini `1788880582423`, understanding 4.1 `1788880929054`, conversation `1788880648703`, answers `1788880921846`.

Hallazgos: hipótesis convertida en asistentes; nombres incompletos y ambigüedades; pregunta de cancelación mal clasificada pero bloqueada por el validador; descubrimiento enviado al generador sin fuentes; rechazos excesivos por números no citados y por un tema legítimo de la charla. Un fallo del evaluador detectaba «he reservado» dentro de «No he reservado»; se corrigió para comprobar cero escrituras, cero inscripciones y estado bloqueado. No se contabiliza ese caso como reserva indebida.

La revisión manual de las respuestas también comprobó precios, límites de información desconocida y ausencia de confirmaciones inventadas. Los controles automáticos de palabras/números NO equivalen a demostrar todas las afirmaciones contra fuentes. Los casos usados para ajustar instrucciones pasan a ser regresiones, no una muestra independiente.

Pruebas automáticas del artefacto 8de8b20: 1.065 superadas, una omitida y una pendiente; compilación y lint correctos. Estas cifras no sustituyen la evaluación del modelo real.

## Ronda 3025261

- Comprensión gpt-4.1-mini: 60/80 (40 casos repetidos dos veces), informe `1788881616504`.
- Conversaciones gpt-4.1-mini: 19/29, informe `1788881580776`.
- Respuestas gpt-4.1-mini: 18/20, informe `1788881739806`.
- Piloto gpt-5.4-mini, parámetros predeterminados: 14/20, informe `1788881683788`.
- Batería local: 1.072 superadas, una omitida, una pendiente; build y lint correctos.

Esta ronda NO supera la puerta de calidad. Las salidas exactas mostraron solicitudes innecesarias de apellidos del acompañante, datos acompañados a la vez de una ambigüedad del mismo campo, autorización sin cita, confusión entre preguntas de la usuaria y preguntas que el asistente quería hacer, y uso de evidencia del historial. La indicación auxiliar de no extraer actualizaciones del historial podía contradecir la corrección del año de una fecha previa. Se preparó una revisión con contratos de campos más explícitos, contexto que permite resolver referencias sin reciclar evidencia, precedencia conservadora de la incertidumbre y validación de cualquier actionEvidence presente.

Además se detectó una afirmación inventada sobre la empresa destinataria de una factura, con lista de fuentes vacía. Se añadió una barrera que rechaza afirmaciones sin fuentes (solo permite expresar desconocimiento), sin considerar ese control como prueba general de veracidad. Las políticas de pago/facturación y respuestas desconocidas requieren nueva comprobación.

## Ronda 60d72d4

Con exactamente el mismo código, gpt-4.1-mini superó 28/40 (`1788882246775`) y gpt-5.4-mini superó 38/40 (`1788882221855`). El segundo informe acredita el modelo efectivo devuelto por la API: `gpt-5.4-mini-2026-03-17`. La aclaración del contrato/contexto sí mejoró esta combinación; no basta con cambiar el nombre del modelo sin evaluar el conjunto.

Los dos casos pendientes de gpt-5.4-mini: no pedir aclaración al elegir una opción que no estaba en la lista, y etiquetar «no canceles nada» como `decline` en lugar de `none`. Para el primero se añadió una repregunta de sesión al quedar sin resolver una selección. Para el segundo se aceptan ambas formas de denegar autorización, exigiendo además cero actualizaciones y ninguna selección; se añadió un turno de conversación que verifica reserva conservada y cero escrituras. Se corrigió también la respuesta de rechazo cuando ya existe una inscripción: no debe decir «no continúo con la reserva».

Se añadió una memoria de autorización emitida por la aplicación: un asentimiento aislado solo puede autorizar tras una pregunta explícita de continuar con la reserva. La marca se consume/renueva con cada respuesta, y se prueba una conversación de dos turnos que primero pregunta y luego registra exactamente una vez.

## Ronda f9834b1: primera muestra independiente y conversaciones

Modelo fijado al snapshot `gpt-5.4-mini-2026-03-17`:

- 18/20 casos nuevos no ejecutados anteriormente (`1788882692419`).
- 28/31 conversaciones completas (`1788882748150`).
- Batería local del artefacto: 1.076 superadas, una omitida y una pendiente.

Los dos fallos de comprensión fueron hipótesis (cantidad y FPP) que el modelo incluyó simultáneamente como pregunta y actualización. Uno quedó bloqueado; el otro evidenció que la segmentación no cubría una pregunta con dos cláusulas. Se añadió una regla conservadora: una cita que el propio modelo identifica como parte de una pregunta no puede respaldar una actualización de datos; se conserva la pregunta y los datos independientes.

Las conversaciones revelaron comillas de cita añadidas alrededor de evidence, una sede heredada convertida en actualización y una derivación del clasificador antiguo tras rechazar la interpretación de una cancelación negada. Se toleran delimitadores exteriores de cita sin cambiar palabras, se excluyen las actualizaciones contenidas en preguntas y se impide que una señal antigua de cancelación/reactualización reactive una derivación al fallar el intérprete nuevo. Las derivaciones de seguridad clínica/pagos siguen preservadas.

Se añadió memoria persistente de campos pendientes de aclaración: una corrección ambigua no puede olvidarse al llegar después otro dato y terminar reservando con el acompañante antiguo. Una prueba de tres turnos verifica que solo registra después de conocer el acompañante nuevo.

También pasa una prueba de entrada/persistencia con tres mensajes simultáneos y un SID duplicado, modelo simulado y Sheets en memoria: procesa en orden, conserva los datos previos en el contexto siguiente y crea una sola inscripción. Esto cubre el adaptador de entrada y el almacenamiento; sigue sin enviar WhatsApps reales ni validar el transporte externo en producción.

Respuestas informativas: 17/20 según el evaluador automático (`1788883047535`), revisadas manualmente. La respuesta sobre tres asistentes empezaba por «Sí» para después indicar que no podía confirmar ese aforo: no autorizó una reserva, pero resulta engañosa. Se reforzó que una condición desconocida se responda primero con esa incertidumbre. Los otros dos fallos fueron criterios léxicos demasiado estrechos: yoga se describió como «actividad prenatal» y psicología explicó que no podía confirmar temas concretos. Se amplió el criterio para aceptar «prenatal» o desconocimiento explícito, sin dar por demostradas otras afirmaciones ni reinterpretar el 17/20 original. También se pidió no sustituir contenidos desconocidos por precios/horarios no solicitados.

## Ronda c24690b

Batería local: 1.081 superadas, una omitida y una pendiente; build/lint correctos. Modelo real fijado a `gpt-5.4-mini-2026-03-17`, todavía sin razonamiento explícito:

- Comprensión repetida: 77/80 (`1788883779085`).
- Segunda ejecución adicional de comprensión: 77/80 (`1788883916792`); no se descarta. Incluye una FPP inventada a partir de un año sin referencia, por lo que se añade un control independiente que no permite tomar día/mes de la fecha actual.
- Conversaciones: 30/32 (`1788883711671`) y 27/32 (`1788883816491`). La segunda ejecución se inició por una repetición del comando durante un retraso visual de la consola; se conserva y se cuenta su resultado, no se descarta por ser peor.

No supera la puerta de calidad. Aparecieron preguntas inventadas a partir del historial, citas de acciones tomadas del mensaje anterior y «prima» guardado literalmente como nombre. Este último es un fallo transaccional en la simulación: reservó con ese valor al llegar la FPP. Se añadió validación de nombres que convierte un parentesco sin nombre en un campo pendiente, conservado entre turnos. No se modificaron inscripciones reales.

La siguiente revisión probará razonamiento `low` para GPT-5, con límite de salida de 4.000 tokens y tiempo máximo de 20 segundos para el intérprete; GPT-4 mantiene los parámetros previos. Debe medirse de nuevo exactitud y latencia antes de activar. Se basa en los parámetros documentados oficialmente del modelo, sin asumir que el ajuste por sí solo garantiza calidad.

Respuestas: 19/20 automático (`1788883942440`), revisadas todas manualmente. El caso de psicología expresa correctamente que los temas concretos no están descritos en las fuentes; no coincide con la expresión regular del evaluador. Se conserva como 19/20 automático y se distingue la revisión humana favorable de ese caso. Las otras respuestas no inventan plazas, descuentos, cancelaciones ni contenidos desconocidos; aún hay formulaciones mejorables (por ejemplo «si devolvéis» al hablar de la propia empresa).

## Ronda 49dfe67: razonamiento y comparación de modelos

- Batería local: 1.089 superadas, una omitida y una pendiente; build/lint correctos. El chequeo TypeScript de todos los tests del repositorio detecta errores en tests antiguos; los dos de tipado del nuevo evaluador se corrigieron. No se presenta ese chequeo global como superado.
- GPT-5.4-mini con razonamiento low: 78/80 comprensión (`1788884455286`), 59/64 conversaciones (`1788884526837`). Sin superar la puerta de calidad: errores de comprensión bloqueados y respuestas inadecuadas de privacidad/descubrimiento.
- GPT-5.4 completo (`gpt-5.4-2026-03-05`) con low: 39/40 comprensión (`1788884683326`) y 31/32 conversaciones (`1788884636244`).

La interpretación que falla el criterio automático de comprensión niega autorización usando `decline` en vez de `none`, conserva la pregunta y no modifica datos ni sesión. Se amplía ese criterio a ambas formas de denegar, reforzando que no haya ninguna actualización y sí una pregunta; se mantiene publicado el 39/40 original.

La conversación pendiente del modelo completo pregunta por el uso de datos personales. El intérprete la reconoce como pregunta, pero el renderizador confunde «para qué necesitas mis datos» con datos pendientes. Se añade foco específico de privacidad y se limita la detección de preguntas sobre campos faltantes. La respuesta no afirma haber borrado datos ni tramitado derechos. Se añaden además tres conversaciones de aceptación: BLW con todos los datos, correo al final y cambio a acudir sola; las dos de BLW pasan con modelo simulado y correo oculto al modelo.

## Ronda 20375f7: regresión repetida con GPT-5.4 completo

Modelo fijado a `gpt-5.4-2026-03-05`, razonamiento low para comprensión:

- 80/80 interpretaciones, 40 casos repetidos dos veces (`1788885265829`).
- 70/70 conversaciones, 35 escenarios repetidos dos veces (`1788885366397`).
- El segundo grupo incluye BLW con correo y fecha de nacimiento, privacidad y cambio de dos asistentes a una persona. Se revisó además el estado persistido y se reforzó la prueba de acudir sola para exigir que se elimine el acompañante anterior; ese refuerzo y su corrección todavía requieren validación en el siguiente artefacto.

Estos son resultados de regresión, no una garantía estadística de fiabilidad ni una prueba del envío real de WhatsApp. La activación sigue pendiente mientras se completan las comprobaciones restantes.

- Otras 20 interpretaciones: 19/20 (`1788885514967`). El caso `accept_explicit_count` ya tenía `peopleCount: 2` en la memoria del evaluador; el modelo no vuelve a emitir el mismo dato, conforme a la instrucción de no repetir datos sin cambios. No pierde ni cambia la cantidad. Se corrige el estado inicial de la prueba a cantidad desconocida y se conserva el requisito de extraer dos personas; se repetirá sin modificar el intérprete para este caso. Se mantiene el 19/20 original.
- Respuestas informativas: 20/20 (`1788885478501`), todas leídas manualmente. Fuentes del catálogo respetadas; no confirma agenda ni inscripciones, descuentos, parking o devoluciones desconocidas. Quedan mejoras de estilo: exceso de lenguaje sobre «información verificada» y algunos datos adicionales no solicitados.
- Las 70 conversaciones contienen 116 turnos: mediana 2.775 ms, p95 5.028 ms y máximo 5.747 ms del núcleo aislado. No incluye latencia de WhatsApp ni Sheets real. Las llamadas incluyen el intérprete nuevo GPT-5.4 y llamadas heredadas a gpt-4o-mini; no se afirma que todo el sistema utilice un único modelo.
- Revisión local posterior: 1.093 tests superados, uno omitido y uno pendiente; compilación de producción y lint correctos.

## Ronda f79ee09: comprobación del artefacto final

Sin cambiar el prompt ni el modelo respecto a 20375f7:

- 20/20 interpretaciones del bloque final, ahora con cantidad inicial desconocida en `accept_explicit_count` (`1788885818630`).
- 35/35 conversaciones completas (`1788885921517`), incluyendo la eliminación comprobada del acompañante anterior al pasar a una persona.
- 3/3 repeticiones adicionales de ese caso de dos turnos (`1788885871584`), sin acompañante residual y exactamente una inscripción simulada por ejecución.

Puerta funcional del núcleo superada para esta batería. Se preparó la activación con `MATERNALY_DIALOGUE_MODE=active`, `MATERNALY_DIALOGUE_MODEL=gpt-5.4-2026-03-05` y `MATERNALY_DIALOGUE_EVAL_ENABLED=false`; la comprobación del servicio después del despliegue se anotará separadamente. No se enviaron mensajes reales ni se escribieron inscripciones reales.

El conjunto final cubre 60 expresiones de comprensión (las primeras 40 repetidas), 35 conversaciones (dos repeticiones previas y otra sobre el artefacto final), 20 respuestas informativas y tres repeticiones adicionales del caso reforzado. Los resultados históricos peores permanecen en este informe; no se cuentan como superados por haber mejorado una revisión posterior.

## Activación verificada

La activación se realizó después de enviar `524cabb` a la rama configurada (solo documentación adicional respecto al código funcional `f79ee09`) e implementar desde EasyPanel. El endpoint de salud no expone el hash de commit; sí devolvió `ok: true`, `dialogueMode: active` y Postgres preparado con persistencia duradera. La lectura limitada a tres variables no secretas en el nuevo contenedor confirmó:

```text
MATERNALY_DIALOGUE_MODE=active
MATERNALY_DIALOGUE_MODEL=gpt-5.4-2026-03-05
MATERNALY_DIALOGUE_EVAL_ENABLED=false
```

El endpoint Twilio respondió correctamente al diagnóstico GET, con proveedor disponible y modo sandbox. Esto verifica configuración, no la entrega real de un WhatsApp. La comprobación posterior de seis conversaciones aisladas SIN sobrescribir el modelo superó 6/6 (`1788886189932`): usa la configuración guardada del contenedor, el informe identifica `gpt-5.4-2026-03-05` y no afecta a datos reales. Incluye mensajes separados, datos multilínea, duplicados, corrección del año de FPP, datos con pregunta intermedia, hipótesis de una tercera persona y cambio de acompañante.

Reversión operativa: cambiar únicamente `MATERNALY_DIALOGUE_MODE=off`, guardar e implementar. No borrar conversaciones ni reservas. La configuración anterior de Sheets, Twilio y base de datos se conservó; el modelo heredado no se cambió. No se habilitaron recordatorios ni se crearon tareas recurrentes.

## Ejecución inicial comprobada (histórico: credencial ya corregida)

Se ejecutaron los 20 casos ficticios de `dialogue/evaluation.ts` en una instancia temporal del mismo artefacto desplegado, iniciada desde la consola autorizada de EasyPanel. Escuchó únicamente en `127.0.0.1:3001`, con la evaluación habilitada, modo conversacional `off`, proveedor WhatsApp `mock` y escritura de Sheets deshabilitada. El proceso temporal terminó al finalizar la evaluación. No se cambiaron las variables guardadas del servicio principal.

Los cinco lotes del endpoint interno respondieron HTTP 200, pero los 20 casos devolvieron `reason: http_error`, sin interpretación aceptada. Modelo configurado: `gpt-4o-mini`. Esto NO mide la capacidad de comprensión del modelo: las llamadas no llegaron a producir respuestas válidas.

## Diagnóstico independiente

Una petición mínima a Responses, utilizado tanto por el intérprete anterior como por el nuevo, devolvió HTTP 401, código `invalid_api_key`. Una petición mínima independiente a Chat Completions devolvió el mismo estado y código. Se comprobó únicamente que la variable está presente y que no tiene espacios ni comillas envolventes; no se copiaron valores de credenciales a este informe. El código del intérprete anterior confirma que, ante un estado HTTP no satisfactorio, utiliza el clasificador determinista de respaldo.

La comprobación de salud que informa `configured: true` solo acredita presencia de configuración, no autenticación válida contra OpenAI. El fallo actual no permite concluir cuándo empezó ni atribuirle por sí solo todas las incidencias históricas.

## Pendiente en la ejecución inicial (histórico)

1. El titular debe introducir una credencial válida de OpenAI mediante el gestor de secretos/configuración, sin enviarla al chat.
2. Volver a desplegar y verificar autenticación.
3. Repetir los casos semánticos y evaluar conversaciones completas, respuestas informativas y ausencia de efectos transaccionales indebidos.
4. Mantener la nueva capa desactivada para conversaciones normales hasta superar estas comprobaciones.

Las pruebas automáticas previas siguen siendo evidencia de lógica e integración simulada; no sustituyen esta validación real pendiente.
