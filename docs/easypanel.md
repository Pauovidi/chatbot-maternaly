# EasyPanel deployment guide

Maternaly is targeted at EasyPanel from the first production-like deploy. Do not deploy this repo to Vercel and do not reuse the live Somos Perros Vercel project.

## 1. Create the app

- App name: `maternaly-chatbot`
- Type: Docker / GitHub repository
- Repository: `https://github.com/Pauovidi/chatbot-maternaly`
- Branch: `codex/maternaly-bootstrap-ycloud-sheets-llm-v0`
- Build: `Dockerfile`
- Internal port: `3000`
- Healthcheck path: `/api/health`

The repo uses Next standalone output (`output: "standalone"`) and the Docker image starts `node server.js` as a non-root user.

## 2. Create Postgres

- Service name: `maternaly-postgres`
- Link `DATABASE_URL` into the app as a secret.
- Enable EasyPanel backups before handling real traffic.
- Do not use ephemeral container storage for production state.

Production requires Postgres. JSON/file stores are local-development fallback only and are disabled in production unless an explicit unsafe override is set.

## 3. Environment variables

Non-secret variables:

```text
APP_NAME=Maternaly
APP_ENV=production
NODE_ENV=production
WHATSAPP_PROVIDER=mock
GOOGLE_SHEETS_ACCESS_MODE=read_only
BOT_SHEETS_LIVE_WRITE_ENABLED=false
MATERNALY_SHEET_IDS=163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI,1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do
LLM_PROVIDER=mock
PANEL_ADMIN_USERNAME=<admin-user>
APP_BASE_URL=https://<maternaly-domain>
PORT=3000
```

Secret variables, values must be added in EasyPanel only:

```text
DATABASE_URL
PANEL_ADMIN_PASSWORD
YCLOUD_API_KEY
YCLOUD_WEBHOOK_SECRET
OPENAI_API_KEY
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
GOOGLE_APPLICATION_CREDENTIALS
```

Do not bulk replace environment variables if the app already has secrets. Add or edit one variable at a time.

## 4. Migrations

Run after `DATABASE_URL` is linked:

```bash
npm run db:migrate
```

Migrations are idempotent and do not reset data:

- `db/migrations/001_init.sql`
- `db/migrations/002_conversations.sql`
- `db/migrations/003_operational_state.sql`
- `db/migrations/004_maternaly_operational_models.sql`
- `db/migrations/005_maternaly_contacts_handoffs.sql`

Expected operational tables/views include contacts, conversations, messages, manual handoffs, service session cache, reservations, reservation write plans, payments, invoice events, sheet audit logs and LLM interpretation events.

## 5. First safe deploy

Use the safest first-run modes:

- `WHATSAPP_PROVIDER=mock`
- `LLM_PROVIDER=mock`
- `GOOGLE_SHEETS_ACCESS_MODE=read_only`
- `BOT_SHEETS_LIVE_WRITE_ENABLED=false`

This means no real WhatsApp send, no real LLM dependency and no real Sheets write.

## 6. Post-deploy validation

Check:

- `GET /api/health` returns `ok: true`.
- Health shows `runtimeTarget: easypanel-container`.
- Health shows `database.configured=true` and `database.reachable=true`.
- `/admin/conversations` requires Basic Auth and loads after auth.
- Logs do not print secret values.
- Sheets access mode is `read_only`.
- Sheets write enabled is `false`.
- YCloud webhook endpoint exists at `/api/webhooks/ycloud`.

Webhook mock smoke:

```bash
curl -X POST https://<maternaly-domain>/api/webhooks/ycloud \
  -H "Content-Type: application/json" \
  -d '{"id":"smoke-001","from":"+34600000001","to":"+34944000000","text":"Hola, quiero informacion sobre AIPAP Agua","type":"text"}'
```

## 7. Later: YCloud real

After the mock deploy is healthy:

1. Add `YCLOUD_API_KEY` and `YCLOUD_WEBHOOK_SECRET`.
2. Change `WHATSAPP_PROVIDER=ycloud`.
3. Configure YCloud inbound URL:

```text
https://<maternaly-domain>/api/webhooks/ycloud
```

4. Test with one controlled inbound message.
5. Keep Sheets live writes disabled.

## 8. Later: Google Sheets editor

1. Share both Sheets as Editor with the service account.
2. Create or confirm a safe tab named `TEST_BOT_WRITES`.
3. Keep `BOT_SHEETS_LIVE_WRITE_ENABLED=false`.
4. Run dry-run write first:

```bash
npm run maternaly:sheets:dry-run-write
```

5. Activate live writes only with a small whitelist and after manual review.

## 9. Local production-like checks

Without a local Postgres URL, production health is expected to fail because production requires durable DB.

With Postgres:

```bash
npm run db:migrate
npm run docker:build
SMOKE_DATABASE_URL=<postgres-url> npm run smoke:docker
```

Without Postgres:

```bash
npm run build
npm run maternaly:health
```

The second command should warn/fail production readiness if `NODE_ENV=production` and `DATABASE_URL` is missing.
