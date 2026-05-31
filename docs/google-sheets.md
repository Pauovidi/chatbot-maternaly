# Google Sheets Maternaly

Sheets configurados:

- `163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI`
- `1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do`

## Acceso

La service account debe compartirse con cada Sheet. En este sprint el estado esperado es Lector.

Si no hay service account en entorno, `npm run maternaly:sheets:audit` intenta lectura read-only por export CSV publico. Si no esta permitido, sigue con fixtures y reporta la falta de credenciales.

## Auditoria

```bash
npm run maternaly:sheets:audit
```

Genera:

- `reports/maternaly_sheets_audit_<YYYYMMDD_HHMM>.md`
- `reports/maternaly_sheets_audit_<YYYYMMDD_HHMM>.json`

El informe redacta nombres, telefonos, emails y DNI/NIF probables.

## Escritura

La escritura real solo podra activarse en el futuro si se cumplen todas:

- permisos Editor confirmados.
- `GOOGLE_SHEETS_ACCESS_MODE=live`.
- `BOT_SHEETS_LIVE_WRITE_ENABLED=true`.
- target permitido como `TEST_BOT_WRITES`.
- `WritePlan` validado.
- columnas seguras identificadas.

No se escribe si el schema es ambiguo, faltan servicio/horario/contacto/personas, hay formulas, o no existe una estrategia append-only segura.
