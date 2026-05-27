# Informe QA Conversacional E2E V0

Fecha: 2026-05-27  
Entorno: local / preview, sin production deploy  
Rama: `codex/smp-conversation-e2e-qa-v0`  
Base: `codex/smp-panel-layout-polish-v0`

## Resumen ejecutivo

La bateria de QA confirma que la capa conversacional V0 clasifica y responde correctamente a saludos, informacion general, FAQs, handoff humano, estado real del perro, cliente conocido/bloqueado/ambiguo y acciones criticas de reserva en modo seguro.

El flujo WhatsApp/Twilio no escribe hoy reservas en Google Sheets ni alimenta automaticamente el Registro de entrada. La escritura real existe en flujos operativos de email/admin, pero no en el bot de conversaciones. Por seguridad, no se ejecuto escritura real en Sheets desde una ruta alternativa, porque no validaria el camino conversacional y podria tocar el cuadrante real.

## Auditoria

### NLU y politica

- Entrada Twilio: `src/app/api/twilio/whatsapp/route.ts`
- Servicio conversacional: `src/lib/hotel/conversations/service.ts`
- NLU: `src/lib/hotel/conversations/nlu.ts`
- Store conversaciones: `src/lib/hotel/conversations/file-store.ts` / `postgres-store.ts`

El webhook guarda inbound, resuelve ClientDirectory, aplica bloqueos, respeta modo humano y llama a `buildConversationReplyPlan`. Las acciones de confirmacion, cancelacion y modificacion derivan a humano o piden datos; no ejecutan cambios destructivos.

### Reservas y Sheets

- Escritura real: `src/lib/hotel/application/process-reservation.ts`
- Confirmacion/cancelacion admin: `src/lib/hotel/application/operations.ts`
- Adaptador Sheets: `src/lib/hotel/sheets/google.ts`

No hay llamada desde `handleInboundWhatsApp` a `processReservationEmail`, `confirmReservation`, `writeReservation` ni `cancelReservation`. Por tanto, WhatsApp no escribe en Sheets en esta version.

### Registro de entrada

- Vista: `src/app/admin/registro-entrada/page.tsx`
- Proyeccion: `src/lib/hotel/application/entry-log.ts`

El registro se deriva de `ReservationRecord` en la store operativa. Las reservas con `source: "demo"` se muestran como `chatbot`, pero no existe todavia un puente productivo WhatsApp -> `ReservationRecord`.

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

## Resultados esperados por area

| Area | Resultado | Evidencia |
|---|---|---|
| NLU informacion general | Verde | `Hola, quiero información` responde menu y no deriva a humano |
| FAQs | Verde | Qué llevar, visitas, vacunas, comida, fotos/videos |
| Estado real perro | Verde | Deriva a equipo sin inventar |
| Handoff humano | Verde | Modo humano y autorespuesta pausada |
| Cliente bloqueado | Verde | Modo humano y revision manual |
| Cliente conocido | Verde | Evento `client_directory_match` |
| Reserva desde WhatsApp | Amarillo | Detecta intención y no confirma sin propuesta; no escribe Sheets |
| Cancelacion | Amarillo | Deriva/pide datos; no cancela real desde WhatsApp |
| Modificacion | Amarillo | Deriva/pide datos; no existe modificacion Sheets directa |
| Sheets real | Amarillo | No ejecutado; no hay puente conversacional seguro |
| Registro entrada | Amarillo | Vista funciona; no se alimenta desde WhatsApp automaticamente |
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

Touched: No.  
Datos sinteticos previstos si se habilita el flujo real: `SMP QA Conversacional`, `Kira QA`, `qa-conversacional@example.test`, fechas diciembre 2026.  
ReservationId real de QA: no generado por Sheets en esta pasada.  
Celdas tocadas: ninguna.  
Cleanup: no requerido.

Motivo: ejecutar `/api/demo/process` o rutas admin validaria el flujo email/admin, no el flujo WhatsApp. Además puede escribir en el cuadrante real si las flags de Sheets estan activas.

## Registro de entrada

Entrada creada por WhatsApp: No.  
Proyeccion sintetica validada en test: Si.  
Campos validados: cliente, estado cliente, telefono/identificador, mascota, entrada, salida, accion, origen, reservationId, estado Gestet.  
Estado Gestet: pendiente cuando no hay `sheetRegistration`.  
Demo cliente lista: parcialmente. La vista existe y puede mostrar reservas derivadas de la store operativa; falta conectar reservas confirmadas por chatbot real.

## Seguridad y privacidad

- No se tocaron datos reales de CLIENTES.
- No se imprimieron secretos.
- No se imprimio PII real.
- Se evita persistir DNI/NIF si el usuario lo escribe en WhatsApp.
- Los artefactos generados usan datos sinteticos.

## Pendientes reales

1. Implementar puente conversacional seguro WhatsApp -> reserva propuesta -> confirmacion explicita -> Sheets -> Registro de entrada.
2. Definir si la confirmacion final del bot puede escribir en Sheets o si siempre debe quedar en revision humana.
3. Implementar modificacion real de reserva si se necesita; hoy solo cancelacion/escritura.
4. Ejecutar smoke real Sheets con datos sinteticos una vez exista el puente.
5. Meta directa/Twilio real, storage de video y EasyPanel quedan fuera de esta tarea.
