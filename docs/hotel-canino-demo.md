# Hotel canino demo / MVP

Proyecto Next.js App Router para `Somos Muy Perros` con dos capas:

1. `FAQ / chatbot comercial` que responde preguntas frecuentes y deriva siempre al formulario oficial.
2. `Motor de reservas` que procesa solicitudes, extrae datos, comprueba hueco, calcula precio, prepara la respuesta al cliente y deja lista la operación.

## Estado actual

La app mantiene el flujo demo enseñable y además incorpora un `modo real` detrás de flags:

- Nueva experiencia pública tipo producto real en `/` y `/demo`, con chat protagonista y operativa interna relegada a `/ops`.
- FAQ real estructurada con `knowledge pack`, intents explícitos, routing controlado y fallback seguro.
- Google Sheets real con validación estructural y escritura preparada/operativa.
- Ingesta real de email por IMAP con polling manual o worker interno.
- Cola de recordatorios 48 h con dispatch por webhook.
- Canal de salida WhatsApp en `preview`, `manual` o `real`.
- Modelo de datos endurecido con `workflowState`, `workflowTrail` e `identityTrace`.

## Ruta a enseñar

- Primera ruta para demo cliente: `/`
- Alias público equivalente: `/demo` redirigido explícitamente a `/`
- Zona operativa secundaria: `/ops`
- Alias interno adicional: `/internal`
- Rutas legacy secundarias: `/faq-demo`, `/reservas-demo`, `/admin`
- Endpoints internos de operación: `/api/ops/*`

## Portado real desde SayCheese

Portado/adaptado de forma real:

- el patrón del widget conversacional de `saycheese/src/components/chat-widget.tsx`
- la mecánica de `quick replies`
- el `auto-scroll` con detección de cercanía al final
- la presentación de mensajes `user / assistant`
- el header del chat con reinicio
- el patrón de shell público inspirado en `saycheese/src/components/site-header.tsx` y `saycheese/src/components/site-footer.tsx`

Archivos del hotel donde se integró:

- `src/components/public-chat-widget.tsx`
- `src/components/public-site-header.tsx`
- `src/components/public-site-footer.tsx`
- `src/components/public-demo-home.tsx`

## Qué se adaptó

- Todo el copy, branding y CTA al dominio del hotel canino.
- El widget ya no consulta lógica de pedidos: consume la capa FAQ cerrada del hotel.
- La reserva por chat no se cierra en el widget: redirige al formulario oficial.
- La salida pública oculta cualquier JSON, debug o panel interno.

## Qué se recreó desde cero

- La lógica de reservas por email, disponibilidad por slots y pricing del hotel.
- La integración con Google Sheets, email real, reminders y WhatsApp.
- La ruta `/ops`, que compone parser, disponibilidad y panel interno con la lógica propia del hotel.
- La adaptación pública para que la disponibilidad concreta se explique sin enseñar internals en la pantalla principal.

## Caso real interno

- La demo interna usa como referencia el contenido real reenviado ya preservado en `REAL_SAMPLE_EMAIL`.
- El caso con `Fecha entrada: 2026-08-17 13:00` y `Fecha salida: 2026-08-28 13:00` queda marcado para revisión manual porque `13:00` no cae en un slot válido de mañana o tarde.

## Modos de operación

### Modo demo

- `/reservas-demo` sigue funcionando con “paste email”.
- Persistencia local en `.demo-state/`.
- Sheets mock.
- WhatsApp en preview/manual.
- Recordatorios en cola local.

### Modo real

- `POST /api/ops/email/poll` o `npm run hotel:email:poll` leen el buzón real.
- `POST /api/ops/reservations/:id/confirm` confirma y, si está activo, escribe en Google Sheets.
- `POST /api/ops/reservations/:id/send-reply` usa el canal real o manual de WhatsApp.
- `POST /api/ops/reminders/dispatch` o `npm run hotel:reminders:dispatch` despachan recordatorios vencidos.
- `npm run hotel:worker` programa polling y dispatch con cron interno.

