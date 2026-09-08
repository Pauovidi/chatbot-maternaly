# Reparación de selección de servicios — 8 de septiembre de 2026

## Incidente y causa reproducida

Recorrido humano: reiniciar → «Estoy embarazada» → «Charla informativa» → repetir «Charla informativa». El bot volvía al catálogo incluso cuando el intérprete identificaba correctamente el servicio. `goal=explore` se traducía incondicionalmente a `service_discovery`; la política elegía `catalog_info` y eliminaba el servicio del estado. El antirrepetición solo cambiaba el prefijo.

## Reparación

- El catálogo se diferencia del interés por un servicio explícito o contextual.
- Elegir un servicio se resuelve como información, no como autorización para reservar.
- La explicación se muestra también si se aportan datos en el mismo mensaje, sin quedar en un simple acuse de recibo.
- Consultar información no sustituye una reserva en curso o confirmada.
- El contrato del intérprete distingue opciones de servicios de opciones de sesiones y conserva el tema al insistir.
- No se cambian modelo, credenciales, agenda, capacidad ni permisos de escritura.

Se usó OpenAI Docs para acotar la aclaración del contrato y evitar instrucciones contradictorias: [experimentación y consistencia del prompt](https://developers.openai.com/cookbook/examples/gpt-5/prompt-optimization-cookbook#migrating-and-optimizing-prompts).

## Evidencia local

- Antes de reparar: 10 de las 12 primeras pruebas nuevas fallaban; dos controles pasaban.
- Después: 14 pruebas específicas pasan, incluidas dos adicionales de conservación de inscripción confirmada.
- Batería completa final: 1.112 pruebas superadas, una omitida y una pendiente.
- Lint y compilación de producción correctos.
- Estas pruebas simulan la interpretación: demuestran el comportamiento de la aplicación, no la comprensión real del modelo.

Se añaden cinco recorridos para evaluación real: elección literal, «la primera», «esa charla», interés expresado con otras palabras y mensaje mixto con etapa/interés, pregunta de precio, cambio a BLW y retorno voluntario al catálogo. Los cuatro primeros incluyen repetición y rechazo de reserva. Todos exigen ausencia de escrituras.

## Despliegue y evaluación real

Primera reparación funcional: `fa8ddc0`, despliegue marcado Success y health público `ok: true`.

Primera evaluación con llamadas reales a `gpt-5.4-2026-03-05`:

- Regresión anterior: 36/36 conversaciones, informe del contenedor `1788903470619`.
- Nuevos recorridos, tres repeticiones: 7/15 completos, informe `1788903443630`. No se presenta como una validación superada.
- La selección literal de charla ya produce explicación específica. Los fallos exponen otro defecto: «Estoy embarazada» con `scope=explicit`, sin servicio, puede recibir solo «Gracias, tengo en cuenta lo que me indicas». Sin lista previa, algunas referencias «la primera» requieren aclaración.
- Se corrige la transición de etapa sin tema para ofrecer orientación, independientemente de que el modelo llame explícita o contextual a esa declaración. No se relajan los criterios de aceptación.
- Los registros incluyen también `gpt-4o-mini-2024-07-18` en el camino heredado de reinicio; no se afirma que cada llamada del sistema sea GPT-5.4.

Segunda revisión: se añaden tres controles para declaraciones de etapa clasificadas como `explore`, `ask` y `continue` con ámbito explícito. Las 17 pruebas específicas pasan. También pasan las 13 pruebas de diálogo anteriores y la compilación.

Una ejecución completa concurrente con la compilación terminó con 1.114 pruebas superadas y un timeout de 5 segundos en una prueba heredada de reserva. Esa prueba y su archivo completo pasan por separado (29/29). Se repite la batería completa con dos trabajadores, sin ampliar el timeout ni modificar las expectativas.

Repetición completa local con dos trabajadores: **1.115 superadas**, una omitida y una pendiente. No se modificó el timeout de las pruebas.

Versión final desplegada: `3045bbb`, registro de EasyPanel «Ensure stage-only introductions offer service discovery», resultado Success. Health posterior: `ok: true`, modo de diálogo `active`, almacenamiento `postgres`, base de datos accesible, uptime 70 segundos.

Segunda repetición real, sobre `3045bbb`, **sin relajar expectativas**:

- **15/15** nuevos recorridos, cinco variantes por tres repeticiones. Informe del contenedor: `/tmp/maternaly-dialogue-conversation-0-gpt-5.4-2026-03-05-1788903977733.json`.
- **36/36** recorridos de regresión. Informe: `/tmp/maternaly-dialogue-conversation-5-gpt-5.4-2026-03-05-1788903977623.json`.
- Los 15 recorridos de descubrimiento suman **72 turnos**; todas las comprobaciones de ausencia de escritura pasan y el número de inscripciones simuladas es cero durante todos sus turnos.
- Se inspeccionó la interpretación real de «Charla informativa»: `goal=explore`, `serviceId=charla_embarazo_1_20`, `scope=explicit`, `authorization=none`, sin selección de sesión. La respuesta explica la charla, matronas, gratuidad, autocuidados, alimentación y modalidad, en lugar del catálogo.
- Modelo efectivo verificado en las respuestas de API: `gpt-5.4-2026-03-05`; el camino heredado de reinicio mantiene llamadas a `gpt-4o-mini-2024-07-18`.
- Se ejecutó el núcleo incluido en el artefacto desplegado con llamadas reales a OpenAI. Sheets se mantuvo en memoria; WhatsApp, persistencia y recordatorios estaban aislados. **No es una nueva prueba humana por WhatsApp ni una prueba de escritura real en Excel.** No se crearon ni cancelaron reservas reales.

El fallo concreto queda reparado y desplegado. Estos resultados no acreditan perfección general del chatbot fuera de los escenarios evaluados. Los informes `/tmp` son del contenedor y pueden perderse en un redeploy; este documento conserva el alcance, resultados, interpretación y límites verificados.
