# Maternaly demo flow Sheets fixes v1

## Resumen

Esta rama estabiliza tres puntos de la demo Maternaly:

- El runner Docker ahora incluye `scripts/maternaly-sheets-live-write-test.mjs`.
- El flujo BLW/Charla ya no selecciona sesion por tokens genericos como `blw`, `taller`, `charla` o `embarazo`.
- Cancelaciones, cambios de fecha/sede, reagendamientos, pagos, facturas, justificantes y devoluciones pasan a humano sin escritura en Sheets.

## Causa del fallo Docker script

El comando productivo era correcto:

```text
npm run maternaly:sheets:live-write-test
```

pero el runner del Dockerfile solo copiaba:

```text
scripts/db-migrate.mjs
```

Por eso EasyPanel podia fallar con:

```text
Cannot find module '/app/scripts/maternaly-sheets-live-write-test.mjs'
```

Ademas, `next output standalone` no garantiza que un script externo al bundle de
Next tenga disponibles todas sus dependencias, asi que el runner copia
`node_modules` de produccion instalado con `npm ci --omit=dev`.

## Causa del salto prematuro a pedir datos

La seleccion de sesion aceptaba un fallback por tokens presentes en el nombre de
la sesion o grupo. Por ejemplo, `quiero reservar taller blw` podia coincidir con
`Taller BLW Bilbao` y seleccionar una sesion sin que la usuaria hubiera elegido
opcion, fecha o sede inequivoca.

## Reglas de seleccion de sesion

Ahora el bot selecciona sesion solo si:

- Ya habia `selectedSessionId` en el estado.
- Hay exactamente una sesion disponible.
- La usuaria elige un ordinal claro: `opcion 1`, `1`, `la primera`.
- Una fecha reconocible reduce a una unica sesion disponible.
- Una sede o modalidad clara reduce a una unica sesion disponible.

Si hay varias sesiones y no hay seleccion inequivoca, responde con opciones y
pide elegir antes de pedir datos personales.

Si llegan datos personales sin sesion elegida, no cierra la solicitud: vuelve a
listar opciones y pide eleccion.

## Reglas de handoff

El bot puede ayudar con nuevas solicitudes de BLW y Charla. En cambio, deriva a
humano sin escritura en Sheets cuando detecta:

- cancelar, anular o darse de baja
- cambiar fecha, cambiar sede o reagendar
- no puedo ir
- devolucion
- pago o enlace de pago
- factura o justificante

Copy esperado:

```text
Para cambios de fecha o cancelaciones lo revisa directamente el equipo de Maternaly. Te paso con una persona para hacerlo con seguridad.
```

Queda registrado evento interno `maternaly_handoff_required` con motivo seguro.

## Como probar en WhatsApp

1. Reiniciar:

```text
reiniciar
```

2. Pedir BLW:

```text
quiero reservar taller blw
```

Respuesta esperada: lista de opciones, no peticion de datos todavia.

3. Elegir opcion:

```text
opcion 1
```

Respuesta esperada: pide campos concretos.

4. Enviar datos sinteticos:

```text
Soy PRUEBA BOT BLW, telefono +34999000111, email prueba.bot.blw@example.test. Vamos 2 personas. La fecha de nacimiento del bebe es 2025-01-15.
```

En modo `dry_run`, respuesta esperada: solicitud preparada para revision, sin
plaza confirmada.

## Live write test en EasyPanel

Ejecutar:

```text
npm run maternaly:sheets:live-write-test
```

Flags temporales requeridos para escritura sintetica real:

```text
MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=true
GOOGLE_SHEETS_ACCESS_MODE=live
BOT_SHEETS_LIVE_WRITE_ENABLED=true
MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=live
MATERNALY_NORMALIZED_SHEETS_ENABLED=true
```

Despues de la prueba, volver a:

```text
MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=false
GOOGLE_SHEETS_ACCESS_MODE=dry_run
BOT_SHEETS_LIVE_WRITE_ENABLED=false
MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=dry_run
```

## Seguridad

- No se activan escrituras live por defecto.
- Los Sheets legacy/originales siguen bloqueados.
- No se imprimen secretos.
- Los datos de prueba usan `PRUEBA_BOT_CODEX_NO_CLIENTE_REAL`.
- No se hace deploy ni restart desde esta rama.
