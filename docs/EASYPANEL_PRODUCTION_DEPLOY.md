# EasyPanel production deploy

## Decision

Somos Muy Perros pasa de preview/demo a produccion self-hosted:

- Next.js en Docker con `output: "standalone"`.
- EasyPanel App Service desde GitHub.
- Dominio publico con HTTPS gestionado por EasyPanel.
- Twilio WhatsApp real como unico proveedor de WhatsApp.
- Google Sheets sigue como cuadrante operativo.
- Persistencia durable: Postgres recomendado; volumen `/data` solo como fallback single-instance.

No usar `/tmp` como store principal en produccion.

## 1. Proyecto y App Service

1. Crear un proyecto EasyPanel llamado `somos-muy-perros`.
2. Crear un servicio `App` llamado `hotel-canino-demo`.
3. Source: GitHub repository.
4. Repo: `https://github.com/Pauovidi/hotel-canino-demo.git`.
5. Branch: `codex/smp-easypanel-production-migration-v0` o la rama final ya mergeada.
6. Build: `Dockerfile`.
7. Puerto expuesto: `3000`.
8. Healthcheck HTTP: `/api/health`.

El contenedor arranca con:

```text
node server.js
```

Ese `server.js` viene de `.next/standalone`.

## 2. Dominio HTTPS

Dominios recomendados:

- `app.somosmuyperros.com`
- `panel.somosmuyperros.com`
- `hotel.somosmuyperros.com`

En EasyPanel:

1. Abrir el servicio `hotel-canino-demo`.
2. Ir a `Domains`.
3. Anadir el dominio elegido.
4. Apuntar el DNS al servidor EasyPanel.
5. Dejar que EasyPanel emita HTTPS automatico.
6. Configurar proxy al puerto `3000`.

URL final del webhook Twilio:

```text
https://<dominio>/api/twilio/whatsapp?token=<TWILIO_WEBHOOK_AUTH_TOKEN>
```

## 3. Variables obligatorias

App/auth:

```env
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
PORT=3000
APP_BASE_URL=https://<dominio>
HOTEL_PANEL_USERNAME=<definir-en-easypanel>
HOTEL_PANEL_PASSWORD=<definir-en-easypanel>
HOTEL_PANEL_ALLOW_LOCAL_AUTH_BYPASS=false
```

Twilio:

```env
TWILIO_ACCOUNT_SID=<definir-en-easypanel>
TWILIO_AUTH_TOKEN=<definir-en-easypanel>
TWILIO_WHATSAPP_FROM=whatsapp:+34682621177
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_WEBHOOK_AUTH_TOKEN=<definir-en-easypanel>
HOTEL_CONVERSATIONS_MOCK_TWILIO=false
TWILIO_WHATSAPP_PROVIDER_MODE=real
TWILIO_STATUS_CALLBACK_URL=
TWILIO_VALIDATE_SIGNATURES=
```

Google Sheets:

```env
HOTEL_USE_GOOGLE_SHEETS_REAL=true
HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID=<definir-en-easypanel>
HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON=<json-o-base64-si-se-implementa>
HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=<opcional-si-se-usa-par-email/key>
HOTEL_GOOGLE_SHEETS_PRIVATE_KEY=<opcional-si-se-usa-par-email/key>
```

Si se usa private key multilinea, cargarla con saltos `\n` escapados cuando EasyPanel no conserve saltos reales.

Email/worker si aplica:

```env
HOTEL_USE_MOCK_EMAIL_INPUT=false
HOTEL_EMAIL_IMAP_HOST=<definir-en-easypanel>
HOTEL_EMAIL_IMAP_PORT=993
HOTEL_EMAIL_IMAP_SECURE=true
HOTEL_EMAIL_IMAP_USER=<definir-en-easypanel>
HOTEL_EMAIL_IMAP_PASSWORD=<definir-en-easypanel>
HOTEL_EMAIL_IMAP_MAILBOX=INBOX
HOTEL_INTERNAL_WORKER_ENABLED=false
HOTEL_EMAIL_POLL_CRON=*/5 * * * *
HOTEL_REMINDER_DISPATCH_CRON=*/10 * * * *
```

## 4. Persistencia recomendada: Postgres

Crear un servicio Postgres dentro del mismo proyecto EasyPanel.

Variables:

```env
DATABASE_URL=<url-interna-del-postgres-de-easypanel>
HOTEL_PERSISTENCE_PROVIDER=postgres
```

Despues de configurar `DATABASE_URL`, ejecutar una vez:

```bash
npm run db:migrate
```

