# YCloud

Provider principal para WhatsApp: `WHATSAPP_PROVIDER=ycloud`.

Implementado:

- `WhatsAppProvider` interface.
- `MockWhatsAppProvider`.
- `YCloudProvider`.
- `createMaternalyWhatsAppSender` para respuestas manuales del panel.
- webhook inbound en `POST /api/webhooks/ycloud`.
- normalizacion de telefono.
- validacion HMAC SHA-256 si existe `YCLOUD_WEBHOOK_SECRET`.
- idempotencia por `message.id`.
- logs/payloads sanitizados antes de guardar en conversaciones.

Variables secretas:

- `YCLOUD_API_KEY`
- `YCLOUD_WEBHOOK_SECRET`

Pendiente con credenciales reales:

- confirmar endpoint exacto y payload final de YCloud para media/documentos.
- confirmar header de firma exacto.
- activar envio real solo en entorno controlado.
