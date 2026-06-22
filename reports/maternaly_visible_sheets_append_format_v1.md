# Maternaly visible Sheets append format v1

## Estado

- Repo verificado: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Remote verificado: `https://github.com/Pauovidi/chatbot-maternaly.git`
- Rama base: `codex/maternaly-contextual-contact-data-v1`
- Rama de trabajo: `codex/maternaly-visible-sheets-append-format-v1`
- Escritura real en Google Sheets durante esta ejecucion: no
- Deploy/restart durante esta ejecucion: no

## Causa raiz

Las filas append existian en Google Sheets y eran localizables con busqueda, pero quedaban visualmente invisibles porque el append podia heredar formato de filas vacias de plantilla, por ejemplo texto blanco sobre fondo blanco. La escritura logica era correcta; faltaba normalizar el formato visible del rango escrito.

## Cambios

- Tras un append real con `updatedRange`, el cliente aplica `spreadsheets.batchUpdate` con `repeatCell` sobre el rango escrito.
- El formato aplicado es minimo y no agresivo:
  - `userEnteredFormat.textFormat.foregroundColor` negro `{ red: 0, green: 0, blue: 0 }`
  - no cambia fondo
  - no toca headers, porque solo procesa rangos append con fila mayor que 1
- Se formatea solo el rango devuelto por Google, por ejemplo:
  - `Clientes_Local!A5:P5`
  - `Inscripciones!A5:P5`
  - `Interacciones_Chatbot!A5:O5`
- Si el formato falla despues de un append correcto:
  - la escritura sigue marcada como aplicada
  - se reporta `formatApplied=false`
  - se rellena `formatWarnings`
  - no se convierte en fallo de escritura
- En dry-run no hay append y no se llama a batchUpdate.
- El script `scripts/maternaly-sheets-live-write-test.mjs` usa el mismo comportamiento para append live real.

## Resultado de escritura

Los resultados de escritura incluyen:

- `updatedRanges`
- `formattedRanges`
- `formatApplied`
- `formatWarnings`

El evento seguro del core tambien expone esos campos sin PII ni Sheet IDs completos.

## Tests

- Helper TS de formato visible sobre rango append.
- Parser A1 para rangos con y sin comillas.
- Dry-run sin append ni formato.
- Live write normalizado con `formattedRanges` y `formatApplied=true`.
- Warning de formato no fatal con append aplicado.
- Script `.mjs` con fake Sheets: append aplicado y 3 batchUpdate de formato intentados.
- Script `.mjs` con fallo de formato: append aplicado y warnings seguros.

## Validacion local

- `npm.cmd run lint`: OK
- `npm.cmd run test:run`: OK, 65 files passed, 428 tests passed, 1 todo
- `npm.cmd run build`: OK
- `npm.cmd run maternaly:health`: OK local
- `npm.cmd run maternaly:sheets:live-write-test`: exit 0, `skipped=true`, `reason=missing_required_live_flags`, `liveWriteAttempted=false`, `appendApplied=0`, `formattedRanges=[]`, `formatApplied=false`

## Como probar en WhatsApp

Secuencia:

```text
reiniciar
quiero reservar taller blw
3
PAU PRUEBAS, prueba.bot@example.test, voy en pareja, fecha 31/12/2026
```

Esperado tras deploy/restart de esta rama en el entorno real:

- La solicitud llega a escritura si las flags live reales estan activas.
- La nueva fila debe verse con texto negro en:
  - `Clientes_Local`
  - `Inscripciones`
  - `Interacciones_Chatbot`
- La plaza sigue pendiente de validacion; no se confirma plaza pagada.

## Dry-run seguro

Para mantener dry-run, no activar simultaneamente todas estas flags:

- `MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=true`
- `MATERNALY_NORMALIZED_SHEETS_ENABLED=true`
- `MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=live`
- `GOOGLE_SHEETS_ACCESS_MODE=live`
- `BOT_SHEETS_LIVE_WRITE_ENABLED=true`

Si falta alguna, `maternaly:sheets:live-write-test` debe seguir en skip seguro y no llamar a append ni batchUpdate.
