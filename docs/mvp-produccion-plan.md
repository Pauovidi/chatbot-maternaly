# MVP producción plan

## 1) Qué ya es real

- Adapter real de Google Sheets con `googleapis`
- Ingestión real de email por IMAP con `imapflow`
- Canal de salida WhatsApp con modos `preview`, `manual` y `real`
- Confirmación operativa por endpoint
- Cola de reminders y dispatch por webhook
- Worker interno por cron para polling + dispatch

## 2) Qué sigue mock

- credenciales reales no cargadas en este entorno
- validación contra un spreadsheet real del cliente
- validación contra un buzón IMAP real del cliente
- proveedor real de WhatsApp
- proveedor real de reminders

## 3) Credenciales necesarias

### Google Sheets

- `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`
- una de estas opciones:
  - `HOTEL_GOOGLE_SHEETS_ACCESS_TOKEN`
  - `HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`
  - `HOTEL_GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` + `HOTEL_GOOGLE_SHEETS_PRIVATE_KEY`

### Email real

- `HOTEL_EMAIL_IMAP_HOST`
- `HOTEL_EMAIL_IMAP_PORT`
- `HOTEL_EMAIL_IMAP_SECURE`
- `HOTEL_EMAIL_IMAP_USER`
- `HOTEL_EMAIL_IMAP_PASSWORD`
- `HOTEL_EMAIL_IMAP_MAILBOX`

### WhatsApp / salida

- `HOTEL_WHATSAPP_OUTPUT_MODE`
- `HOTEL_WHATSAPP_WEBHOOK_URL`
- `HOTEL_USE_MOCK_WHATSAPP`
- `HOTEL_WHATSAPP_ALLOW_MANUAL_FALLBACK`

### Reminders

- `HOTEL_USE_REMINDERS_REAL`
- `HOTEL_REMINDERS_WEBHOOK_URL`

## 4) Pasos exactos para conectar Google Sheets

1. Comparte el spreadsheet con la service account o prepara un access token válido.
2. Define el naming de hoja:
   - `HOTEL_GOOGLE_SHEETS_SHEET_NAMING=yyyy-mm`
   - o el naming real que use el hotel
3. Configura estructura:
   - `HOTEL_GOOGLE_SHEETS_TITLE_ROW`
   - `HOTEL_GOOGLE_SHEETS_DAY_HEADER_ROW`
   - `HOTEL_GOOGLE_SHEETS_FIRST_DATA_ROW`
   - `HOTEL_GOOGLE_SHEETS_LAST_DATA_ROW`
   - `HOTEL_GOOGLE_SHEETS_LABEL_COLUMN`
   - `HOTEL_GOOGLE_SHEETS_FIRST_DAY_COLUMN`
   - `HOTEL_GOOGLE_SHEETS_LAST_DAY_COLUMN`
   - `HOTEL_GOOGLE_SHEETS_DAY_COUNT`
4. Elige modo:
   - `HOTEL_GOOGLE_SHEETS_OCCUPANCY_MODE=mirror-daily-counts`
   - o `HOTEL_GOOGLE_SHEETS_OCCUPANCY_MODE=slot-grid`
5. Activa:
   - `HOTEL_USE_GOOGLE_SHEETS_REAL=true`
6. Lanza:
   - `POST /api/ops/reservations/:id/confirm`
7. Verifica:
   - la validación estructural no falla
   - la mascota se escribe en la fila/celda esperada
   - el color mapping se aplica

## 5) Pasos exactos para conectar email real

1. Configura:
   - `HOTEL_USE_MOCK_EMAIL_INPUT=false`
   - `HOTEL_EMAIL_IMAP_HOST`
   - `HOTEL_EMAIL_IMAP_USER`
   - `HOTEL_EMAIL_IMAP_PASSWORD`
   - `HOTEL_EMAIL_IMAP_MAILBOX=INBOX`
2. Ajusta opcionales:
   - `HOTEL_EMAIL_MARK_SEEN=true`
   - `HOTEL_EMAIL_POLL_LIMIT=25`
3. Ejecuta:
   - `npm run hotel:email:poll`
   - o `POST /api/ops/email/poll`
4. Verifica:
   - se procesan solo correos relevantes
   - los duplicados se marcan por fingerprint/messageId
   - aparecen reservas nuevas en `/admin`

## 6) Pasos exactos para activar recordatorios

1. Configura:
   - `HOTEL_USE_REMINDERS_REAL=true`
   - `HOTEL_REMINDERS_WEBHOOK_URL=https://...`
   - `HOTEL_REMINDER_LEAD_HOURS=48`
2. Confirma una reserva:
   - `POST /api/ops/reservations/:id/confirm`
3. Despacha reminders:
   - `npm run hotel:reminders:dispatch`
   - o `POST /api/ops/reminders/dispatch`
4. Si quieres ejecución continua:
   - `npm run hotel:worker`
   - o cron externo llamando a los endpoints
5. Verifica:
   - `pendiente` tras confirmar
   - `enviado` cuando el webhook responde `200`
   - `fallido` si el provider falla

## 7) Riesgos operativos

- Riesgo: estructura de Sheets no coincide.
  - Mitigación: validación previa y bloqueo de escritura.
- Riesgo: misma mascota con clientes distintos.
  - Mitigación: `identityTrace`, `clientKey`, `petKey` y `reservationId` robusto.
- Riesgo: duplicados de email.
  - Mitigación: fingerprint + messageId + UID.
- Riesgo: timezone incorrecta.
  - Mitigación: desplegar con `Europe/Madrid`.
- Riesgo: webhook de WhatsApp o reminders no listo.
  - Mitigación: `preview/manual` y fallback controlado.

## 8) Checklist de puesta en marcha

1. `npm run smoke`
2. configurar `.env.local`
3. `npm run hotel:email:poll`
4. revisar `/admin`
5. `POST /api/ops/reservations/:id/send-reply`
6. `POST /api/ops/reservations/:id/confirm`
7. `npm run hotel:reminders:dispatch`
8. confirmar en:
   - Google Sheets
   - logs de salida
   - cola de reminders
9. activar `npm run hotel:worker` o cron externo
