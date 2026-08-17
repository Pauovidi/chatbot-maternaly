# Recordatorios de Maternaly

Este módulo implementa el recordatorio de la Charla Informativa 48 horas antes
de la sesión sin reutilizar el dominio de recordatorios del antiguo Hotel.

## Contrato

- `scheduleMaternalyCharlaReminder` recibe una inscripción y una fecha/hora
  absoluta de sesión. Si la inscripción llega con menos de 48 horas de margen,
  el recordatorio queda vencido para envío inmediato.
- La clave de idempotencia se deriva de inscripción, sesión y comienzo. El
  repositorio debe insertar o devolver el existente y reclamar vencidos de
  forma atómica.
- Reprogramar una inscripción a otra sesión cancela cualquier recordatorio
  pendiente anterior.
- Si una inscripción cancelada, fallida o bloqueada se confirma de nuevo para
  la misma sesión, su misma clave idempotente se reactiva como `scheduled` y se
  limpian intentos y estados terminales; un recordatorio `sent` no se reactiva.
- `dispatchDueMaternalyReminders` usa leases para evitar que dos workers envíen
  el mismo trabajo, reintenta fallos transitorios y no vuelve a reclamar un
  recordatorio enviado o cancelado.
- PostgreSQL reclama lotes con `FOR UPDATE SKIP LOCKED`; las cancelaciones por
  inscripción solo afectan estados pendientes y son idempotentes. Si una
  cancelación coincide con un trabajo `processing`, se registra
  `cancel_requested_at` sin invalidar su lease: el worker revalida justo antes
  del envío y lo mueve atómicamente a `sending`. A partir de ese fence la
  cancelación devuelve cero, porque ya no puede prometer que frenó el envío.
  Cada resultado se aísla para que un fallo no aborte el lote; una lease
  `sending` expirada se bloquea para conciliación y nunca se reenvía a ciegas.
- Twilio se invoca con `ContentSid` y `ContentVariables`; nunca se manda texto
  libre fuera de las plantillas aprobadas. La petición se aborta por timeout
  antes de que expire la lease mínima del worker.
- Una sesión que ya ha comenzado se cierra como `blocked/session_elapsed` antes
  del fence y nunca llega al transporte.
- Timeout, error de red o respuesta 5xx después de iniciar el POST se consideran
  entrega ambigua y se bloquean para conciliación. Solo una respuesta inequívoca
  como `429` conserva el reintento automático.
- Una charla online no se envía sin enlace, ID y clave de Zoom. Una presencial
  no se envía sin dirección.

## Integración productiva disponible

Las migraciones `006_maternaly_reminders.sql`,
`007_maternaly_reminder_cancel_race.sql` y
`008_maternaly_reminder_sending_fence.sql`,
`PostgresMaternalyReminderRepository`,
`TwilioContentMaternalyReminderTransport` y el endpoint autenticado
`POST /api/maternaly/ops/reminders/dispatch` cubren persistencia, reclamación
concurrente y envío mediante plantillas aprobadas. Si falta una variable, el
endpoint falla cerrado antes de enviar.

El flujo de WhatsApp ya programa el recordatorio únicamente después de una
escritura `live` confirmada en `Inscripciones`, y cancela los recordatorios
pendientes únicamente después de cancelar esa misma fila. Los campos opcionales
de `Sesiones` son `enlace_zoom`, `id_reunion` y `clave_acceso`; si el ID forma
parte del enlace `/j/<id>`, también puede derivarse de forma segura.

## Activación externa pendiente

Para activar el circuito completo todavía hacen falta:

1. aplicar las migraciones `006`, `007` y `008` en PostgreSQL;
2. crear y aprobar en Twilio las dos plantillas y configurar sus `ContentSid`;
3. configurar en EasyPanel una tarea recurrente que invoque el endpoint;
4. suministrar enlace, ID y clave de Zoom en cada sesión online;
5. conciliar el callback de estado de Twilio. La base evita envíos concurrentes
   y reenvíos normales, pero un corte exacto después de que Twilio acepte el
   mensaje y antes de guardar su SID requiere esa conciliación para garantía
   extremo a extremo.

`InMemoryMaternalyReminderRepository` es únicamente una implementación de
referencia para pruebas y desarrollo; no debe usarse como persistencia de
producción.
