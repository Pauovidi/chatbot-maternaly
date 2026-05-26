# Pre EasyPanel readiness report

Fecha: 2026-05-26.

Objetivo: validar production Vercel actual y preparar rollback antes de migrar a EasyPanel. No se hizo deploy, no se cambio DNS, no se cambio webhook real de Twilio y no se imprimieron secretos.

## Semaforo

| Area | Estado | Evidencia | Bloqueo antes de migrar |
| --- | --- | --- | --- |
| Google Sheets | GREEN | Create/cancel real probado y limpieza verificada en `DICIEMBRE 2026`. | Ninguno para Sheets, pero proteger rutas heredadas. |
| Emails/IMAP | YELLOW | Tests/fixtures y poll seguro OK; IMAP real no configurado en auditoria. | Falta prueba controlada con buzon/carpeta test. |
| Recordatorios | YELLOW | Logica, 120h, idempotencia, `reminderSentAt` y cancelacion OK en smoke local. | Falta prueba con canal real si se va a enviar fuera de mock. |
| Rollback/backup | YELLOW | Deployment estable identificado y plan creado. | Falta ejecutar backup real y validar restore/copia. |
| Seguridad/secrets | YELLOW | Sin secretos impresos; datos test sinteticos; fixture historico con PII anonimizado. | Production Vercel heredado mantiene endpoints operativos abiertos. |
| Listo para migrar EasyPanel | NO | La base de codigo esta preparada, pero la operacion no esta cerrada. | IMAP, backup/restore y smoke final en dominio EasyPanel. |

## A. Estado inicial

- CWD: `D:\- TOT EL DEMES\TREBALLS\FEINA ACTUAL\Reddia\somos perros\Chatbot\hotel-canino-demo`.
- Repo: `hotel-canino-demo`.
- Rama inicial observada: `codex/smp-easypanel-production-migration-v0`.
- Rama de auditoria creada: `codex/smp-pre-easypanel-vercel-readiness-audit-v0`.
- HEAD inicial: `bed2a4382bbc90481237f13d14f6bf6fc69f795d`.
- Remote: `origin https://github.com/Pauovidi/hotel-canino-demo.git`.
- Working tree inicial: limpio.
- Package manager: `npm@10.9.3`.
- Next: `16.2.1`.
- Node declarado: `>=22 <23`.

## B. Production Vercel actual

- URL publica: `https://hotel-canino-demo.vercel.app`.
- Deployment actual: `https://hotel-canino-demo-5wgbt8yos-devestial.vercel.app`.
- Deployment ID: `dpl_bg2MvsCrFpLNbKgbNwLdZnoUyJRM`.
- Target/status: production / READY.
- Creado: `2026-05-06 09:12:35 +02:00`.
- Commit desplegado inferido: `3d2c13a5b2ced84097d6e5139b0b4ffd7ac84ef3`.
- Rama desplegada inferida: `codex/hotel-canino-demo-finalize`.
- Mensaje: `Make demo store serverless writable`.

Rutas criticas verificadas:

- `GET /`: 200.
- `GET /demo`: 200.
- `GET /admin`: 200.
- `GET /admin/conversations`: 404.
- `GET /api/health`: 404.
- `POST /api/demo/process`: 200.
- `POST /api/ops/email/poll`: 200.
- `POST /api/ops/reminders/dispatch`: 200.
- `POST /api/twilio/whatsapp`: 404.

Variables Vercel production observadas por nombre:

- `GOOGLE_PRIVATE_KEY`
- `HOTEL_SHEET_TITLE`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PROJECT_ID`
- `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`

## C. Google Sheets smoke

Datos test usados:

- Cliente: `SMP Smoke Pre EasyPanel`.
- Mascota: `Luna Smoke`.
- Telefono: `34600000999`.
- Email: `smoke-pre-easypanel@example.test`.
- Fechas: entrada `2026-12-21` manana, salida `2026-12-23` tarde.
- `reservationId`: `34600000999::smoke-pre-easypanel-example-test__luna__2026-12-21__morning`.

Evidencia:

- Disponibilidad inicial local contra Google Sheets real: OK.
- Hoja: `DICIEMBRE 2026`.
- Celdas tocadas en prueba local controlada: `V4`, `W4`, `X4`.
- Creacion local controlada: `status=confirmada`, `workflowState=reminder_scheduled`, `reminders=1`.
- Cancelacion local controlada: OK, `status=cancelada`.
- Prueba en Vercel production via `/api/demo/process`: HTTP 200, `status=confirmada`, `sheetPrepared=true`, `cellCount=3`, `reminderCount=1`, `hasSheetRegistration=true`.
- Cancelacion en Vercel production via `/api/ops/reservations/:id/cancel-request`: HTTP 200, `status=cancelada`.
- Verificacion posterior con adapter real: disponibilidad OK, sin fechas bloqueantes.

Resultado: GREEN.

## D. Emails/IMAP

Integracion encontrada:

- `src/lib/hotel/email/imap.ts`.
- `src/lib/hotel/email/service.ts`.
- `src/lib/hotel/email/store.ts`.
- `src/app/api/ops/email/poll/route.ts`.
- `scripts/hotel-email-poll.ts`.
- `scripts/hotel-worker.ts`.

Variables necesarias por nombre:

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
- `HOTEL_EMAIL_STATE_STORE_PATH`
- `HOTEL_EMAIL_STATE_STORE_DIR`
- `HOTEL_EMAIL_POLL_CRON`

Pruebas ejecutadas:

- `npm run hotel:email:poll` en modo seguro: `fetched=0`, `processed=0`, sin conexion IMAP real.
- Tests locales de email/normalizacion/operaciones: OK.

Bloqueos:

- No hay IMAP real configurado en el entorno auditado.
- Antes de migrar, configurar carpeta o mensaje test y `HOTEL_EMAIL_MARK_SEEN=false` para la primera prueba.
- Revisar limite real de lectura para evitar procesar mas mensajes de los previstos.

Resultado: YELLOW.

## E. Recordatorios

Prueba ejecutada:

- Tests de operaciones/reminders/scheduler: OK.
- Smoke local con store temporal y envio no real.

Validaciones:

- Solo reservas confirmadas se despachan en el flujo operativo.
- 120h / 5 dias antes validado por la logica.
- Idempotencia OK: doble confirmacion no duplico cola.
- `reminderSentAt` queda guardado tras dispatch.
- Segundo dispatch no reenvia.
- Cancelacion retira recordatorio pendiente.

Resultado: YELLOW porque la logica esta validada, pero el canal real de envio no se probo en esta fase.

## F. Rollback/backup

Documento creado:

- `docs/PRE_EASYPANEL_ROLLBACK_AND_BACKUP.md`.

Backups recomendados:

- Copia y export `.xlsx` del Google Sheet operativo.
- Snapshot de Postgres EasyPanel antes de trafico real.
- Backup del volumen `/data` si se usa fallback.
- Snapshot de variables por nombre, sin valores.
- Captura manual de la URL actual del webhook Twilio en Twilio Console.

Rollback:

- Deployment estable Vercel: `hotel-canino-demo-5wgbt8yos-devestial.vercel.app`.
- Comando preparado, no ejecutado: `vercel rollback hotel-canino-demo-5wgbt8yos-devestial.vercel.app`.
- Restaurar webhook Twilio anterior antes que nada si el fallo afecta WhatsApp.
- Mantener Vercel vivo 24-48h tras migrar.

Resultado: YELLOW hasta ejecutar backups reales y una verificacion de restore/copia.

## G. Tests/build

Comandos ejecutados durante auditoria parcial:

- `npm run test:run -- src/lib/hotel/email/service.test.ts src/lib/hotel/email/normalize.test.ts src/lib/hotel/application/operations.test.ts src/lib/hotel/conversations/conversations-security.test.ts`: OK.
- `npm run test:run -- src/lib/hotel/application/operations.test.ts src/lib/hotel/reminders/reminders.test.ts src/lib/hotel/reminders/scheduler.test.ts`: OK.

Comandos finales de repo completo: ver seccion final del commit/informe de la sesion.

Resultados finales:

- `npm run lint`: OK.
- `npm run test:run`: OK, 34 archivos, 123 tests pasados, 1 todo.
- `npm run build`: OK, con warning Turbopack preexistente de NFT trace sobre `next.config.ts` y `src/lib/hotel/persistence/runtime.ts`.
- `npm run smoke`: OK.
- `npm run smoke:http`: OK contra standalone local en `http://127.0.0.1:3104`, con Google Sheets real desactivado y stores temporales.
- Busqueda de PII historica conocida: OK, sin coincidencias para los literales retirados.

## H. Subagentes

- `subagente_contexto_repo`: confirmo repo/rama/HEAD/status, Vercel deployment production y preview EasyPanel.
- `subagente_google_sheets_smoke`: audito integracion real Google Sheets y marco el riesgo de `/api/demo/process` escribiendo en real si Sheets esta activo.
- `subagente_email_imap_smoke`: audito IMAP/email, ejecuto smoke seguro sin credenciales reales y tests de fixture.
- `subagente_reminders_smoke`: valido logica de 120h, idempotencia, `reminderSentAt` y cancelacion.
- `subagente_rollback_backup`: identifico deployment rollback y checklist operativo.
- `subagente_security_no_secrets`: no detecto valores secretos expuestos; marco YELLOW por endpoints heredados abiertos en Vercel, token Twilio por query param si se documenta completo, `/api/demo/process` publico y fixture historico con PII.

## I. Conclusion ejecutiva

La prueba real/controlada de Google Sheets quedo en verde: production Vercel escribio una reserva test en el cuadrante real y despues se cancelo, con disponibilidad restaurada. Email/IMAP y recordatorios quedan en amarillo: hay tests y smoke local, pero falta una prueba real controlada del buzon/canal. Rollback esta documentado y el deployment estable esta identificado, pero antes de migrar hay que ejecutar backups reales y validar restauracion o copia. Seguridad queda en amarillo hasta sustituir/cerrar el Vercel heredado y tratar `/api/demo/process` como ruta no publica en production.

Decision: no avanzar todavia al cambio de webhook Twilio ni apagar Vercel.