## Mapa de intents y routing

| Intent | Ejemplos de usuario | Capa | Regla de salida |
| --- | --- | --- | --- |
| `precio` | precios, coste, tarifa, cuánto cuesta | FAQ pura | Responde con tarifa base y, si aplica, suplemento de medio día |
| `horario` | horarios, recepción, mañana, tarde | FAQ pura | Responde con franja horaria y no abre workflow |
| `requisitos` | vacunas, microchip, cartilla, salud | FAQ pura | Responde con requisitos y cuidados |
| `servicios` | comida incluida, vídeos, cuidados | FAQ pura | Responde sobre servicios incluidos |
| `confirmacion` | confirmáis por WhatsApp | FAQ pura | Explica que la confirmación llega por WhatsApp después del formulario |
| `proceso` | qué pasa tras el formulario | Workflow ligero | Explica revisión de email, cálculo de hueco y respuesta al cliente |
| `reglas` | fuera de horario, recogida, entregas | Handoff guiado | Explica la restricción operativa y vuelve al formulario si hace falta reservar |
| `reserva` | reservar, formulario, WhatsApp, cerrar reserva | Handoff obligatorio | Deriva siempre al formulario oficial |

Regla de routing:

- Si el intent es `reserva`, la respuesta debe incluir CTA al formulario.
- Si el intent es `proceso`, el bot ya está describiendo el workflow, no una FAQ pura.
- Si el texto no encaja con un intent claro, el sistema debe priorizar la derivación al formulario y nunca inventar un cierre por WhatsApp.
- Si la pregunta mezcla FAQ y reserva, la respuesta debe resolver la duda y terminar en handoff.

## Arquitectura

- `src/lib/hotel/faq`: knowledge pack FAQ, intents, clasificación determinista y router.
- `src/lib/hotel/content`: compatibilidad de FAQ legacy, copy comercial y mensajes.
- `src/lib/hotel/parser`: parsing híbrido y muestras reales/demo.
- `src/lib/hotel/date-normalization`: normalización de fechas, horas y turnos.
- `src/lib/hotel/availability`: motor por slots `morning/afternoon`.
- `src/lib/hotel/pricing`: pricing parametrizable 1-4 perros y medio día.
- `src/lib/hotel/domain`: contratos, estados, IDs robustos y trazabilidad.
- `src/lib/hotel/email`: normalización MIME, filtrado, fingerprint, IMAP e idempotencia.
- `src/lib/hotel/sheets`: adapter mock y adapter real con validación de hoja mensual.
- `src/lib/hotel/output`: salida WhatsApp desacoplada del negocio.
- `src/lib/hotel/reminders`: base de reminders mock/real y tipos de scheduling.
- `src/lib/hotel/application`: workflow, persistencia local, operaciones y panel admin.

## FAQ controlada

La capa FAQ ya no responde con matching simple por keywords. Ahora usa:

- `knowledge pack` en español con categorías, intents, ejemplos y sinónimos.
- `intent classification` determinista por reglas y scoring controlado.
- `routing` explícito entre `faq`, `workflow` y `handoff`.
- `fallback` seguro a humano cuando la consulta no encaja en el catálogo.

Supuesto documentado:

- El documento FAQ del cliente no estaba dentro del repo. La base se consolidó a partir de la web oficial y de las páginas legales públicas de Somos Muy Perros, sin inventar políticas no confirmadas.

### Mapa de intents

FAQ puras:

- `faq_reserva_formulario`
- `faq_confirmacion_whatsapp`
- `faq_horario`
- `faq_fuera_de_horario`
- `faq_precio_hotel`
- `faq_precio_guarderia`
- `faq_bono_guarderia`
- `faq_vacunas`
- `faq_medicacion`
- `faq_comportamiento`
- `faq_comida`
- `faq_fotos`
- `faq_veterinario`
- `faq_pago_senal`
- `faq_cancelacion`
- `faq_ubicacion`
- `faq_contacto`

Workflow:

- `workflow_disponibilidad`
- `workflow_reserva`

