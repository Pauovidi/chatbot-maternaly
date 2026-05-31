# Chatbot Maternaly

Proyecto Next.js para arrancar el chatbot WhatsApp de Maternaly a partir de la base tecnica de `hotel-canino-demo`.

## Estado V1

- Producto: Maternaly.
- Provider WhatsApp principal: YCloud, con `mock` para desarrollo.
- Twilio queda como provider legacy si `WHATSAPP_PROVIDER=twilio`.
- Persistencia objetivo: Postgres por `DATABASE_URL`.
- Deploy objetivo: EasyPanel con Docker.
- Runtime production: contenedor EasyPanel, no Vercel.
- Produccion requiere Postgres por `DATABASE_URL`; el file store queda solo para desarrollo local.
- Google Sheets: lectura/auditoria para los dos Sheets reales.
- Escritura Sheets: bloqueada por defecto; solo `WritePlan` y dry-run.
- LLM: interprete estructurado con fallback determinista cuando no exista `OPENAI_API_KEY`.
- Panel: reutiliza el inbox de conversaciones de la base Somos Perros, adaptado a servicios, pagos, facturas y revision manual Maternaly.

## Base importada

Base tecnica usada:

- repo: `https://github.com/Pauovidi/hotel-canino-demo`
- rama: `codex/smp-conversation-slotfill-archive-clientupsert-v0`
- commit: `75635585609f749c357b013cfeb1432b69ddb5fd`

Se eligio porque es descendiente de EasyPanel, polling/reset y fixes de produccion, y contiene el panel de conversaciones mas completo.

## Scripts utiles

```bash
npm install
npm run lint
npm run test:run
npm run build
npm run maternaly:health
npm run maternaly:sheets:audit
npm run maternaly:sheets:dry-run-write
npm run db:migrate
npm run easypanel:check
```

Los scripts `hotel:*` se conservan temporalmente como base tecnica heredada.

## EasyPanel

La guia operativa esta en `docs/easypanel.md`. Primer deploy seguro:

- `WHATSAPP_PROVIDER=mock`
- `LLM_PROVIDER=mock`
- `GOOGLE_SHEETS_ACCESS_MODE=read_only`
- `BOT_SHEETS_LIVE_WRITE_ENABLED=false`
- `DATABASE_URL` enlazado desde Postgres EasyPanel

No despliegues Maternaly en Vercel ni reutilices el proyecto vivo de Somos Perros.

## Variables

No secretas principales:

- `APP_NAME=Maternaly`
- `APP_ENV`
- `APP_BASE_URL`
- `WHATSAPP_PROVIDER=ycloud|mock|twilio`
- `GOOGLE_SHEETS_ACCESS_MODE=read_only|dry_run|live`
- `BOT_SHEETS_LIVE_WRITE_ENABLED=false`
- `MATERNALY_SHEET_IDS`
- `LLM_PROVIDER=openai|mock`
- `LLM_MODEL`
- `PANEL_ADMIN_USERNAME`

Secretas esperadas:

- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` o `GOOGLE_APPLICATION_CREDENTIALS`
- `YCLOUD_API_KEY`
- `YCLOUD_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `DATABASE_URL`
- `PANEL_ADMIN_PASSWORD`

No guardes secretos en Git.
