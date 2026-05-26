# Pre EasyPanel rollback and backup

Fecha de auditoria: 2026-05-26.

Esta guia es la referencia operativa antes de mover Somos Muy Perros de Vercel a EasyPanel. No implica deploy, no cambia DNS y no cambia el webhook real de Twilio.

## 1. Estado actual antes de migrar

- URL publica actual: `https://hotel-canino-demo.vercel.app`.
- Deployment production actual: `https://hotel-canino-demo-5wgbt8yos-devestial.vercel.app`.
- Deployment ID: `dpl_bg2MvsCrFpLNbKgbNwLdZnoUyJRM`.
- Estado Vercel: `READY`.
- Fecha de creacion del deployment: `2026-05-06 09:12:35 +02:00`.
- Rama desplegada en production: `codex/hotel-canino-demo-finalize`.
- Commit desplegado en production: `3d2c13a5b2ced84097d6e5139b0b4ffd7ac84ef3`.
- Mensaje del commit production: `Make demo store serverless writable`.
- Rama local auditada: `codex/smp-pre-easypanel-vercel-readiness-audit-v0`.
- Base local auditada: `bed2a4382bbc90481237f13d14f6bf6fc69f795d`.

Aliases observados:

- `https://hotel-canino-demo.vercel.app`
- `https://hotel-canino-demo-devestial.vercel.app`
- `https://hotel-canino-demo-devestial-devestial.vercel.app`

Rutas criticas observadas en production Vercel:

| Ruta | Metodo | Estado observado | Nota |
| --- | --- | --- | --- |
| `/` | GET | 200 | Demo publica actual. |
| `/demo` | GET | 200 | Redirige/compatibilidad demo. |
| `/admin` | GET | 200 | Admin heredado expuesto en el deployment production actual. |
| `/admin/conversations` | GET | 404 | El panel de conversaciones no esta en production Vercel actual. |
| `/api/health` | GET | 404 | Healthcheck de EasyPanel no esta en production Vercel actual. |
| `/api/demo/process` | POST | 200 | Puede crear reserva real si Google Sheets esta activo. |
| `/api/ops/email/poll` | POST | 200 | Endpoint operativo heredado disponible. |
| `/api/ops/reminders/dispatch` | POST | 200 | Endpoint operativo heredado disponible. |
| `/api/twilio/whatsapp` | POST | 404 | Twilio real de la rama EasyPanel no esta en production Vercel actual. |

Variables de entorno production conocidas por nombre en Vercel:

- `GOOGLE_PRIVATE_KEY`
- `HOTEL_SHEET_TITLE`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PROJECT_ID`
- `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID`

Variables esperadas para la rama EasyPanel, si se activa despues:

- `HOTEL_PANEL_USERNAME`
- `HOTEL_PANEL_PASSWORD`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_WEBHOOK_AUTH_TOKEN`
- `HOTEL_CONVERSATIONS_MOCK_TWILIO`
- `TWILIO_WHATSAPP_PROVIDER_MODE`
- `DATABASE_URL`
- `HOTEL_PERSISTENCE_PROVIDER`
- `HOTEL_CONVERSATIONS_STORE_PATH`
- `HOTEL_DEMO_STORE_PATH`
- `HOTEL_REMINDERS_STORE_PATH`
- `HOTEL_EMAIL_STATE_STORE_PATH`

## 2. Datos que hay que respaldar

Antes de apuntar trafico real a EasyPanel:

- Google Sheets operativo: cuadrante completo y permisos del documento.
- Estado interno de reservas si existe en Vercel: el deployment actual usa almacenamiento no durable/exportable en funciones, por lo que no debe asumirse recuperable tras redeploy/restart.
- Conversaciones WhatsApp: production Vercel actual no expone `/admin/conversations` ni `/api/twilio/whatsapp`; si Twilio ya usa otra URL, capturarla en Twilio Console antes de mover nada.
- Recordatorios pendientes: capturar estado si existe en store durable; en Vercel heredado no hay garantia de durabilidad.
- Estado de email/IMAP: mailbox, carpeta, politica de `seen`, y fichero/DB de dedupe si existe.
- Variables de entorno: snapshot solo de nombres y presencia, nunca valores.
- URL webhook Twilio anterior: copiar la URL exacta desde Twilio Console antes de cambiarla.
- Ultimo deployment estable Vercel: `hotel-canino-demo-5wgbt8yos-devestial.vercel.app`.

## 3. Backup operativo

Google Sheets:

1. Abrir el Google Sheet operativo.
2. Crear una copia con fecha, por ejemplo `Somos Muy Perros - Reservas backup 2026-05-26`.
3. Exportar tambien a `.xlsx` y guardarlo fuera del servidor.
4. Verificar que la copia conserva hojas mensuales, notas de celda y permisos.
5. Registrar el `spreadsheetId` de la copia en el acta interna, no en logs publicos.

Variables de entorno:

