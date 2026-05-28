# Informe QA Conversacional E2E V0

Fecha: 2026-05-28  
Entorno: local / preview, sin production deploy  
Rama final integrada: `codex/smp-final-client-demo-integrated-v0`  
Base visual: `codex/smp-panel-layout-polish-v0`  
Bridge integrado: `codex/smp-whatsapp-reservation-bridge-v0`

## Resumen ejecutivo

La bateria de QA confirma que la capa conversacional V0 clasifica y responde correctamente a saludos, informacion general, FAQs, handoff humano, estado real del perro, cliente conocido/bloqueado/ambiguo y acciones criticas de reserva en modo seguro.

Actualizacion puente WhatsApp reserva: el flujo WhatsApp ya puede crear una propuesta pendiente, pedir confirmacion explicita, revalidar disponibilidad, escribir por `SheetAdapter`, crear `ReservationRecord` y proyectar la entrada en Registro de entrada. El smoke real contra Google Sheets se ejecuto con datos sinteticos QA y cleanup en la rama bridge, y la rama final integrada conserva ese puente sobre el ultimo polish visual del panel.

## Auditoria

### NLU y politica

- Entrada Twilio: `src/app/api/twilio/whatsapp/route.ts`
- Servicio conversacional: `src/lib/hotel/conversations/service.ts`
- NLU: `src/lib/hotel/conversations/nlu.ts`
- Store conversaciones: `src/lib/hotel/conversations/file-store.ts` / `postgres-store.ts`

El webhook guarda inbound, resuelve ClientDirectory, aplica bloqueos, respeta modo humano y llama a `buildConversationReplyPlan`. Para `availability_request`/`reservation_start` invoca el puente de reserva; para `reservation_confirm` solo confirma si hay propuesta pendiente vigente.

### Reservas y Sheets

- Escritura real: `src/lib/hotel/application/process-reservation.ts`
- Confirmacion/cancelacion admin: `src/lib/hotel/application/operations.ts`
- Adaptador Sheets: `src/lib/hotel/sheets/google.ts`

El puente no duplica la logica de Sheets: usa `SheetAdapter.checkAvailability` y `SheetAdapter.writeReservation`. La implementacion real de Google Sheets ya revalida disponibilidad antes de escribir; el puente ademas revalida antes de invocar la escritura.

### Registro de entrada

- Vista: `src/app/admin/registro-entrada/page.tsx`
- Proyeccion: `src/lib/hotel/application/entry-log.ts`

El registro se deriva de `ReservationRecord` en la store operativa. Las reservas confirmadas por WhatsApp se persisten como `source: "demo"` para mantener compatibilidad con el mapeo actual, que las muestra como `chatbot`.

### Panel

El panel mantiene conversaciones, filtros, modo bot/humano, respuesta manual, video mock, badges ClientDirectory y NIF/DNI oculto. Se reforzo la redaccion de identificadores tipo DNI/NIF en mensajes inbound para evitar que queden visibles si un usuario los escribe.

## Cambios de QA

- Matriz conversacional completa: `docs/CONVERSATIONAL_QA_MATRIX_V0.md`
- Tests de politica E2E conversacional: `src/lib/hotel/conversations/conversation-e2e-policy.test.ts`
- Smoke conversacional directo/HTTP: `scripts/conversation-e2e-smoke.ts`
- Script npm: `npm run smoke:conversation`
- Redaccion de DNI/NIF en mensajes y payloads de conversaciones.
- Limite servidor de 1200 caracteres para respuesta manual.
- Variante NLU de disponibilidad: "tenéis sitio/hueco/plaza".
- Puente WhatsApp reserva: `src/lib/hotel/conversations/reservation-bridge.ts`.
- Tests del puente: `src/lib/hotel/conversations/whatsapp-reservation-bridge.test.ts`.
- Smoke real opt-in: `npm run smoke:conversation:sheets-real`.

## Resultados esperados por area