Migraciones incluidas:

- `db/migrations/001_init.sql`
- `db/migrations/002_conversations.sql`
- `db/migrations/003_operational_state.sql`

Estado actual:

- Conversaciones: adapter Postgres implementado.
- Mensajes/eventos: guardados en Postgres con payload JSONB e indices.
- Reservas, recordatorios, logs y email: migraciones preparadas; la migracion completa de codigo queda como siguiente fase.

## 5. Fallback transitorio por volumen

Usar solo si Postgres no esta listo para el primer arranque. Es single-instance y requiere backups del volumen.

Mount:

```text
/data
```

Variables:

```env
HOTEL_PERSISTENCE_PROVIDER=file-volume
HOTEL_FILE_STORE_DIR=/data
HOTEL_CONVERSATIONS_STORE_PATH=/data/conversations.json
HOTEL_DEMO_STORE_PATH=/data/hotel-store.json
HOTEL_DOMAIN_STORE_PATH=/data/hotel-domain.json
HOTEL_REMINDERS_STORE_PATH=/data/reminders.json
HOTEL_EMAIL_STATE_STORE_PATH=/data/email-state.json
```

Advertencia: este fallback no es multi-instancia, no tiene transacciones y puede perder escrituras concurrentes. No venderlo como solucion final.

## 6. Healthcheck y smoke

Healthcheck:

```bash
curl -fsS https://<dominio>/api/health
```

Check autenticado:

```bash
curl -fsS -u '<HOTEL_PANEL_USERNAME>:<HOTEL_PANEL_PASSWORD>' https://<dominio>/api/conversations
```

Validacion de forma de variables en contenedor:

```bash
npm run easypanel:check
```

Smoke HTTP controlado:

```bash
SMOKE_BASE_URL=https://<dominio> SMOKE_BASIC_AUTH=<base64-user-pass> npm run smoke:http
```

No ejecutar smoke contra produccion real sin saber que crea datos de prueba.

## 7. Twilio

En Twilio Console:

1. Ir a `Messaging` -> `Senders` -> `WhatsApp Senders`.
2. Abrir el numero real.
3. Configurar `When a message comes in`.
4. Metodo: `POST`.
5. URL:

```text
https://<dominio>/api/twilio/whatsapp?token=<TWILIO_WEBHOOK_AUTH_TOKEN>
```

Si se configura status callback:

```text
https://<dominio>/api/twilio/status
```

Nota: el endpoint `/api/twilio/status` aun no esta implementado; no activar como requisito bloqueante salvo que se anada antes.

## 8. Logs

Mirar en EasyPanel:

- Build logs: fallos de `npm ci` o `npm run build`.
- Runtime logs: errores de arranque, variables ausentes, errores de red.
- Healthcheck: `/api/health`.

La app no debe imprimir secretos. Si aparece un token, key privada o password en logs, rotar credenciales.

## 9. Backups

Postgres:

- Activar backups del servicio Postgres.
- Probar restauracion antes de cambiar el webhook real de Twilio.
- Guardar snapshot antes de cada migracion.

Fallback `/data`:

- Backup completo del volumen `/data`.
- Backup de variables de entorno fuera de EasyPanel.
- Restauracion: parar app, restaurar volumen, arrancar app, comprobar `/api/health`.

## 10. Rollback

1. Volver al commit/imagen anterior desde EasyPanel.
2. Restaurar backup DB si hubo migracion destructiva.
3. Revisar `/api/health`.
4. Revisar `/api/conversations` con Basic Auth.
5. Si hay incidente Twilio, desactivar temporalmente el webhook o devolverlo a la URL anterior.

No hacer force push. No tocar `main/master` durante la migracion.

## 11. Worker opcional

Para polling de email y recordatorios recurrentes, crear un segundo servicio sin dominio publico con el mismo repo/env y comando:

```bash
npm run hotel:worker
```

Debe compartir `DATABASE_URL` o el mismo volumen `/data` si se usa fallback.

## 12. Checklist antes de mover webhook real

- App desplegada con HTTPS.
- `/api/health` devuelve `ok: true`.
- `/admin`, `/internal`, `/ops` y `/api/ops/*` protegidos por Basic Auth.
- `HOTEL_CONVERSATIONS_MOCK_TWILIO=false`.
- `TWILIO_WHATSAPP_PROVIDER_MODE=real`.
- WhatsApp Sender real activo en Twilio.
- Persistencia no apunta a `/tmp`.
- Backups activos.
- Prueba inbound controlada realizada.
- Reply manual desde panel probado con numero permitido.
