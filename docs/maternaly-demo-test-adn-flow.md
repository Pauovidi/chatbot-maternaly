# Maternaly demo Test ADN / Detesex flow

Estado: flujo cerrado de demo para WhatsApp, API interna y CLI.

## Comando

```bash
npm run maternaly:demo-flow:test-adn
```

Simula:

1. `Quiero reservar Test ADN`
2. `Bilbao`
3. `Erika Ramirez, erika@test.com`
4. `Si`

Si no hay copias o credenciales, el flujo mantiene dry-run/write-plan y reporta que la escritura queda pendiente de revision humana.

## API interna de simulacion

`POST /api/maternaly/demo-flow/test-adn`

Esta ruta no ejecuta escritura real. Devuelve el flujo conversacional y el plan simulado para poder probar la demo sin tocar Sheets.

Payload ejemplo:

```json
{
  "phone": "+34600000123",
  "messages": [
    "Quiero reservar Test ADN",
    "Bilbao",
    "Erika Ramirez, erika@test.com",
    "Si"
  ]
}
```

## WhatsApp

El webhook de Twilio/YCloud usa el mismo flujo y guarda el estado en eventos de la conversacion:

- `maternaly_test_adn_demo_state`
- `maternaly_test_adn_write_plan`

No requiere Postgres si el store de conversaciones esta en Google Sheets demo.

## Escritura real controlada

La ejecucion real desde Vercel se hace solo con token administrativo:

- `GET|POST /api/maternaly/admin/sheets/copy-audit`
- `POST /api/maternaly/admin/demo-flow/test-adn-write`

Ambas rutas requieren `MATERNALY_ADMIN_TASK_TOKEN` por `Authorization: Bearer <token>` o `x-maternaly-admin-task-token`. Las respuestas redactan IDs de Sheet y datos de cliente.

## Calculo correlativo

Para Test ADN / Detesex:

- toma la ultima fila valida no cancelada como referencia;
- no reutiliza esa fecha/hora;
- calcula `fecha_propuesta = fecha_ultima_fila + 4 dias`;
- usa hora fija `18:20`;
- usa la sede detectada como predeterminada, pero pregunta Bilbao / Erandio.

Ejemplo:

- ultima fila: `04/06/2026 17:10 BILBAO DETESEX`
- propuesta: `08/06/2026 18:20 BILBAO`

## Lenguaje permitido

Permitido:

- `reserva fijada pendiente de pago`
- `para completar la reserva, realiza el pago en este enlace`

Prohibido:

- `reserva confirmada`
- `pago confirmado`
- `factura enviada`
- `plaza confirmada`

## Pago y factura

Durante esta fase el enlace Uelz es fijo:

`https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh`

La factura no se marca como emitida. Si la usuaria pide factura, el bot responde que queda anotado para que el equipo la revise y la emita cuando el pago este validado.
