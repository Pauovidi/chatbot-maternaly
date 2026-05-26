# Client Directory PDF Import V0

## Objetivo

Plan B para poblar `CLIENTES` desde `BBDD clientes.pdf`, sin copiar el PDF al repo, sin imprimir PII y sin escribir directo en producción.

## Método Usado

`pdftotext` no está disponible en este Windows. El fallback fiable es Python con PyMuPDF (`fitz`), que extrae palabras con coordenadas `x/y`.

El PDF tiene texto extraíble y no requiere OCR.

## Comandos

Dry-run PDF, solo métricas:

```powershell
npm run clients:import:pdf -- --file "..\..\BBDD clientes.pdf" --dry-run
```

Export local ignorado para revisión:

```powershell
npm run clients:import:pdf -- --file "..\..\BBDD clientes.pdf" --dry-run --export-csv --output "local-data\clientes-import-sanitized-output.csv"
```

Validar CSV generado sin escribir:

```powershell
npm run clients:import -- --file "local-data\clientes-import-sanitized-output.csv" --dry-run
```

Subir a staging cuando existan credenciales Google en el entorno:

```powershell
npm run clients:ensure-sheet
npm run clients:import -- --file "local-data\clientes-import-sanitized-output.csv" --apply --staging
```

Aplicar a `CLIENTES` solo tras revisar staging/export:

```powershell
npm run clients:import -- --file "local-data\clientes-import-sanitized-output.csv" --apply
```

El apply crea `CLIENTES_BACKUP_<fecha>` antes de limpiar/escribir `CLIENTES`.

## Dry-Run Real Sanitizado

Resultado del PDF real:

```json
{
  "pdfFound": true,
  "extractionMethod": "python_pymupdf_words",
  "pagesDetected": 92,
  "totalRowsDetected": 3392,
  "parsedRows": 3392,
  "validRows": 3392,
  "validPhones": 3150,
  "validEmails": 3268,
  "rowsWithoutContact": 62,
  "duplicatePhones": 122,
  "duplicateEmails": 62,
  "blockedWarnings": 6,
  "ambiguousRows": 184,
  "rejectedRows": 0,
  "parseConfidencePct": 100
}
```

No se imprimen nombres, teléfonos, emails, NIF ni filas.

## Seguridad

- El PDF permanece fuera del repo.
- El CSV generado queda en `local-data/`, ignorado por Git.
- El CLI rechaza `--output` fuera de `local-data/`, `imports/` o `exports/`.
- `clients:import:pdf` no tiene apply directo a Sheets.
- `NIF` puede viajar en CSV/import para conservar la columna operativa, pero no entra en `ClientRecord` runtime ni panel/eventos.

## Umbral

Solo se permite export local si `parseConfidencePct >= 90`.

Si baja del 90%:

- no exportar para apply,
- pedir CSV/Excel al cliente,
- o ajustar parser con fixtures sintéticas.

## Estado

El CSV local revisable se generó correctamente, pero no se pudo crear staging ni `CLIENTES` porque falta `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID` en el entorno del script.
