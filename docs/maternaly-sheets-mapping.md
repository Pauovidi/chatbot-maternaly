# Mapping Sheets Maternaly

Modelo normalizado: `NormalizedServiceSession` en `src/lib/maternaly/domain/types.ts`.

Incluye servicio, sede, venue, fecha, hora, cupo, plazas, precio, enlace de pago, fuente Sheet, tab, gid, fila, rango, payload original y estado de validacion.

Implementado:

- `GoogleSheetsClient`
- `SheetAuditService`
- `SheetSchemaDetector` inicial por encabezados y pistas
- redaccion de PII
- `ReservationWritePlan` dry-run

Pendiente tras auditoria real:

- adapter especifico por cada estructura detectada.
- mapeo definitivo de servicios reservables.
- deteccion fiable de links de pago.
- confirmacion de pestaña segura `TEST_BOT_WRITES`.
