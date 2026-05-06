# Estado de verdad

## 1) Qué subagentes usé

- `Google Sheets Real` (`Beauvoir`)
- `Email Ingestion` (`Epicurus`)
- `Reminders` (`Dirac`)
- `Output Channels` (`Nash`)
- `Data Model Hardening` (`Mill`)
- `QA y Documentación` (`Aristotle`)

## 2) Qué hizo cada uno

- `Google Sheets Real`
  - añadió config de layout/paleta por entorno
  - preparó validación estructural de hojas mensuales
  - reforzó mock y base del adapter real
- `Email Ingestion`
  - creó la capa `src/lib/hotel/email/**`
  - dejó IMAP, fingerprint, relevancia, normalización MIME e idempotencia
- `Reminders`
  - dejó base de tipos/servicios/scheduler para reminders mock/real
  - aportó trazabilidad y tests del subsistema
- `Output Channels`
  - creó la fachada `preview/manual/real` para WhatsApp
  - aisló el transporte del negocio
- `Data Model Hardening`
  - endureció IDs y workflow canónico
  - añadió `identityTrace`, `workflowState` y `workflowTrail`
- `QA y Documentación`
  - actualizó documentación base
  - añadió smoke HTTP y checklist de operación

## 2.1) FAQ pura vs workflow vs handoff

- `FAQ pura`
  - intents: `precio`, `horario`, `requisitos`, `servicios`, `confirmacion`
  - salida: respuesta breve, comercial y sin abrir reserva
- `Workflow`
  - intent: `proceso`
  - salida: explica qué hace el sistema tras recibir el formulario y qué revisa el admin
- `Handoff`
  - intents: `reserva`, `reglas`
  - salida: deriva al formulario oficial y evita cerrar por WhatsApp
- Regla transversal:
  - si la pregunta mezcla duda y ganas de reservar, gana el handoff al formulario
  - si no hay intent claro, se responde con seguridad y se deriva al formulario antes que inventar un cierre

## 2.2) Migración desde SayCheese

- Portado:
  - la idea de una experiencia pública en portada con FAQ visible
  - la separación entre zona pública y zona interna
  - el patrón de handoff seguro cuando no se puede cerrar por el chat
  - la presencia de un panel operativo interno para humanos
- Adaptado:
  - el dominio, que pasa de producto/pedido a hotel canino/reserva
  - el copy comercial, horarios y precios
  - la fuente de verdad operativa, que ahora depende de disponibilidad y turnos
  - la navegación principal, donde la home pública se enseña primero
- Recreado:
  - el flujo de reservas por email
  - la disponibilidad por slots
  - la persistencia y escritura en Sheets
  - la salida WhatsApp preparada para handoff
  - la cola de recordatorios 48 h
  - el panel interno de seguimiento
- Ruta a enseñar:
  - primero `/`
  - si quieres un alias limpio, `/demo`
  - después `/ops` como zona interna principal
  - `/faq-demo`, `/reservas-demo` y `/admin` quedan como soporte secundario
  - la parte operativa real vive además en `/api/ops/*`

## 3) Qué tareas se ejecutaron en paralelo

- diseño del adapter real de Google Sheets
- ingestión IMAP y deduplicación
- reminders y canal de salida
- endurecimiento del dominio y workflow
- documentación y smoke

Mientras tanto, el agente principal integró:

- el workflow operativo
- las nuevas rutas API
- los scripts de worker/polling/dispatch
- la validación final de lint, tests, build y smoke HTTP

## 4) Qué integré al final

- `processReservationEmail()` manteniendo la demo estable y usando Sheets real por flag
- operaciones nuevas en `src/lib/hotel/application/operations.ts`
- bridge entre dominio actual y adapters legacy en `src/lib/hotel/application/integration-bridge.ts`
- endpoints:
  - `POST /api/ops/email/poll`
  - `POST /api/ops/reservations/:id/confirm`
  - `POST /api/ops/reservations/:id/send-reply`
  - `POST /api/ops/reminders/dispatch`
- scripts:
  - `npm run hotel:email:poll`
  - `npm run hotel:reminders:dispatch`
  - `npm run hotel:worker`
- tests nuevos de:
  - IDs robustos
  - estructura y escritura de Sheets
  - confirmación y reminder 48 h

## 5) Qué quedó realmente conectado

Conectado a nivel de código y listo para usar por flags:

- Google Sheets real con `googleapis`
- IMAP real con `imapflow`
- WhatsApp real/manual/preview por adapter
- recordatorios por webhook + runner manual/worker

Conectado y validado dentro de este entorno:

- modo demo completo
- persistencia local
- rutas Next.js
- worker/scripts
- smoke técnico completo

## 6) Qué sigue mock

- no se han probado credenciales reales de Google Sheets en este entorno
- no se ha conectado un buzón IMAP real de cliente
- no se ha conectado un proveedor real de WhatsApp
- no se ha conectado un webhook/productor real de reminders