Derivación humana:

- `faq_peluqueria`
- `handoff_humano`

### Reglas de routing

- Reserva por chat o preguntas de “cómo reservo”: respuesta controlada y CTA al formulario.
- Disponibilidad concreta con fechas o intención operativa de reserva: salida `workflow`.
- Peluquería, casos especiales o explicaciones complejas del perro: salida `handoff`.
- Cuando una política no está confirmada públicamente, la respuesta lo dice y deriva al equipo.

### Qué responde cada salida

FAQ puras:

- horarios
- tarifas publicadas
- vacunas y requisitos
- comida incluida
- vídeos/fotos
- ubicación y contacto
- pago publicado

Workflow:

- hueco para fechas concretas
- intención de reservar ya

Handoff:

- peluquería
- comportamiento o medicación complejos
- casos especiales fuera del catálogo

### /faq-demo

La pantalla `/faq-demo` ahora permite:

- lanzar ejemplos rápidos por intent
- ver, solo en modo demo, `intent`, `categoría` y `salida`
- enseñar que el bot no improvisa fuera del catálogo permitido

## Contrato de Google Sheets

El adapter real soporta dos modos:

- `mirror-daily-counts`
  - una columna por día
  - la ocupación se replica a `morning` y `afternoon`
- `slot-grid`
  - dos columnas por día
  - la primera representa `morning`
  - la segunda representa `afternoon`
  - permite reutilización real del mismo día por turnos

Configurable por entorno:

- `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`
- `HOTEL_GOOGLE_SHEETS_ACCESS_TOKEN`
- `HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`
- `HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`
- `HOTEL_GOOGLE_SHEETS_PRIVATE_KEY`
- `HOTEL_GOOGLE_SHEETS_SHEET_NAMING`
- `HOTEL_GOOGLE_SHEETS_TITLE_ROW`
- `HOTEL_GOOGLE_SHEETS_DAY_HEADER_ROW`
- `HOTEL_GOOGLE_SHEETS_FIRST_DATA_ROW`
- `HOTEL_GOOGLE_SHEETS_LAST_DATA_ROW`
- `HOTEL_GOOGLE_SHEETS_OVERFLOW_START_ROW`
- `HOTEL_GOOGLE_SHEETS_OVERFLOW_END_ROW`
- `HOTEL_GOOGLE_SHEETS_SUMMARY_START_ROW`
- `HOTEL_GOOGLE_SHEETS_SUMMARY_END_ROW`
- `HOTEL_GOOGLE_SHEETS_LABEL_COLUMN`
- `HOTEL_GOOGLE_SHEETS_FIRST_DAY_COLUMN`
- `HOTEL_GOOGLE_SHEETS_LAST_DAY_COLUMN`
- `HOTEL_GOOGLE_SHEETS_DAY_COUNT`
- `HOTEL_GOOGLE_SHEETS_OCCUPANCY_MODE`
- `HOTEL_GOOGLE_SHEETS_COLOR_*`

Si la hoja no coincide, el adapter falla antes de escribir y devuelve incidencias estructurales.

## Ingesta real de email

Variables:

- `HOTEL_USE_MOCK_EMAIL_INPUT`
- `HOTEL_EMAIL_IMAP_HOST`
- `HOTEL_EMAIL_IMAP_PORT`
- `HOTEL_EMAIL_IMAP_SECURE`
- `HOTEL_EMAIL_IMAP_USER`
- `HOTEL_EMAIL_IMAP_PASSWORD`
- `HOTEL_EMAIL_IMAP_MAILBOX`
- `HOTEL_EMAIL_MARK_SEEN`
- `HOTEL_EMAIL_POLL_LIMIT`
- `HOTEL_EMAIL_STATE_STORE`

Qué hace:

- lee mensajes nuevos por UID
- normaliza MIME/plain/html
- filtra solo candidatos a reserva
- calcula fingerprint e idempotencia
- marca `\Seen` solo en correos relevantes cuando está activado
- deja trazabilidad en `.demo-state/hotel-email-ingestion-state.json`

