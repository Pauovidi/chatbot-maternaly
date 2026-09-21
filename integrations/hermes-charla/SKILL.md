---
name: maternaly-charla
description: Reserva una plaza confirmada en la charla de embarazo.
version: 0.2.0
author: PAU OVIDI MM, Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [Maternaly, reservas, Google Sheets, embarazo]
    related_skills: []
---

# Maternaly — Charla Informativa

Este skill escribe directamente en la hoja de Maternaly desde el contenedor de
Hermes. Solo cubre la Charla Informativa gratuita para embarazo de semanas 1 a
20. No sustituye la conversación: Hermes debe interpretar el contexto, elegir
la sesión publicada correcta y pedir confirmación antes de usarlo.

## Cuándo usarlo

Puedes usar su consulta de sesiones cuando necesites mostrar fechas publicadas
o traducir una fecha/sede a un identificador exacto. La escritura solo se usa
cuando la persona haya pedido reservar una sesión concreta y haya confirmado
inequívocamente la plaza. No lo uses para explicar la charla, cambiar de
servicio o responder a una duda general.

## Datos obligatorios

Antes de ejecutarlo deben estar confirmados:

- `sessionId`: el identificador exacto de la sesión publicada en `Sesiones`.
- `fullName`: nombre y apellidos.
- `phone`: teléfono de contacto.
- `peopleCount`: `1` o `2`.
- `partnerName`: obligatorio si `peopleCount` es `2`.
- `fppOrDueDate`: fecha probable de parto válida.
- `confirmed`: `true`, solo después de la confirmación final de la persona.

No inventes el identificador de sesión ni transformes una fecha aproximada en
una reserva. Si falta un dato, pregunta por él.

## Cómo ejecutarlo

Pasa un único objeto JSON por stdin al script:

```json
{
  "confirmed": true,
  "sessionId": "SES_CHARLA120_BILBAO_20261006",
  "fullName": "Nombre Apellidos",
  "phone": "+34600000123",
  "peopleCount": 1,
  "fppOrDueDate": "2027-04-05",
  "partnerName": ""
}
```

Usa `terminal` para ejecutar `/opt/data/skills/maternaly-charla/maternaly_charla.py`.
Para consultar sesiones, pasa `{"action":"list_sessions"}`. Para reservar,
pasa el objeto anterior. Añade `--dry-run` a la reserva para una comprobación
sin escritura.

## Controles que realiza

El script vuelve a consultar `Sesiones`, comprueba que la sesión existe, está
publicada y no ha pasado, valida el tramo gestacional 1–20, comprueba el aforo
cuando la hoja tiene una capacidad numérica, detecta duplicados por teléfono y
sesión y serializa las escrituras dentro del contenedor.

La consulta `list_sessions` es siempre de solo lectura y devuelve el
`sessionId` exacto junto con fecha, hora, sede y ocupación. No presentes una
reserva hasta haber seleccionado uno de esos identificadores.

Escribe la reserva en `Inscripciones`, crea el cliente solo si no existe en
`Clientes_Local` y añade la traza en `Interacciones_Chatbot`. La clave de
servicio se lee de `/opt/data/maternaly-google-service-account.json`; nunca la
muestres ni la incluyas en mensajes.

## Interpretación de la respuesta

- `ok: true, outcome: confirmed`: la fila se ha escrito; puedes confirmar la
  reserva a la persona.
- `ok: true, outcome: already_persisted`: ya existía; puedes comunicar que la
  reserva ya estaba registrada.
- `ok: true, outcome: dry_run`: solo se ha validado; no se ha reservado nada.
- `ok: false`: no confirmes la plaza. Explica el motivo en lenguaje natural y
  continúa el flujo o deriva a Maternaly.

No muestres el JSON técnico, identificadores internos, rutas ni trazas.

## Verificación

Para probar sin alterar datos, usa la misma carga con `--dry-run`. Una prueba
real requiere confirmación explícita del responsable y debe comprobar después
que aparece una sola fila en `Inscripciones`, el cliente correspondiente (si
era nuevo) y una interacción confirmada.
