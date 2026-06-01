# Twilio WhatsApp Sandbox para Maternaly

Esta guia prepara Twilio Sandbox como canal temporal de WhatsApp en EasyPanel. Mantener el sistema en modo seguro: sin OpenAI real, sin escritura real en Sheets y sin pagos, facturas ni reservas reales.

## 1. Subcuenta Twilio

1. Crear una subcuenta Twilio separada para Maternaly.
2. Usar solo credenciales de esa subcuenta.
3. Activar WhatsApp Sandbox en la consola de Twilio.
4. Unir el telefono de prueba al Sandbox con el codigo que indique Twilio.

## 2. Variables EasyPanel

No secretas:

```text
WHATSAPP_PROVIDER=twilio
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_PROVIDER_MODE=sandbox
APP_BASE_URL=https://maternaly-chatbot-maternaly-chatbot.0yiwe.easypanel.host
LLM_PROVIDER=mock
GOOGLE_SHEETS_ACCESS_MODE=read_only
BOT_SHEETS_LIVE_WRITE_ENABLED=false
```

Secretas, sin imprimir valores:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WEBHOOK_AUTH_TOKEN
```

`TWILIO_WHATSAPP_FROM` debe ser el sender del Sandbox o el sender WhatsApp configurado por Twilio. Para Sandbox suele ser `whatsapp:+14155238886`.

## 3. Webhook Sandbox

Configurar el Sandbox inbound como:

```text
https://maternaly-chatbot-maternaly-chatbot.0yiwe.easypanel.host/api/twilio/whatsapp?token=<TWILIO_WEBHOOK_AUTH_TOKEN>
```

- Metodo: `POST`.
- Content type: `application/x-www-form-urlencoded`.
- Payload esperado de Twilio: `From`, `To`, `Body`, `MessageSid` y, si aplica, `NumMedia`.

Si `TWILIO_WEBHOOK_AUTH_TOKEN` esta definido, el endpoint exige `?token=...`, `x-twilio-webhook-token` o `x-hotel-webhook-token`. En produccion no dejar el webhook sin token.

## 4. Validacion

1. Redeploy de EasyPanel con la rama actual.
2. Comprobar `GET /api/health`.
3. Verificar:
   - `whatsapp.provider=twilio`
   - `whatsapp.twilio.configured=true`
   - `whatsapp.twilio.fromConfigured=true`
   - `whatsapp.twilio.webhookProtected=true`
   - `whatsapp.twilio.mode=sandbox`
4. Enviar `hola` desde el numero unido al Sandbox.
5. Confirmar que Twilio recibe TwiML con `<Response><Message>...`.
6. Abrir `/admin/conversations` y verificar que la conversacion aparece con canal `twilio_sandbox`, mensaje del usuario y respuesta del bot.
7. Revisar logs de EasyPanel sin imprimir secretos.

## Si no responde

1. Comprobar `GET /api/twilio/whatsapp`. Debe devolver JSON con `ok=true`, `expectedMethod=POST`, `provider=twilio`, `tokenConfigured=true` y `mode=sandbox`.
2. En Twilio Sandbox, confirmar que el webhook inbound apunta exactamente a `/api/twilio/whatsapp?token=<TWILIO_WEBHOOK_AUTH_TOKEN>` y que el metodo es `POST`.
3. Revisar `GET /api/health`: `whatsapp.provider=twilio`, `whatsapp.twilio.configured=true`, `fromConfigured=true`, `webhookProtected=true` y `mode=sandbox`.
4. Si Twilio muestra `401`, el token no coincide o falta en la URL/header. No imprimir el valor del token en logs ni capturas.
5. Si Twilio muestra `404` o `5xx`, confirmar que EasyPanel ha redeployado la rama actual y revisar los logs del contenedor buscando entradas `[twilio:webhook]`.
6. Si llega el webhook pero no aparece conversacion, verificar que `From`, `To`, `Body` y `MessageSid` llegan como `application/x-www-form-urlencoded`.
7. Repetir con un `MessageSid` nuevo. El mismo `MessageSid` se deduplica para evitar duplicados por reintentos de Twilio.

## 5. Guardrails

- Mantener `LLM_PROVIDER=mock`.
- Mantener `GOOGLE_SHEETS_ACCESS_MODE=read_only`.
- Mantener `BOT_SHEETS_LIVE_WRITE_ENABLED=false`.
- No activar OpenAI real.
- No activar Sheets live write.
- No activar pagos, facturas ni confirmaciones reales.
- No reutilizar Vercel ni el proyecto vivo de Somos Perros.

## 6. Prueba local segura

Con servidor local:

```bash
curl -X POST "http://127.0.0.1:3000/api/twilio/whatsapp?token=fake-token" \
  -H "content-type: application/x-www-form-urlencoded" \
  --data-urlencode "From=whatsapp:+34600000001" \
  --data-urlencode "To=whatsapp:+14155238886" \
  --data-urlencode "Body=Hola" \
  --data-urlencode "MessageSid=SM_LOCAL_SANDBOX_001"
```

Debe devolver XML TwiML. Repetir el mismo `MessageSid` no debe duplicar el mensaje inbound.
