# Evaluación real bloqueada por autenticación — 2026-09-08

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
