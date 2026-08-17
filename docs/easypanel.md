# Guia de despliegue seguro en EasyPanel

Maternaly debe desplegarse en EasyPanel con Docker. No desplegar este repo en Vercel, no reutilizar el proyecto vivo de Somos Perros y no tocar `hotel-canino-demo`.

## 1. App

- Nombre sugerido: `maternaly-chatbot`.
- Tipo: App desde repositorio GitHub con `Dockerfile`.
- Repo: `https://github.com/Pauovidi/chatbot-maternaly`.
- Rama: `codex/maternaly-bootstrap-ycloud-sheets-llm-v0`.
- Puerto interno: `3000`.
- Healthcheck: `GET /api/health`.
- Runtime: Next standalone (`output: "standalone"`) iniciado con `node server.js`.

El `Dockerfile` copia tambien `db/migrations` y `scripts/db-migrate.mjs` para poder ejecutar migraciones dentro del contenedor si EasyPanel lo permite.

## 2. Postgres

- Servicio sugerido: `maternaly-postgres`.
- Conectar `DATABASE_URL` a la app como secreto.
- Activar backups antes de trafico real.
- No usar almacenamiento efimero para estado de produccion.

Produccion requiere Postgres. El fallback JSON/file store queda solo para desarrollo local y esta bloqueado en produccion salvo opt-in inseguro explicito.

## 3. Variables iniciales no secretas

Configurar una a una:

```text
APP_NAME=Maternaly
APP_ENV=production
NODE_ENV=production
WHATSAPP_PROVIDER=mock
LLM_PROVIDER=mock
GOOGLE_SHEETS_ACCESS_MODE=read_only
BOT_SHEETS_LIVE_WRITE_ENABLED=false
MATERNALY_SHEET_IDS=163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI,1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do
APP_BASE_URL=https://<dominio-maternaly>
PANEL_ADMIN_USERNAME=<usuario-admin>
PORT=3000
NEXT_TELEMETRY_DISABLED=1
```

Primer despliegue: mantener `WHATSAPP_PROVIDER=mock`, `LLM_PROVIDER=mock`, Sheets en `read_only` y `BOT_SHEETS_LIVE_WRITE_ENABLED=false`.

## 4. Variables secretas pendientes

Configurar solo desde EasyPanel y sin importaciones masivas:

```text
DATABASE_URL
PANEL_ADMIN_PASSWORD
YCLOUD_API_KEY
YCLOUD_WEBHOOK_SECRET
OPENAI_API_KEY
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
GOOGLE_APPLICATION_CREDENTIALS
```

No imprimir ni copiar valores en logs, tickets o commits.

## 5. Migraciones

Las migraciones son idempotentes, no hacen reset y no borran datos. Ejecutar despues de enlazar `DATABASE_URL`:

```bash
node scripts/db-migrate.mjs
```

Si se ejecuta desde el checkout completo tambien sirve:

```bash
npm run db:migrate
```

En EasyPanel, abrir la terminal/shell de la app ya desplegada y ejecutar:

```bash
node scripts/db-migrate.mjs
```

Despues de migrar, `GET /api/health` debe mostrar `database.migrations.ready=true` y `panel.ready=true`.

Migraciones actuales:

- `001_init.sql`
- `002_conversations.sql`
- `003_operational_state.sql`
- `004_maternaly_operational_models.sql`
- `005_maternaly_contacts_handoffs.sql`
- `006_maternaly_reminders.sql`
- `007_maternaly_reminder_cancel_race.sql`
- `008_maternaly_reminder_sending_fence.sql`

Modelos cubiertos:

- `maternaly_contacts`
- `hotel_conversations` y vista `maternaly_conversations`
- `hotel_conversation_messages` y vista `maternaly_messages`
- `maternaly_manual_handoffs`
- `maternaly_service_sessions_cache`
- `maternaly_reservations`
- `maternaly_reservation_write_plans`
- `maternaly_payments`
- `maternaly_invoice_events`
- `maternaly_sheet_audit_logs`
- `maternaly_llm_interpretation_events`
- `maternaly_reminders`

## 5.1 Recordatorios de Charla a 48 horas

Mantenerlos desactivados hasta tener aplicadas las migraciones `006`, `007` y `008` y dos
plantillas de WhatsApp aprobadas por Twilio (una online y otra presencial):

```text
MATERNALY_REMINDERS_ENABLED=true
MATERNALY_REMINDER_DISPATCH_BATCH_SIZE=50
MATERNALY_REMINDER_TWILIO_CONTENT_SID_ONLINE=HX...
MATERNALY_REMINDER_TWILIO_CONTENT_SID_PRESENCIAL=HX...
MATERNALY_ADMIN_TASK_TOKEN=<secreto-largo>
```

La comprobacion de disponibilidad antes de cada envio usa como fuente de verdad
el Sheet normalizado de Charla. Por eso `reminders.ready=true` exige tambien
`MATERNALY_NORMALIZED_SHEETS_ENABLED=true`, que
`MATERNALY_NORMALIZED_SERVICE_IDS` incluya `charla_embarazo_1_20`,
`MATERNALY_CHARLA_EMBARAZO_SHEET_ID` y unas credenciales de Google Sheets
configuradas. El health solo muestra los nombres de los requisitos ausentes;
nunca sus valores.

