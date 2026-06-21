# Maternaly Node live write test v1

## Objetivo

`npm run maternaly:sheets:live-write-test` ahora ejecuta un script Node puro:

```text
node scripts/maternaly-sheets-live-write-test.mjs
```

Esto evita el fallo productivo `sh: 1: tsx: not found`, porque el contenedor de
EasyPanel puede instalar solo `dependencies` y `tsx` vive en `devDependencies`.

## Seguridad por defecto

El script no escribe en Google Sheets si no estan activos todos estos flags:

```text
MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=true
GOOGLE_SHEETS_ACCESS_MODE=live
BOT_SHEETS_LIVE_WRITE_ENABLED=true
MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=live
MATERNALY_NORMALIZED_SHEETS_ENABLED=true
```

Si falta cualquiera, termina con skip seguro y exit code 0. No imprime secretos.

Tambien bloquea los IDs legacy/originales protegidos, validando siempre los
targets con IDs redactados en la salida y en los reportes.

## Escritura sintetica

Cuando todos los flags live estan presentes y los Sheets normalizados estan
configurados, el script intenta una fila sintetica por servicio:

- `charla_embarazo_1_20`
- `taller_blw`

Solo toca estas pestanas:

- `Clientes_Local`
- `Inscripciones`
- `Interacciones_Chatbot`

Antes de escribir, valida que las pestanas existen, lee headers y construye las
filas por nombre de columna. Si faltan columnas necesarias en un Sheet, ese
Sheet se aborta sin append.

En `Inscripciones`, el script exige columna compatible con `source/canal` y
`observaciones/notas` para que la marca sintetica quede visible.

Datos sinteticos usados:

```text
nombre: PRUEBA BOT CODEX NO CLIENTE REAL
telefono: +34999000111
email: prueba.bot.codex@example.test
source/canal: codex_live_write_test
marker: PRUEBA_BOT_CODEX_NO_CLIENTE_REAL
```

La idempotency key se genera como:

```text
PRUEBA_BOT_CODEX_NO_CLIENTE_REAL_<timestamp ISO compacto>
```

Cada ejecucion crea una key nueva. Para probar dedupe, se puede fijar:

```text
MATERNALY_SYNTHETIC_LIVE_WRITE_IDEMPOTENCY_KEY=PRUEBA_BOT_CODEX_NO_CLIENTE_REAL_<valor_controlado>
```

## Ejecucion en EasyPanel

1. Activar temporalmente los flags live de la seccion de seguridad.
2. Verificar que existen:

```text
MATERNALY_CHARLA_EMBARAZO_SHEET_ID
MATERNALY_BLW_SHEET_ID
```

3. Ejecutar:

```text
npm run maternaly:sheets:live-write-test
```

4. Revisar la salida JSON y el reporte generado en:

```text
reports/maternaly_sheets_live_write_test_<timestamp>.md
reports/maternaly_sheets_live_write_test_<timestamp>.json
```

## Vuelta a modo seguro

Despues de la prueba, volver a:

```text
MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=false
GOOGLE_SHEETS_ACCESS_MODE=dry_run
BOT_SHEETS_LIVE_WRITE_ENABLED=false
MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=dry_run
```

Mantener `MATERNALY_NORMALIZED_SHEETS_ENABLED=true` solo si el despliegue debe
seguir leyendo los Sheets normalizados en modo seguro.

## Validacion local esperada

En entornos locales sin flags live, el comando debe hacer skip seguro, no error,
y no debe intentar auth ni escritura real.
