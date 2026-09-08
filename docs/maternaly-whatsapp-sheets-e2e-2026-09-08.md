# Prueba real WhatsApp → chatbot → Google Sheets

Fecha: 8 de septiembre de 2026, aproximadamente 19:27–19:32 (Europe/Madrid).

## Resultado

Una inscripción real confirmada mediante el Sandbox de Twilio y verificada en la hoja normalizada de charla informativa. No se insertaron filas manualmente ni se sustituyó Sheets por memoria. Esta prueba es distinta de las baterías aisladas documentadas en `maternaly-dialogue-live-evaluation-2026-09-08.md`.

El usuario autorizó la prueba y vinculó WhatsApp Web. Se utilizó el teléfono de pruebas ya incorporado al Sandbox y el nombre ficticio **Prueba Conversacional Septiembre**, acompañante **Control**. No se guardan teléfonos ni credenciales en este informe.

## Recorrido observado

1. `reiniciar`: el bot respondió que había reiniciado la conversación.
2. `Quiero apuntarme a la charla informativa de embarazo. Mi fecha probable de parto es el 14/04/2027 y prefiero Erandio.`: reconoció FPP y sede; ofreció 24/09/2026 18:30 y 08/10/2026 18:30, ambas en Erandio, indicando compatibilidad con las semanas 1–20.
3. `La primera, el 24 de septiembre. Iré con mi pareja, seremos dos. Por cierto, ¿es gratuita?`: reconoció el número de asistentes y respondió que es gratuita. No afirmó haber reservado.
4. `Perfecto, seguimos con la reserva. Mi nombre es Prueba Conversacional Septiembre y mi acompañante se llama Control.`: reconoció nombre y acompañante. Se comprobó que todavía no existía una inscripción nueva.
5. `Sí, confirma la reserva para el 24 de septiembre a las 18:30 en Erandio para los dos.`: confirmó la reserva e indicó la sesión y dirección de Erandio. No hubo que repetir FPP ni nombres.
6. `¿Entonces ya estamos apuntados los dos para el 24 de septiembre? Solo quiero comprobarlo, no crear otra reserva.`: respondió que había consultado la agenda y que la inscripción figuraba activa y confirmada, sin crear ni modificar una reserva.

## Evidencia de persistencia