La tarea recurrente de EasyPanel debe hacer `POST` cada pocos minutos a:

```text
https://<dominio-maternaly>/api/maternaly/ops/reminders/dispatch
```

enviando `Authorization: Bearer <MATERNALY_ADMIN_TASK_TOKEN>` (o la cabecera
`x-maternaly-admin-task-token`). El endpoint se bloquea con `503` y enumera la
configuracion ausente antes de abrir Postgres o Twilio. No activar el cron hasta
que `GET /api/health` muestre `reminders.ready=true`.

En las filas online de la pestaña `Sesiones`, completar `enlace_zoom`,
`id_reunion` y `clave_acceso`. `id_reunion` puede omitirse si el enlace contiene
el identificador en la forma `/j/<id>`; nunca se inventan credenciales ausentes.

## 6. Checklist post-deploy

Validar antes de exponer trafico real:

- `GET /api/health` responde `ok: true`.
- Health muestra `app=Maternaly`.
- Health muestra `runtimeTarget=easypanel-container`.
- Health muestra `database.configured=true`.
- Health muestra `database.reachable=true`.
- Health muestra `database.migrations.ready=true`.
- Health muestra `panel.ready=true`.
- Health muestra `whatsapp.provider=mock`.
- Health muestra `googleSheets.accessMode=read_only`.
- Health muestra `googleSheets.writeEnabled=false`.
- Health muestra `llm.provider=mock`.
- `/admin/conversations` exige Basic Auth y carga tras autenticar.
- `/ops` ya no es una pantalla operativa: redirige a `/admin/conversations`.
- `/api/webhooks/ycloud` existe.
- Logs sin secretos ni PII.
- No se ha enviado WhatsApp real.
- No se ha escrito en Google Sheets.
- No se han confirmado pagos ni facturas reales.

Smoke HTTP seguro contra la URL publica:

```bash
SMOKE_BASE_URL=https://<dominio-maternaly> \
SMOKE_BASIC_AUTH=<base64_usuario_dos_puntos_password> \
SMOKE_REQUIRE_PRODUCTION_SAFE=true \
node scripts/smoke-http.mjs
```

## 7. Debug rapido del panel

Si `/admin/conversations` da error o sale vacio en EasyPanel:

1. Revisar `/api/health`.
2. Si `database.reachable=false`, corregir `DATABASE_URL` o el servicio Postgres.
3. Si `database.migrations.ready=false`, ejecutar `node scripts/db-migrate.mjs` dentro del contenedor.
4. Revisar logs de EasyPanel para el servicio de la app, buscando errores de `hotel_conversations`, `hotel_conversation_messages` o `hotel_schema_migrations`.
5. Mantener `WHATSAPP_PROVIDER=mock`, `LLM_PROVIDER=mock`, `GOOGLE_SHEETS_ACCESS_MODE=read_only` y `BOT_SHEETS_LIVE_WRITE_ENABLED=false` hasta que health y smoke queden verdes.

El panel esta preparado para cargar vacio si la store falla, pero health debe quedar verde antes de exponer trafico real.

## 8. Activacion posterior de YCloud

Solo despues del deploy mock saludable:

1. Configurar `YCLOUD_API_KEY` y `YCLOUD_WEBHOOK_SECRET` en EasyPanel.
2. Cambiar `WHATSAPP_PROVIDER=ycloud`.
3. Configurar webhook publico:

```text
https://<dominio-maternaly>/api/webhooks/ycloud
```

4. Probar un inbound controlado desde un telefono de prueba.
5. Validar firma exacta de YCloud.
6. Validar idempotencia con el mismo `message.id`.
7. Mantener `BOT_SHEETS_LIVE_WRITE_ENABLED=false`.

No activar envios reales masivos en esta fase.

## 9. Activacion posterior de Google Sheets Editor

Solo despues de validar lectura y panel:

1. Compartir ambos Sheets como Editor con la service account.
2. Crear o confirmar una pestana segura `TEST_BOT_WRITES`.
3. Mantener `BOT_SHEETS_LIVE_WRITE_ENABLED=false`.
4. Ejecutar dry-run:

```bash
npm run maternaly:sheets:dry-run-write
```

5. Revisar `ReservationWritePlan`.
6. Activar escritura real solo con whitelist explicita y validacion manual.

## 10. Checks locales production-like

Sin Postgres local, health en modo production debe fallar porque produccion exige DB durable.

Con Postgres local/controlado:

```bash
npm run db:migrate
npm run docker:build
SMOKE_DATABASE_URL=<postgres-url-controlado> npm run smoke:docker
```

Sin Docker:

```bash
npm run lint
npm run test:run
npm run build
```

## 11. Guardrails

- No Vercel para Maternaly.
- No tocar Somos Perros vivo.
- No tocar `hotel-canino-demo`.
- No activar `WHATSAPP_PROVIDER=ycloud` hasta prueba controlada.
- No activar `LLM_PROVIDER=openai` hasta validar coste, prompts y observabilidad.
- No activar `GOOGLE_SHEETS_ACCESS_MODE=live` ni `BOT_SHEETS_LIVE_WRITE_ENABLED=true` sin `TEST_BOT_WRITES`, whitelist y aprobacion operativa.