## 7) Qué falta exactamente para producción

- cargar credenciales reales:
  - Google Sheets
  - IMAP
  - webhook/proveedor de WhatsApp
  - webhook/proveedor de reminders
- confirmar el contrato exacto de la hoja real:
  - `mirror-daily-counts` o `slot-grid`
  - filas/columnas reales
  - colores finales
- decidir cómo se confirma operación:
  - manual vía endpoint, `/ops` o `/admin`
  - o automática con regla de negocio explícita
- validar timezone `Europe/Madrid` en despliegue
- ejecutar una prueba controlada de extremo a extremo con servicios reales

## 8) Cómo validar el MVP extremo a extremo

### Validación demo

1. `npm run dev`
2. abre `/`
3. comprueba que `/demo` redirige a la misma experiencia pública
4. entra en `/ops` para enseñar el flujo operativo secundario
5. usa `/faq-demo`, `/reservas-demo` y `/admin` solo como apoyo

### Validación técnica local

1. `npm run smoke`
2. `npm run smoke:http`

### Validación operativa modo real

1. Configura IMAP y Google Sheets reales por `.env.local`.
2. Ejecuta `npm run hotel:email:poll`.
3. Revisa `/admin` y localiza la `reservationId`.
4. Lanza `POST /api/ops/reservations/:id/send-reply`.
5. Lanza `POST /api/ops/reservations/:id/confirm`.
6. Fuerza o espera un reminder y ejecuta `npm run hotel:reminders:dispatch`.
7. Comprueba:
   - reserva escrita en Sheets
   - reply preparado/enviado por el canal elegido
   - reminder en estado `enviado` o `preview/fallido` con trazabilidad

## 9) Validación final ejecutada

- `npm run lint`
- `npm run test:run` → `19 archivos / 48 tests`
- `npm run build`
- `npm run smoke`
- `npm run smoke:http`

Resultado:

- build en verde
- smoke HTTP en verde sobre `/`, `/demo`, `/ops`, `/internal`, `/faq-demo`, `/reservas-demo`, `/admin` y `POST /api/demo/process`

## 10) FAQ real integrada en el chatbot

### Qué se ha hecho

- se ha sustituido el matcher simple por una capa FAQ controlada en `src/lib/hotel/faq`
- se ha creado un `knowledge pack` en español con categorías, intents, ejemplos y sinónimos
- se ha separado la salida entre:
  - `faq`
  - `workflow`
  - `handoff`
- `/faq-demo` ahora muestra ejemplos rápidos y un panel opcional de debug en modo demo
- se han añadido tests específicos de intents y routing

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

## Panel de conversaciones V0

- Rama de trabajo: `codex/smp-conversations-panel-v0`.
- Pasada visible demo: `codex/smp-conversations-panel-v0-1-visible-demo`.
- Nueva UI protegida: `GET /admin/conversations`.
- Acceso visible desde header publico, navegacion demo y `/admin`.
- Nuevas APIs protegidas: `GET/POST /api/conversations`, detalle por id, `reply`, `mode` y `mark-read`.
- Nuevo webhook Twilio: `POST /api/twilio/whatsapp`.
- Persistencia demo aislada: `/tmp/hotel-conversations.json` via `ConversationStore`.
- Auto-seed demo en local/test/preview si la store de conversaciones esta vacia.
- La V0.1 deja el inbox no vacio en preview/local, con cinco conversaciones sinteticas y UI de sidebar + detalle tipo chat.
- La store de reservas demo no se sustituye y sigue aparcada hasta aprobacion.
- Twilio real es opcional por env; sin credenciales funciona en mock.

Workflow:

- `workflow_disponibilidad`
- `workflow_reserva`

Humano:

- `faq_peluqueria`
- `handoff_humano`

### Reglas de routing

- si el cliente quiere reservar por chat, se deriva al formulario
- si pide disponibilidad concreta con fechas, se envía al workflow
- si pregunta por peluquería o por un caso especial, se deriva a humano
- si el bot no puede sostener la respuesta con catálogo cerrado, cae a `handoff_humano`

### Qué respuestas son FAQ puras

- precios hotel y guardería
- bono guardería
- horarios
- vacunas y requisitos
- comida y vídeos
- veterinario
- contacto y ubicación
- pagos publicados

### Qué respuestas pasan al workflow

- “quiero reservar”
- “tenéis sitio del 14 al 18…”
- cualquier consulta con fechas concretas o intención operativa de reserva

### Qué respuestas derivan a humano

- peluquería
- comportamiento delicado
- medicación compleja
- casos especiales o no catalogados

### Supuesto importante

- el documento FAQ del cliente no estaba en el repo; se consolidó la base usando la web oficial y las páginas legales públicas del cliente, manteniendo respuestas conservadoras cuando faltaba detalle contractual

## 11) Rebuild público tipo SayCheese

### Qué he reutilizado realmente desde SayCheese