## Salida y recordatorios

WhatsApp:

- `HOTEL_WHATSAPP_OUTPUT_MODE=preview|manual|real`
- `HOTEL_USE_MOCK_WHATSAPP`
- `HOTEL_WHATSAPP_WEBHOOK_URL`
- `HOTEL_WHATSAPP_ALLOW_MANUAL_FALLBACK`
- `HOTEL_WHATSAPP_TRACE_PREFIX`

Recordatorios:

- `HOTEL_USE_REMINDERS_REAL`
- `HOTEL_REMINDERS_WEBHOOK_URL`
- `HOTEL_REMINDER_WEBHOOK_URL`
- `HOTEL_REMINDER_LEAD_HOURS`
- `HOTEL_REMINDER_DISPATCH_CRON`
- `HOTEL_INTERNAL_WORKER_ENABLED`

## Endpoints y scripts

Endpoints:

- `POST /api/demo/process`
- `POST /api/ops/email/poll`
- `POST /api/ops/reservations/:reservationId/confirm`
- `POST /api/ops/reservations/:reservationId/send-reply`
- `POST /api/ops/reminders/dispatch`

Scripts:

- `npm run hotel:email:poll`
- `npm run hotel:reminders:dispatch`
- `npm run hotel:worker`
- `npm run smoke`
- `npm run smoke:http`

## Cómo probar local

```bash
npm install
npm run dev
```

Demo visual:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/demo`
- `http://127.0.0.1:3000/ops`
- `http://127.0.0.1:3000/internal`
- `http://127.0.0.1:3000/faq-demo`
- `http://127.0.0.1:3000/reservas-demo`
- `http://127.0.0.1:3000/admin`

Validación técnica:

```bash
npm run smoke
npm run hotel:email:poll
npm run hotel:reminders:dispatch
```

## Validación ejecutada en este repo

Ejecutado y en verde:

- `npm run lint`
- `npm run test:run` → `19 archivos / 48 tests`
- `npm run build`
- `npm run smoke`
- `npm run smoke:http` contra `next start` en `http://127.0.0.1:3001`

Smoke HTTP confirmado:

- `GET /`
- `GET /demo`
- `GET /ops`
- `GET /internal`
- `GET /faq-demo`
- `GET /reservas-demo`
- `GET /admin`
- `POST /api/demo/process` → `status=disponible`, `availability=true`, `pricing.total=120`

## Pulido final comercial

- Hero actualizado con el titular exacto `Demo del chat web para el hotel canino`.
- Subtítulo público simplificado: `Chatbot conectado a FAQs y flujo de reserva: responde dudas, deriva al formulario y deja preparada la operativa interna.`
- CTA principal del hero: `Probar chatbot`, con scroll directo al widget y contraste reforzado.
- Se ha eliminado el CTA fuerte a `ops` del hero.
- `ops` queda visible solo como acceso discreto en el footer.
- El mensaje inicial del chat ahora se presenta como demo comercial del chat web del hotel canino.
- Las quick replies visibles por defecto quedan limitadas a `Quiero reservar una plaza`, `¿Cuál es vuestro horario?`, `¿Cuánto cuesta?` y `¿Qué vacunas pedís?`.
- El botón `Reiniciar chat` sigue visible y funciona correctamente.
- Metadata pública actualizada para una preview más limpia en despliegues de Vercel.
- Ruta a enseñar: `/`
- Alias público equivalente: `/demo`
- El proyecto queda listo para `Vercel preview` con la configuración actual de Next.js y el redirect `/demo -> /`.

## Riesgos abiertos

- No se han usado credenciales reales en este entorno, así que los adapters reales están implementados pero no verificados contra servicios externos concretos.
- El libro real de Google Sheets debe confirmar si opera en `mirror-daily-counts` o en `slot-grid`.
- El reminder real depende de un webhook/provider todavía no validado con negocio.
- La timezone del entorno real debe mantenerse en `Europe/Madrid` para que el cálculo de 48 h sea exacto.
