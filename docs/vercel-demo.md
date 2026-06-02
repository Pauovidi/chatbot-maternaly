# Maternaly Vercel Demo

Esta demo temporal usa Vercel, Next.js, Twilio Sandbox y Google Sheets como store durable del panel de conversaciones. No usa Postgres en Vercel y no sustituye la produccion final en EasyPanel.

## 1. Proyecto Vercel nuevo

- Crear un proyecto Vercel nuevo.
- No usar el proyecto `hotel-canino-demo`.
- No tocar Somos Perros ni `hotel-canino-demo`.
- Repo: `Pauovidi/chatbot-maternaly`.
- Branch: `codex/maternaly-bootstrap-ycloud-sheets-llm-v0`.

## 2. Variables no secretas

```env
APP_NAME=Maternaly
APP_ENV=production
NODE_ENV=production
APP_BASE_URL=https://<url-vercel>
WHATSAPP_PROVIDER=twilio
TWILIO_PROVIDER_MODE=sandbox
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
LLM_PROVIDER=mock
GOOGLE_SHEETS_ACCESS_MODE=read_only
BOT_SHEETS_LIVE_WRITE_ENABLED=false
MATERNALY_CONVERSATIONS_STORE_PROVIDER=google_sheets
MATERNALY_CONVERSATIONS_SHEET_NAME=CONVERSATIONS
MATERNALY_DEMO_VERCEL_GOOGLE_SHEETS_STORE_ENABLED=true
MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID=<sheet-id-store-conversaciones>
MATERNALY_ENTRY_REGISTRY_VISIBLE=false
```

Compatibilidad heredada: si ya existen, `HOTEL_CONVERSATIONS_STORE_PROVIDER=google_sheets`, `HOTEL_CONVERSATIONS_SHEET_NAME=CONVERSATIONS` y `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID=<sheet-id>` siguen funcionando. Si hay variables Maternaly y Hotel a la vez, se leen primero las Maternaly.

## 3. Variables secretas

```env
PANEL_ADMIN_PASSWORD=<password-panel>
TWILIO_ACCOUNT_SID=<account-sid>
TWILIO_AUTH_TOKEN=<auth-token>
TWILIO_WEBHOOK_AUTH_TOKEN=<token-webhook>
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=<service-account-json-base64>
```

Tambien se admiten credenciales de service account en JSON o email/private key con las variables heredadas del proyecto, por ejemplo `HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` + `HOTEL_GOOGLE_SHEETS_PRIVATE_KEY`, o `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`.

No imprimir secretos en logs ni capturas.

## 4. Google Sheets

1. Crear un Sheet limpio para el store del panel, por ejemplo `Maternaly Bot Store`.
2. Compartirlo como Editor con el email de la service account.
3. Usar su ID en `MATERNALY_GOOGLE_SHEETS_SPREADSHEET_ID`.
4. La app crea o usa la pestana `CONVERSATIONS`.
5. No usar los Sheets caoticos de servicios como store del panel.

El store `CONVERSATIONS` guarda una fila de metadatos y una fila JSON por conversacion. La timeline de mensajes y eventos queda serializada dentro de cada conversacion. Para que la demo persista, la service account necesita permiso Editor sobre el Sheet.

`GOOGLE_SHEETS_ACCESS_MODE=read_only` y `BOT_SHEETS_LIVE_WRITE_ENABLED=false` mantienen desactivada la escritura real de reservas/servicios. El store de conversaciones es independiente y si escribe en el Sheet limpio de la demo.

## 5. Twilio Sandbox

Configurar el webhook inbound del Sandbox:

```text
https://<url-vercel>/api/twilio/whatsapp?token=<TWILIO_WEBHOOK_AUTH_TOKEN>
```

Metodo: `POST`.

Comportamiento esperado:

- Twilio llama a `POST /api/twilio/whatsapp`.
- El endpoint valida `TWILIO_WEBHOOK_AUTH_TOKEN`.
- El mensaje se persiste en `CONVERSATIONS`.
- La respuesta sale como TwiML.
- La conversacion aparece en `/admin/conversations`.

## 6. Health

`GET /api/health` debe mostrar:

- `runtimeTarget=vercel-demo`
- `database.configured=false`
- `database.required=false`
- `conversationsStore.provider=google_sheets`
- `conversationsStore.durable=true`
- `conversationsStore.sheetName=CONVERSATIONS`
- `conversationsStore.warning="demo mode, no Postgres"`
- `panel.ready=true`
- `whatsapp.twilio.active=true`
- `whatsapp.twilio.configured=true`
- `whatsapp.twilio.webhookProtected=true`
- `googleSheets.writeEnabled=false`
- `googleSheets.liveWriteEnabled=false`
- `llm.provider=mock`

Si aparece `file-tmp` o `/tmp` como store principal, la demo no esta bien configurada. `/tmp` solo puede quedar como fallback auxiliar con warning, nunca como fuente durable del panel.

El diagnostico protegido del store esta en:

```text
GET /api/maternaly/admin/conversations-store/debug
```

Si `MATERNALY_ADMIN_TASK_TOKEN` existe, requiere `Authorization: Bearer <token>` o `x-maternaly-admin-task-token`. Si no existe, requiere el acceso seguro del panel. La respuesta solo expone provider, runtime, pestana, flags de credenciales/configuracion, conteos y tipo/codigo de error; no devuelve secretos ni contenido de conversaciones.

El seed protegido de conversaciones demo esta en:

```text
POST /api/maternaly/admin/conversations/seed-demo
```

Requiere `x-maternaly-admin-task-token: <token>` y usa `seedBatchId=maternaly-demo-panel-seed-v1` por defecto. Es idempotente: no duplica si el batch ya existe y solo reemplaza conversaciones del mismo batch cuando se envia `{ "force": true }`. No envia WhatsApp ni toca los Sheets originales de servicios.

## 7. Limitaciones

- Demo temporal en Vercel.
- Sin Postgres.
- No es la produccion final.
- EasyPanel + Postgres queda para produccion.
- No activar escritura real de reservas en Sheets.
- No activar pagos ni facturas reales.
- No activar OpenAI real salvo decision explicita posterior.

## 8. Validacion manual

1. Desplegar el proyecto nuevo en Vercel.
2. Revisar `GET https://<url-vercel>/api/health`.
3. Enviar un WhatsApp al Twilio Sandbox.
4. Abrir `/admin/conversations`.
5. Confirmar que el mensaje aparece tras refrescar.
6. Revisar el Sheet `Maternaly Bot Store`, pestana `CONVERSATIONS`.