1. Ejecutar `vercel env ls production` y guardar solo nombres.
2. En EasyPanel, revisar que las variables obligatorias estan definidas antes de desplegar.
3. No pegar valores de tokens, passwords, private keys ni JSON de service account en docs o issues.

Estado interno:

1. Si se usa Postgres en EasyPanel, ejecutar backup antes del primer trafico real y antes de mover Twilio.
2. Hacer restore test en una DB temporal.
3. Si se usa fallback `/data`, comprimir el volumen antes y despues del primer arranque.
4. Marcar fallback `/data` como single-instance only.

Twilio:

1. En Twilio Console, anotar el WhatsApp Sender real.
2. Copiar la URL actual de `When a message comes in`.
3. Guardar el metodo HTTP configurado.
4. No cambiar el webhook hasta que EasyPanel supere smoke de health, auth, Sheets, conversaciones y outbound.
5. Si la URL contiene `token=...`, no pegarla completa en documentos, issues ni logs: registrar solo host/ruta en docs y guardar el token en un gestor de secretos.

## 4. Rollback si EasyPanel falla

Ruta rapida:

1. Revertir el webhook de Twilio a la URL anterior capturada en Twilio Console.
2. Si se cambio DNS, devolver el registro al destino anterior o bajar TTL antes de la ventana.
3. En Vercel, usar el deployment estable: `hotel-canino-demo-5wgbt8yos-devestial.vercel.app`.
4. Comando preparado, no ejecutado en esta auditoria:

```powershell
vercel rollback hotel-canino-demo-5wgbt8yos-devestial.vercel.app
```

5. Si se tocaron datos, restaurar backup de Google Sheets o DB segun corresponda.
6. Verificar post-rollback:
   - `/` responde 200.
   - `/demo` responde 200.
   - Flujo de disponibilidad no escribe datos reales inesperados.
   - Twilio inbound vuelve a entrar por la URL anterior.
   - No hay recordatorios duplicados.

Ventana recomendada:

- Preparar backups el mismo dia de la migracion.
- Cambiar Twilio en una ventana con operador disponible.
- Monitorear activamente los primeros 60 minutos.
- Mantener Vercel vivo al menos 24-48 horas tras la migracion.

## 5. Criterios para no apagar Vercel

No apagar Vercel si cualquiera de estos puntos sigue abierto:

- Twilio inbound/outbound real no probado contra el dominio final.
- Google Sheets real no probado con create/cancel y limpieza verificada.
- IMAP real no probado o no configurado.
- Recordatorios no probados con idempotencia y cancelacion.
- Backup de Google Sheets/DB/volumen no validado con restore o copia inspeccionada.
- Rollback no ensayado o no documentado para el equipo.
- EasyPanel no tiene healthcheck verde ni logs revisados.
- El dominio final no tiene HTTPS estable.

## 6. Evidencia de la auditoria 2026-05-26

Google Sheets real:

- Test marker: `SMP Smoke Pre EasyPanel`.
- Mascota: `Luna Smoke`.
- Telefono test: `34600000999`.
- Email test: `smoke-pre-easypanel@example.test`.
- Fechas: `2026-12-21` por la manana a `2026-12-23` por la tarde.
- Hoja tocada: `DICIEMBRE 2026`.
- Celdas escritas por prueba local controlada: `V4`, `W4`, `X4`.
- `reservationId`: `34600000999::smoke-pre-easypanel-example-test__luna__2026-12-21__morning`.
- Cancelacion local controlada: OK, `status=cancelada`.
- Prueba production Vercel: `/api/demo/process` devolvio `status=confirmada`, `workflowState=reminder_scheduled`, `cellCount=3`.
- Cancelacion production Vercel: OK, HTTP 200, `status=cancelada`, `cancellationCompletedAt=2026-05-26T05:00:04.792Z`.
- Verificacion posterior con adapter real: disponibilidad OK en `DICIEMBRE 2026`, sin `blockingDates`.

Email/IMAP:

- IMAP real no esta configurado en el entorno local de auditoria.
- `npm run hotel:email:poll` en modo seguro no conecto IMAP y no proceso emails reales.
- Tests locales de parsing/operaciones/email: OK.
- Estado: parcial, requiere credenciales/carpeta test antes de migracion.

Recordatorios:

- Smoke local controlado sin envio real: OK.
- Doble confirmacion no duplico cola.
- Primer dispatch marco `reminderSentAt`.
- Segundo dispatch no reenvio.
- Cancelacion limpio recordatorios pendientes.
- Estado real de envio externo: pendiente si se conecta webhook/canal real.

Seguridad:

- No se documentaron valores secretos.
- Datos test son sinteticos y no pertenecen a clientes reales.
- Production Vercel actual es un deployment heredado: `/api/demo/process` puede escribir en Sheets y `/api/ops/*` responde. Esto debe tratarse como riesgo hasta apagar o sustituir Vercel.
- La muestra de email con PII historica se anonimiza en la rama de auditoria para que no viaje al siguiente despliegue.
