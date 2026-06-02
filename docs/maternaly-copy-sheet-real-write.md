# Maternaly copy Sheet real-structure writes

Estado: demo copy-only. Nunca escribe en los Sheets originales.

## Sheets originales bloqueados

Estos IDs estan protegidos por codigo y no se aceptan como target de escritura:

- `163BD-...OfI`
- `1p74UI...5Do`

Si un target coincide con uno de estos IDs, el comando aborta antes de escribir.

## Variables necesarias

```bash
MATERNALY_COPY_SHEET_1_ID=<id-de-la-copia-1>
MATERNALY_COPY_SHEET_2_ID=<id-de-la-copia-2>
MATERNALY_REAL_STRUCTURE_WRITE_ENABLED=true
MATERNALY_REAL_STRUCTURE_WRITE_MODE=copy_only
MATERNALY_DEMO_PAYMENT_LINK=https://app.uelzpay.com/checkout/cml6qypoi00g0qy01fkfdapmh
```

Credenciales Google soportadas:

```bash
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=<json-base64>
GOOGLE_APPLICATION_CREDENTIALS=<path-json>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<email>
GOOGLE_PRIVATE_KEY=<private-key>
```

La service account debe tener rol Editor sobre las copias. No se debe compartir ni configurar el ID de los originales para escritura.

## Auditoria

```bash
npm run maternaly:sheets:copy-audit
```

Genera:

- `reports/maternaly_copy_sheets_write_audit_<timestamp>.md`
- `reports/maternaly_copy_sheets_write_audit_<timestamp>.json`

El informe redacta PII y detecta pestañas, encabezados, ultima fila valida, columnas candidatas, formulas, columnas no tocables, riesgos y mapping propuesto.

## Escritura demo

```bash
npm run maternaly:sheets:copy-write
```

La operacion es `append` sobre una nueva fila en la estructura real detectada. Antes de escribir intenta duplicar la pestaña objetivo con nombre:

`BACKUP_BOT_<YYYYMMDD_HHMM>_<TAB_NAME>`

Si no puede duplicar, crea snapshot JSON en `reports/`. Si no hay backup/snapshot, no escribe.

## Reglas de seguridad

- Solo `MATERNALY_REAL_STRUCTURE_WRITE_MODE=copy_only`.
- Solo IDs allowlisted en `MATERNALY_COPY_SHEET_1_ID` / `MATERNALY_COPY_SHEET_2_ID`.
- No usa `BOT_SHEETS_LIVE_WRITE_ENABLED` para saltar protecciones.
- No borra filas, columnas, formulas ni pestañas.
- No sobreescribe la ultima fila.
- No escribe pagos reales ni facturas reales.
- Si Google devuelve 403, se reporta como falta de permisos Editor.

## Revision de la fila

Tras ejecutar escritura real, revisar el report:

- `targetTab`
- `targetRange`
- `fields.status = RESERVA FIJADA PENDIENTE DE PAGO`
- `fields.payment = PENDIENTE`
- `fields.paymentMethod = UELZ`
- `fields.observations`

La fila debe estar en la copia, nunca en los originales.