- patrón del widget de chat de `saycheese/src/components/chat-widget.tsx`
- quick replies visibles
- auto-scroll con control de cercanía al final
- layout conversacional con bubbles `user / assistant`
- shell público adaptado a partir de los patrones de `site-header.tsx` y `site-footer.tsx`

### Qué he adaptado

- copy, branding y CTA al contexto del hotel canino
- lógica de respuesta conectada a la capa FAQ cerrada del hotel
- CTA de reserva siempre al formulario real
- explicación de disponibilidad concreta sin enseñar internals en la pantalla pública

### Qué he recreado desde cero y por qué

- la ruta `/ops` y el alias `/internal`
- la composición pública `public-demo-home`
- la integración de la lógica FAQ en `public-chat.ts`

Motivo:

- SayCheese trae un widget reutilizable, pero no su dominio ni su backoffice sirven para reservas caninas, Google Sheets o emails operativos

### Qué se ha simplificado u ocultado respecto a la demo anterior

- `/faq-demo`, `/reservas-demo` y `/admin` dejan de ser la cara principal
- el JSON/debug desaparece de la experiencia pública
- la operativa queda detrás de `/ops`
- la home ahora enseña solo el producto público y un único CTA fuerte al chat

### Qué ruta abrir primero para enseñar la demo en 3 minutos

- abre `/`
- si quieres un alias limpio, abre `/demo` y te llevará a la misma experiencia pública por redirect
- para enseñar la maquinaria interna, entra después en `/ops`

### Validación actualizada

- `npm run lint`
- `npm run test:run` → `19 archivos / 48 tests`
- `npm run build`
- `npm run smoke`
- `npm run smoke:http`

Resultado:

- demo pública nueva compilando
- `/`, `/demo`, `/ops`, `/internal`, `/faq-demo`, `/reservas-demo` y `/admin` accesibles
- smoke HTTP validando también la nueva portada y la zona ops

## 12) Cierre visual y Vercel

### Estado del pulido visual

- El hero público ya usa el titular exacto `Demo del chat web para el hotel canino`.
- El subtítulo comercial ahora explica el valor sin copy meta ni interno.
- El único CTA fuerte del hero es `Probar chatbot`, con scroll directo al widget.
- El CTA fuerte hacia `ops` ha desaparecido del hero.
- `ops` queda relegado a un enlace discreto en el footer.
- El botón `Reiniciar chat` sigue visible y funciona correctamente.
- El saludo inicial del widget ya se presenta como demo del chat web del hotel canino.
- Las quick replies visibles por defecto quedan limitadas a `Quiero reservar una plaza`, `¿Cuál es vuestro horario?`, `¿Cuánto cuesta?` y `¿Qué vacunas pedís?`.

### Qué queda fuera del foco principal

- `ops` sigue como acceso secundario.
- `faq-demo`, `reservas-demo` y `admin` siguen como soporte interno o legado.
- El foco de la demo pública sigue siendo `/`.

### Readiness para Vercel preview

- A nivel técnico, el proyecto está preparado para desplegarse en Vercel como app Next.js estándar.
- `next.config.ts` se mantiene simple y solo contiene el alias `/demo -> /`, que es compatible con preview.
- La metadata pública se ha ajustado para que la preview sea más limpia.
- En esta sesión, `build`, `smoke` y `smoke:http` han quedado en verde, así que el proyecto queda listo para `Vercel preview` sin cambios funcionales adicionales.

## 13) Bootstrap real del Excel del cliente

### Cambio de contrato aplicado

- la fuente de verdad para Google Sheets pasa a ser el workbook real `Copia de FPO1-04 RESERVAS BUENO.xlsx`
- se añade `npm run hotel:sheet:init`
- el bootstrap ya no reconstruye un layout teórico: importa el `.xlsx` real por conversión de Drive
- el adapter de Sheets se alinea con hojas mensuales reales tipo `AGOSTO 2026`, cabecera en fila `3`, datos en `4:39` y leyenda real del Excel

### Resultado operativo

- el spreadsheet se crea automáticamente
- ahora se crea con OAuth de usuario humano en el Drive del usuario
- después se comparte con la service account para runtime
- el flujo OAuth local usa ya el intercambio oficial `authorization_code -> tokens` con `google.auth.OAuth2(...).getToken(...)`
- el callback local queda instrumentado con logs saneados para diagnosticar `invalid_client` sin exponer secretos
- el script devuelve `spreadsheetId` y `spreadsheetUrl`
- la variable a guardar después es `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`
- la documentación específica queda en `docs/hotel-sheet-bootstrap.md`

### Validación ejecutada en este cambio

- `npm run lint`
- `npm run test:run` → `21 archivos / 51 tests`
- `npm run build`

### Ruido preexistente detectado

- `npx tsc --noEmit` sigue fallando por dos errores ya existentes en `src/lib/hotel/faq/routing.test.ts`, fuera del alcance del bootstrap y del adapter de Sheets
