# Registro de Entrada V0

Fecha: 2026-05-28

## Fuente

`/admin/registro-entrada` lee `ReservationRecord` desde la store operativa y proyecta las reservas confirmadas, canceladas, rechazadas o en revision.

El puente WhatsApp crea un `ReservationRecord` cuando una propuesta pendiente se confirma explicitamente. Para compatibilidad con el mapeo actual, estas reservas usan `source: "demo"`, que Registro de entrada muestra como `chatbot`.

La rama final candidata `codex/smp-final-client-demo-integrated-v0` integra este puente sobre el ultimo polish visual del panel. El smoke real contra Google Sheets ya se ejecuto con datos sinteticos QA y cleanup en `codex/smp-whatsapp-reservation-bridge-v0`.

## Flujo WhatsApp

1. El cliente envia una solicitud con perro y fechas completas.
2. El bot comprueba disponibilidad con `SheetAdapter.checkAvailability`.
3. Si hay disponibilidad, guarda `pendingReservationProposal` en la conversacion.
4. El bot pide confirmacion explicita.
5. Al recibir `Sí, confirma`, revalida disponibilidad.
6. Si sigue disponible, escribe con `SheetAdapter.writeReservation`.
7. Crea/actualiza `ReservationRecord`.
8. Registro de entrada muestra la reserva como:
   - origen: `chatbot`
   - accion: `confirmada`
   - estado Gestet: `procesado Gestet` si hay `sheetRegistration`; si no, `pendiente Gestet`

## Guardrails

- No se crea propuesta si faltan perro o fechas completas.
- No se confirma sin propuesta pendiente vigente.
- No se confirma si la conversacion esta en modo humano.
- No se confirma cliente bloqueado o ambiguo.
- Se revalida disponibilidad justo antes de escribir.
- Si falla Sheets, no se responde como confirmada.
- El smoke real exige `HOTEL_QA_ALLOW_REAL_SHEETS_WRITE=true`.

## Smoke

Mock/local:

```powershell
npm run smoke:conversation
```

Real Google Sheets con datos sinteticos y opt-in:

```powershell
$env:HOTEL_QA_ALLOW_REAL_SHEETS_WRITE="true"
$env:HOTEL_QA_CLEANUP_REAL_SHEETS="true"
npm run smoke:conversation:sheets-real
```

No ejecutar el smoke real contra production sin entorno controlado y cleanup decidido. El script exige datos sinteticos QA y no imprime `reservationId` completo porque contiene identificadores derivados.

Evidencia sanitizada del smoke real ya pasado:

- hoja: `DICIEMBRE 2026`
- celdas: `AD4`, `AE4`, `AF4`
- fechas: 2026-12-29 a 2026-12-31
- reservationId: generado, solo resumen seguro `[reservation-id:_morning]`
- cleanup: completado; 0 reservas sinteticas activas `Kira QA` tras la limpieza
