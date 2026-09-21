---
name: maternaly-charla
description: Reserva plazas en la Charla Informativa gratuita de Maternaly (embarazo, semanas 1–20) mediante el endpoint protegido de Maternaly.
---

# Maternaly — Charla Informativa

Este skill es una operación de escritura controlada. Solo sirve para la
Charla Informativa gratuita de embarazo (semanas 1–20) y delega en Maternaly
la comprobación de sesión, fechas, elegibilidad, cupos, duplicados e
idempotencia antes de tocar Google Sheets.

## Reglas obligatorias

1. No lo uses para explicar la charla, consultar disponibilidad, cambiar de
   servicio ni responder a una duda.
2. Recoge y confirma explícitamente con la persona: sesión concreta, nombre y
   apellidos, teléfono, número de asistentes, acompañante si son dos y fecha
   probable de parto.
3. Solo llama al script después de una confirmación inequívoca (por ejemplo,
   “Sí, confirma la reserva de la sesión del 6 de octubre”). Envía
   `confirmed: true` únicamente en ese momento.
4. Nunca inventes `sessionId`, fechas, sedes, cupos ni elegibilidad. Usa los
   datos devueltos por la conversación o pide la información que falte.
5. Si la respuesta no contiene `ok: true`, no digas que la reserva se ha
   realizado. Explica el motivo y continúa conversando o deriva a Maternaly.
6. No muestres tokens, URL internas, trazas ni el JSON técnico a la persona.

## Uso

Ejecuta `/opt/data/skills/maternaly-charla/maternaly_charla.py` pasando un único
objeto JSON por stdin. El script añade `action: "reserve"` y `source:
"hermes"` si faltan; el resto de campos debe proceder de la conversación:

```json
{
  "confirmed": true,
  "sessionId": "ID_DEVUELTO_POR_MATERNALY",
  "fullName": "Nombre Apellidos",
  "phone": "+34600000123",
  "email": "opcional@example.com",
  "peopleCount": 1,
  "partnerName": "opcional si peopleCount es 2",
  "fppOrDueDate": "2027-03-01",
  "pregnancyWeek": 12,
  "notes": "opcional"
}
```

La respuesta `ok: true` significa que la fila fue persistida o que ya estaba
registrada (idempotencia). Cualquier otro resultado no es una
confirmación de plaza.
