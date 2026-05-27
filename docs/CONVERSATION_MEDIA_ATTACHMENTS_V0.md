# Adjuntos de video en conversaciones V0

## Estado actual

- El outbound manual del panel de conversaciones es solo texto.
- La opcion visible de video en el composer es mock: registra la intencion operativa y no envia WhatsApp real.
- No hay subida real de videos, no se guardan binarios y no se genera `MediaUrl` para Twilio.
- El inbound de Twilio puede recibir mensajes con media y registrar una entrada sintetica si no hay texto, pero el sistema no persiste binarios ni URLs de media.
- Las conversaciones desplegadas en Vercel no tienen storage de archivos.
- EasyPanel sigue siendo el destino final de produccion, pero esta tarea no lo modifica.

## Arquitectura recomendada para adjuntos reales

No guardar videos en DB. La base de datos o store de conversaciones debe guardar solo metadata:

- `mediaId`
- `conversationId`
- `messageId`
- `fileName`
- `mimeType`
- `sizeBytes`
- `storageProvider`
- `storageKey`
- `publicOrSignedUrl`
- `twilioMediaSid`
- `direction`
- `createdAt`

Los binarios deben guardarse en Object Storage. El envio por Twilio debe usar una `MediaUrl` accesible por Twilio, idealmente una URL publica temporal o firmada con caducidad suficiente para el fetch de Twilio.

Antes de activar envio real:

- Validar tipo MIME y extension.
- Limitar tamano maximo.
- Limitar formatos a los compatibles con WhatsApp/Twilio.
- Escanear o bloquear formatos no esperados.
- Separar permisos de lectura internos y URLs de envio externo.
- Registrar errores de subida, firma y envio como eventos de conversacion.

## Recomendacion Vercel / EasyPanel

La opcion mas sencilla y portable para este proyecto es Cloudflare R2 o un S3 compatible externo. Reduce mantenimiento, funciona tanto desde Vercel como desde EasyPanel y evita meter storage pesado dentro del VPS.

Si el cliente quiere que todo viva dentro del VPS, la alternativa self-hosted es MinIO en EasyPanel. En ese caso conviene montarlo como servicio separado, con volumen persistente, backups y rotacion/limpieza de objetos.

Recomendacion por defecto: Cloudflare R2. Recomendacion condicionada: MinIO solo si el requisito de infraestructura es mantener todos los archivos dentro del VPS del cliente.

## Siguiente sprint real

1. Crear proveedor `MediaStorage` con implementacion R2/S3.
2. Ampliar el modelo de mensajes con `attachments`.
3. Crear endpoint protegido para solicitar subida firmada.
4. Guardar metadata del adjunto tras subida validada.
5. Ampliar sender Twilio a `sendMessage({ to, body, mediaUrl })`.
6. Renderizar adjuntos inbound/outbound en timeline.
7. Cubrir con tests de permisos, MIME, tamano, metadata y no persistencia de binarios.
