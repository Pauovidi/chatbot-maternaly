# Pagos y facturas

No hay integracion real de pago ni factura en este sprint.

Estados preparados:

- payment_link_sent
- payment_pending
- payment_confirmed
- reservation_confirmed
- invoice_pending
- invoice_sent
- invoice_failed
- retroactive_invoice_sweep_pending

Reglas:

- no enviar link de pago si no existe fuente fiable.
- no confirmar plaza sin pago confirmado.
- no decir que una factura esta enviada sin evento real.

Stub pendiente:

- detectar pagos confirmados sin factura enviada.
- crear tarea `invoice_pending`.
- no enviar factura real sin provider configurado.
