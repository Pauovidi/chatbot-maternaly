# Evaluación real del diálogo — 2026-09-08

## Actualización tras corregir la credencial

La autenticación se verificó con HTTP 200 y respuesta completada. El bloqueo descrito más abajo es histórico, ya resuelto. La nueva capa permanece `off` en producción.

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

## Ejecución comprobada

Se ejecutaron los 20 casos ficticios de `dialogue/evaluation.ts` en una instancia temporal del mismo artefacto desplegado, iniciada desde la consola autorizada de EasyPanel. Escuchó únicamente en `127.0.0.1:3001`, con la evaluación habilitada, modo conversacional `off`, proveedor WhatsApp `mock` y escritura de Sheets deshabilitada. El proceso temporal terminó al finalizar la evaluación. No se cambiaron las variables guardadas del servicio principal.

Los cinco lotes del endpoint interno respondieron HTTP 200, pero los 20 casos devolvieron `reason: http_error`, sin interpretación aceptada. Modelo configurado: `gpt-4o-mini`. Esto NO mide la capacidad de comprensión del modelo: las llamadas no llegaron a producir respuestas válidas.

## Diagnóstico independiente

Una petición mínima a Responses, utilizado tanto por el intérprete anterior como por el nuevo, devolvió HTTP 401, código `invalid_api_key`. Una petición mínima independiente a Chat Completions devolvió el mismo estado y código. Se comprobó únicamente que la variable está presente y que no tiene espacios ni comillas envolventes; no se copiaron valores de credenciales a este informe. El código del intérprete anterior confirma que, ante un estado HTTP no satisfactorio, utiliza el clasificador determinista de respaldo.

La comprobación de salud que informa `configured: true` solo acredita presencia de configuración, no autenticación válida contra OpenAI. El fallo actual no permite concluir cuándo empezó ni atribuirle por sí solo todas las incidencias históricas.

## Pendiente

1. El titular debe introducir una credencial válida de OpenAI mediante el gestor de secretos/configuración, sin enviarla al chat.
2. Volver a desplegar y verificar autenticación.
3. Repetir los casos semánticos y evaluar conversaciones completas, respuestas informativas y ausencia de efectos transaccionales indebidos.
4. Mantener la nueva capa desactivada para conversaciones normales hasta superar estas comprobaciones.

Las pruebas automáticas previas siguen siendo evidencia de lógica e integración simulada; no sustituyen esta validación real pendiente.
