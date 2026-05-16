# Twilio WhatsApp real V0

## Decision tecnica

Somos Muy Perros usa Twilio como proveedor principal de WhatsApp. No se cablea Meta Cloud API directa y no se crea `/api/meta/whatsapp`.

Motivos:

- Twilio ya encaja con el panel actual.
- Permite trabajar con WhatsApp Senders vinculados a Meta/WABA desde Twilio.
- Facilita plantillas con Content Template Builder.
- Reduce complejidad tecnica para este caso.

## Variables

Obligatorias para real:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` o `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_WEBHOOK_AUTH_TOKEN`
- `HOTEL_CONVERSATIONS_MOCK_TWILIO=false`
- `HOTEL_PANEL_USERNAME`
- `HOTEL_PANEL_PASSWORD`

Opcionales:

- `TWILIO_STATUS_CALLBACK_URL`
- `TWILIO_VALIDATE_SIGNATURES=true`
- `TWILIO_WHATSAPP_PROVIDER_MODE=mock|sandbox|real`
- `TWILIO_CONTENT_SID_CONFIRMACION`
- `TWILIO_CONTENT_SID_RECORDATORIO`
- `TWILIO_CONTENT_SID_CANCELACION`

Si `TWILIO_MESSAGING_SERVICE_SID` esta definido, outbound usa `MessagingServiceSid` y no `From`. Si no, usa `TWILIO_WHATSAPP_FROM`.

`TWILIO_WHATSAPP_PROVIDER_MODE` solo controla el estado mostrado en el panel cuando la inferencia automatica no basta, por ejemplo un Messaging Service usado para Sandbox. No cambia el proveedor ni activa otra API.

## Webhook inbound

Endpoint:

```text
POST /api/twilio/whatsapp
```

Produccion recomendada para numero real:

```text
https://hotel-canino-demo.vercel.app/api/twilio/whatsapp?token=<TWILIO_WEBHOOK_AUTH_TOKEN>
```

Preview protegida:

```text
https://hotel-canino-demo-devestial-devestial.vercel.app/api/twilio/whatsapp?x-vercel-protection-bypass=<VERCEL_AUTOMATION_BYPASS_SECRET>&token=<TWILIO_WEBHOOK_AUTH_TOKEN>
```

Twilio debe enviar `application/x-www-form-urlencoded` con `From`, `To`, `Body`, `MessageSid` y, si aplica, `NumMedia`.

En produccion, `TWILIO_WEBHOOK_AUTH_TOKEN` debe existir. Si falta, el webhook responde 401 para evitar inbound abierto.

## Sandbox vs numero real

| Tema | Sandbox | Numero real |
| --- | --- | --- |
| Uso | Pruebas | Produccion |
| Numero | Compartido de Twilio `+14155238886` | Numero propio registrado |
| Usuarios | Deben hacer join al Sandbox | Clientes con opt-in valido |
| Branding | Sandbox Twilio | Marca del negocio |
| Plantillas | Limitadas/predefinidas | Propias aprobadas |
| Webhook | Sandbox settings | Sender o Messaging Service |

## Checklist numero real

Caso A: el numero ya aparece como WhatsApp Sender en Twilio.

1. Copia el sender en `TWILIO_WHATSAPP_FROM`.
2. Configura webhook inbound con metodo `POST`.
3. Define `HOTEL_CONVERSATIONS_MOCK_TWILIO=false`.
4. Prueba inbound y reply manual desde el panel.

Caso B: el numero esta validado en Meta pero no en Twilio.

1. En Twilio Console, ve a `Messaging` -> `Senders` -> `WhatsApp Senders`.
2. Usa `Register WhatsApp Sender` o `Self Sign-up`.
3. Conecta el Meta Business Manager y la WABA.
4. Selecciona o registra el numero real.
5. Completa verificacion OTP por SMS o llamada.
6. Si viene de otra BSP, puede requerir desactivar 2FA en WhatsApp Manager.

Caso C: el numero sigue usado en WhatsApp Business App.

1. Libera o migra el numero antes de usarlo como API Sender.
2. El numero debe poder recibir OTP.
3. Completa el registro como WhatsApp Sender en Twilio.

## Plantillas

Dentro de la ventana de atencion de 24 horas tras inbound, se pueden enviar respuestas libres. Para iniciar conversaciones o responder fuera de ventana hacen falta plantillas aprobadas.

Gestion recomendada:

- Twilio Content Template Builder.
- Guardar los `ContentSid` aprobados.
- No enviar templates reales hasta tener SIDs confirmados.

Plantillas futuras:

- `TWILIO_CONTENT_SID_CONFIRMACION`
- `TWILIO_CONTENT_SID_RECORDATORIO`
- `TWILIO_CONTENT_SID_CANCELACION`

## Troubleshooting

- `401` en preview: falta `x-vercel-protection-bypass` o el bypass no es valido.
- No llega inbound: revisar `When a message comes in`, metodo `POST`, dominio y token.
- Reply queda en mock: revisar `HOTEL_CONVERSATIONS_MOCK_TWILIO=false`.
- Falta remitente: definir `TWILIO_WHATSAPP_FROM` o `TWILIO_MESSAGING_SERVICE_SID`.
- Twilio rechaza sender: confirmar que el numero esta como WhatsApp Sender activo.
- Fuera de ventana 24 h: usar plantilla aprobada.
- Produccion sin panel protegido: definir `HOTEL_PANEL_USERNAME` y `HOTEL_PANEL_PASSWORD` antes de exponer.