| Area | Resultado | Evidencia |
|---|---|---|
| NLU informacion general | Verde | `Hola, quiero información` responde menu y no deriva a humano |
| FAQs | Verde | Qué llevar, visitas, vacunas, comida, fotos/videos |
| Estado real perro | Verde | Deriva a equipo sin inventar |
| Handoff humano | Verde | Modo humano y autorespuesta pausada |
| Cliente bloqueado | Verde | Modo humano y revision manual |
| Cliente conocido | Verde | Evento `client_directory_match` |
| Reserva desde WhatsApp | Verde | Crea propuesta, confirma con explicitud, escribe por adapter y crea ReservationRecord |
| Cancelacion | Amarillo | Deriva/pide datos; no cancela real desde WhatsApp |
| Modificacion | Amarillo | Deriva/pide datos; no existe modificacion Sheets directa |
| Sheets real | Verde | Smoke real opt-in ejecutado con datos sinteticos QA y cleanup en `codex/smp-whatsapp-reservation-bridge-v0` |
| Registro entrada | Verde | ReservationRecord confirmado desde WhatsApp se proyecta como origen chatbot |
| Panel | Verde | Conversacion visible, acciones por modo, NIF/DNI oculto |

## Ejecucion local

Comandos ejecutados:

- `npm run smoke:conversation`: OK. Casos directos: informacion, disponibilidad, confirmacion sin propuesta, estado real, cliente bloqueado, modo humano posterior.
- `npm run lint`: OK.
- `npm run test:run`: OK. 41 archivos, 197 tests passed, 1 todo preexistente.
- `npm run build`: OK. Next build correcto con un warning no bloqueante de trazado NFT en persistencia/file-store.
- `npm run smoke`: OK. Repite lint, test y build.
- `npm run smoke:http`: OK en servidor local con `HOTEL_USE_GOOGLE_SHEETS_REAL=false`, bypass local de auth y token Twilio sintetico. Valido home, demo, admin, panel conversaciones, registro entrada, `/api/demo/process` en modo mock y webhook Twilio simulado.

## Google Sheets

Touched en real: Si, solo con datos sinteticos QA y cleanup activado en la rama bridge.  
Datos sinteticos usados: `Kira QA`, telefono QA del script, fechas 2026-12-29 a 2026-12-31.  
ReservationId real de QA: generado y no impreso completo; resumen seguro `[reservation-id:_morning]`.  
Hoja real tocada: `DICIEMBRE 2026`.  
Celdas tocadas: `AD4`, `AE4`, `AF4`.  
Cleanup real: solicitado y completado; verificacion posterior en Sheets: 0 reservas sinteticas activas `Kira QA` en `DICIEMBRE 2026`.

Comando opt-in:

```powershell
$env:HOTEL_QA_ALLOW_REAL_SHEETS_WRITE="true"
$env:HOTEL_QA_CLEANUP_REAL_SHEETS="true"
npm run smoke:conversation:sheets-real
```

Sin `HOTEL_QA_ALLOW_REAL_SHEETS_WRITE=true`, el script no escribe y sale en modo skip. El script valida datos sinteticos, exige cleanup o keep explicito y no imprime `reservationId` completo.

## Registro de entrada

Entrada creada por WhatsApp en mock: Si.  
Entrada creada por WhatsApp en smoke real Sheets: Si, con datos sinteticos QA.  
Proyeccion sintetica validada en test: Si.  
Campos validados: cliente, estado cliente, telefono/identificador, mascota, entrada, salida, accion, origen, reservationId, estado Gestet.  
Estado Gestet: pendiente cuando no hay `sheetRegistration`.  
Demo cliente lista: Si en modo mock/preview; para cuadrante real, ejecutar el smoke opt-in en entorno seguro.

## Seguridad y privacidad

- No se tocaron datos reales de CLIENTES.
- No se imprimieron secretos.
- No se imprimio PII real.
- Se evita persistir DNI/NIF si el usuario lo escribe en WhatsApp.
- Los artefactos generados usan datos sinteticos.

## Pendientes reales

1. Ejecutar smoke real Sheets con datos sinteticos y cleanup cuando se decida validar contra cuadrante real.
2. Implementar cancelacion/modificacion conversacional real si se quiere abrir ese canal al bot.
3. Evaluar `source: "whatsapp"` como valor de dominio propio en vez de compatibilidad `source: "demo"`.
4. Meta directa/Twilio real, storage de video y EasyPanel quedan fuera de esta tarea.
