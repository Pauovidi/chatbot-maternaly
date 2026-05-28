# Conversaciones: polling y reset V0

## Polling del panel

El panel de `/admin/conversations` refresca `/api/conversations` cada 3000 ms. La petición usa `credentials: "same-origin"` y no se solapa: si hay una carga en curso, el siguiente tick espera o se descarta. Al volver la pestaña a visible se fuerza un refresco.

Las acciones manuales fuerzan un refresco inmediato después de completar:

- enviar respuesta manual
- tomar conversación
- devolver al bot
- marcar como leído
- solicitar vídeo mock

El texto del composer vive en estado separado y el polling no lo borra. Solo se limpia tras enviar correctamente una respuesta manual. El timeline solo baja al final si el usuario ya estaba cerca del final, para no interrumpir lectura histórica.

## Reset seguro

El reset vacía solo el `ConversationStore`:

- conversaciones
- mensajes
- eventos
- contadores derivados del inbox

No toca:

- Google Sheets
- CLIENTES
- reservas
- `ReservationRecord`
- Registro de entrada
- recordatorios

Comandos:

```powershell
npm run conversations:reset -- --dry-run
npm run conversations:reset -- --confirm RESET_CONVERSATIONS
```

Endpoint admin protegido:

```http
POST /api/conversations/reset
Content-Type: application/json

{ "confirm": "RESET_CONVERSATIONS" }
```

También admite `{ "dryRun": true }`.

El reset guarda una marca `suppressDemoSeed` en stores de archivo para evitar que local/preview regenere conversaciones demo inmediatamente después del vaciado. No se crea backup completo por defecto para evitar almacenar PII; la salida devuelve solo métricas agregadas.