Hoja: [Inscripciones, fila 7](https://docs.google.com/spreadsheets/d/1J1YvoIgaODPK8O4_kVICMNoxVDuEBivXjOKFdOWqte8/edit?gid=614365631#gid=614365631&range=A7:P7).

La posición A7 se comprobó también en el editor de Sheets: la barra de contenido mostraba el identificador de inscripción indicado abajo. Las consultas de datos fueron de solo lectura.

| Campo | Valor observado |
| --- | --- |
| inscripcion_id | INS_BOT_F922956A3589E679 |
| nombre / apellidos | Prueba / Conversacional Septiembre |
| grupo_id | CHARLA120_ERANDIO_20260924 |
| sesión en observaciones | SES_CHARLA120_ERANDIO_20260924 |
| fecha_inscripcion | 2026-09-08T17:30:54.720Z |
| canal_origen | whatsapp |
| estado_inscripcion | Activa |
| precio_acordado / estado_pago | 0 / no_aplica |
| fpp | 46491, serial de Sheets; observaciones: 2027-04-14 |
| pareja_nombre | Control |
| asistentes en observaciones | personas:2 |

Antes: tres inscripciones, ninguna con el nombre de prueba. Después de confirmar: cuatro inscripciones totales, exactamente una con ese nombre e identificador. Tras la consulta posterior de estado y una nueva lectura: cuatro inscripciones, el mismo identificador una sola vez.

En `Interacciones_Chatbot` también se verificó un evento coincidente:

- ID: `INT_BOT_F922956A3589E679`.
- Acción: `maternaly_registration_confirmed`.
- Resultado: `confirmed`.
- Requiere humano: `no`.
- Mismos FPP, acompañante, sesión y número de asistentes.

## Límites y mejora detectada

La escritura real y la consulta de estado sin duplicación quedaron comprobadas en **una** reserva; esto no demuestra por sí solo todas las combinaciones conversacionales, servicios ni reintentos de transporte. No se probó una cancelación ni un cambio posterior a la confirmación.

Los turnos 3 y 4 resultaron demasiado escuetos: el bot acusó recibo de datos, pero no indicó claramente qué hacer después. Fue necesario pedir una confirmación explícita repitiendo fecha y sede. Esta prueba no demuestra que la selección de sesión del turno 3 se hubiera conservado por sí sola. Queda pendiente revisar ese avance conversacional, aunque no se perdieron los nombres, la FPP ni el acompañante al confirmar.

La inscripción ficticia queda **activa** como evidencia de la prueba. No se canceló ni borró y no debe confundirse con una asistencia real. La eventual limpieza requiere una decisión del usuario.

## Corrección posterior de la continuidad y del tono

Código funcional `0c7d7f2`, desplegado desde EasyPanel el mismo día. El historial mostró una implementación correcta y el contenedor cambió; salud posterior: `ok: true`, diálogo `active`, persistencia duradera. La inscripción real anterior no se modificó.

- El intérprete ya no recibe la instrucción contradictoria de descartar cualquier selección en mensajes con preguntas. Una elección explícita y una duda se conservan simultáneamente; la duda no autoriza una escritura.
- Una selección válida de las opciones ofrecidas avanza el borrador a recopilación de datos aunque haya una pregunta intermedia. No ejecuta una reserva en ese turno.
- Se sustituyen los mensajes «He recogido: [campos]» por frases como «Perfecto, vendréis dos» o «Gracias, [nombre]».
- Tras contestar, se indican los datos pendientes o se solicita consentimiento para continuar. Si falta seleccionar una sesión, se pide fecha u opción; no se deja una simple confirmación de recepción.

OpenAI Docs se utilizó para acotar el cambio de instrucciones y eliminar la contradicción sin cambiar modelo, parámetros, credenciales ni permisos. Referencia: [instrucciones contradictorias y experimentación](https://developers.openai.com/cookbook/examples/gpt-5/prompt-optimization-cookbook#migrating-and-optimizing-prompts).

Validación local del código funcional: 1.097 tests superados, uno omitido, uno pendiente; lint y compilación correctos. Se añadió después una variante de prueba de nombres sin segunda pregunta: 13/13 tests del archivo de diálogo, sin cambios adicionales en el código funcional.

Tres repeticiones con GPT-5.4 real (`gpt-5.4-2026-03-05`) del nuevo caso mixto, con Sheets en memoria y transporte deshabilitado: informe `1788890119927`. Resultado automático original: 1/3 por una expectativa literal de respuesta demasiado restrictiva. En las otras dos, el bot sí contestó al precio y pidió aclarar un nombre pendiente; no quedó en una mera recepción de campos. Las tres conservaron sesión/cantidad, no escribieron en los turnos con dudas, solicitaron consentimiento y terminaron con una única inscripción simulada al responder «Sí», sin repetir fecha ni nombres.

Se ajustó únicamente la expectativa de respuesta del evaluador para aceptar tanto la petición conjunta de datos como la aclaración concreta de un nombre pendiente. Se reforzó además la comprobación del estado para exigir exactamente `pendingFields: [fullName, partnerName]`. Se conserva arriba el resultado automático original; no se presenta como una nueva ejecución superada.

Reevaluación de esas mismas tres salidas guardadas: 3/3 cumplen el criterio corregido, incluidas las comprobaciones restantes originales, estado final `confirmed` y exactamente una inscripción simulada. No se hicieron nuevas llamadas para esa reevaluación.

Regresión posterior con el mismo código funcional y GPT-5.4 real: **35/35 conversaciones superadas**, informe `1788890467681`. Incluye mensajes separados, datos multilínea, duplicados, FPP corregida, preguntas sobre otros servicios, negaciones, cancelación explícita, privacidad, autorización, falta de capacidad, fallo de escritura, BLW y cambio a acudir sin acompañante. Las hojas y los transportes de esa batería están aislados; no son 35 reservas reales.

Repetición final local tras ampliar la prueba: **1.098 tests superados**, uno omitido y uno pendiente. Los cambios posteriores a `0c7d7f2` solo amplían pruebas y documentación, sin modificar el comportamiento desplegado. Las frases de WhatsApp ya enviadas no se editan retroactivamente.
