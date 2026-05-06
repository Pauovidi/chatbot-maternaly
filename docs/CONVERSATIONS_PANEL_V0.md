# Panel de conversaciones V0/V0.1

## V0.1 visible demo

La pasada V0.1 hace que el panel sea revisable sin preparar datos manuales:

- Acceso visible desde el header publico con `Panel conversaciones` y `Conversaciones`.
- Acceso visible desde `/admin` con `Abrir panel de conversaciones`.
- Inbox de dos columnas: sidebar con marca, metricas, filtros, busqueda y lista; detalle tipo chat con timeline, eventos y composer.
- Auto-seed demo en local/test/Vercel preview cuando la store esta vacia.
- Cinco conversaciones sinteticas del hotel canino: disponibilidad, handoff humano, comida, vacunas y cancelacion.
- Aviso visible de Twilio mock: `Modo demo: los mensajes no se envian por WhatsApp real.`
- Produccion sigue bloqueada sin `HOTEL_PANEL_USERNAME` y `HOTEL_PANEL_PASSWORD`.

## Arquitectura

El panel es aditivo y no toca la store demo de reservas. Las conversaciones viven en un subdominio separado:

- `src/lib/hotel/conversations/types.ts`: `Conversation`, `Message`, `ConversationEvent`.
- `src/lib/hotel/conversations/store.ts`: interfaz `ConversationStore`.
- `src/lib/hotel/conversations/file-store.ts`: store demo no durable en `/tmp/hotel-conversations.json`.
- `src/lib/hotel/conversations/service.ts`: inbound, handoff, modo bot/human, reply manual y mark-read.
- `src/lib/hotel/conversations/auth.ts`: Basic Auth del panel y APIs admin.
- `src/lib/hotel/twilio/client.ts`: outbound WhatsApp por Twilio REST o mock.

La persistencia es intencionadamente demo/no durable. Para produccion real debe sustituirse `ConversationStore` por DB/KV sin mezclarla con reservas.

## Rutas UI

- `GET /admin/conversations`: inbox operativo con listado, filtros, detalle, timeline, cambio bot/human, mark-read y composer manual.
- Accesos visibles: header publico, navegacion demo y card en `/admin`.

## Rutas API

Todas las rutas admin requieren Basic Auth:

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id`
- `POST /api/conversations/:id/reply`
- `POST /api/conversations/:id/mode`
- `POST /api/conversations/:id/mark-read`
- `POST /api/conversations/:id/messages` alias para reply manual.
- `GET /api/conversations/events` para eventos agregados del panel.

Webhook inbound Twilio:

- `POST /api/twilio/whatsapp`

## Variables de entorno

Panel:

- `HOTEL_PANEL_USERNAME`
- `HOTEL_PANEL_PASSWORD`
- `HOTEL_PANEL_ALLOW_LOCAL_AUTH_BYPASS=true` solo para local si hace falta.

Sin credenciales, local/test y Vercel preview permiten acceso practico para revision de demo. En produccion sin credenciales, el panel y las APIs admin quedan bloqueados.

Conversaciones:

- `HOTEL_CONVERSATIONS_STORE_PATH` opcional. Por defecto usa `/tmp/hotel-conversations.json`.
- `HOTEL_CONVERSATIONS_DEMO_SEED=true` fuerza seed demo si la store esta vacia.

Auto-seed:

- Local/test: si la store esta vacia, se crean conversaciones demo sinteticas.
- Vercel preview: si la store esta vacia, se crean conversaciones demo sinteticas.
- Produccion: no hay auto-seed salvo `HOTEL_CONVERSATIONS_DEMO_SEED=true`.

Twilio:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_VALIDATE_SIGNATURES` reservado para endurecer validacion.
- `TWILIO_WEBHOOK_AUTH_TOKEN` opcional. Si se define, el webhook exige `?token=` o header `x-hotel-webhook-token`.
- `HOTEL_CONVERSATIONS_MOCK_TWILIO=true|false`

Si faltan credenciales Twilio o `HOTEL_CONVERSATIONS_MOCK_TWILIO=true`, el reply manual usa mock y no llama a Twilio.

## Configurar Twilio real

1. Define `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_WHATSAPP_FROM`.
2. Pon `HOTEL_CONVERSATIONS_MOCK_TWILIO=false`.
3. En Twilio, configura el webhook WhatsApp como:

   `POST https://<dominio>/api/twilio/whatsapp`

4. Si usas `TWILIO_WEBHOOK_AUTH_TOKEN`, configura la URL con `?token=<valor>` o añade el header desde tu capa proxy.

## Comportamiento bot/human

- Inbound en `mode=bot`: guarda inbound, incrementa no leidos y responde con la FAQ determinista del hotel.
- Frases de handoff como `persona`, `agente`, `humano`, `hablar con alguien`, `que me llamen`, `atencion` o `responsable`: cambia a `mode=human`, marca `humanRequested` y responde con copy seguro.
- Inbound en `mode=human`: guarda inbound, incrementa no leidos y registra `auto_reply_skipped_human_mode` sin respuesta automatica.
- Reply manual: envia por Twilio real o mock, guarda outbound humano, asigna agente y limpia no leidos.
- Fallo Twilio: no lanza 500 desde el servicio; registra `manual_reply_failed` y el panel muestra error.

## Seed demo

```bash
npm run hotel:conversations:seed
```

El seed incluye cinco conversaciones sinteticas del hotel canino: disponibilidad, handoff humano, comida, vacunas y cancelacion.

## Tests

```bash
npm run lint
npm run test:run
npm run build
npm run smoke
```

Para smoke HTTP local:

```bash
npm run dev
npm run smoke:http
```

Cobertura especifica preparada por `subagente_tests_security`:

- `src/lib/hotel/conversations/conversations-seed.test.ts`: contrato del seed, redaccion de email/telefono/token y escritura aislada.
- `src/lib/hotel/conversations/conversations-security.test.ts`: Basic Auth del panel, guardas `requirePanelAuth` en rutas admin, escape TwiML y rechazo del webhook Twilio con token invalido.
- `src/lib/hotel/security/secret-hygiene.test.ts`: `.gitignore` para secretos locales y comprobacion de que el seed no referencia `.env.local`, `.tokens/`, `.vercel/` ni service-account JSON.

Queda como `it.todo` convertir en test activo que `/admin/conversations` invoque `verifyPanelPageAccess` cuando el panel server-side pueda responder con challenge/redirect sin romper el render.

## Limitaciones

- `/tmp` no es durable en serverless y puede perder datos entre instancias o despliegues.
- No hay validacion criptografica de firma Twilio todavia; `TWILIO_WEBHOOK_AUTH_TOKEN` es una proteccion alternativa simple.
- El bot inbound usa FAQ/handoff seguro; no crea ni cancela reservas desde WhatsApp.
- La store de reservas en `/tmp` queda aparcada hasta aprobacion de la demo, como estaba decidido.
