# Client Directory Google Sheets V0

## Decisión

El directorio de clientes existentes vive en Google Sheets, en una pestaña separada llamada `CLIENTES`. No se usa Supabase ni una base de datos intermedia para clientes.

La app sigue compatible con Vercel: reutiliza `HOTEL_GOOGLE_SHEETS_SPREADSHEET_ID` y las credenciales Google ya existentes.

## Schema

Cabeceras esperadas:

```txt
activo
fecha_alta
fecha_baja
nombre
nif
telefono_fijo
telefono_movil
telefono_normalizado
email
notas
bloqueado_no_reservar
origen
updated_at
```

`nif` puede existir en la hoja operativa, pero no se proyecta al panel, eventos ni logs.

## Reconocimiento

El servicio normaliza:

- Teléfono: `whatsapp:+34682621177`, `+34 682 62 11 77`, `682621177` y `34682621177` comparan como `34682621177`.
- Email: `trim().toLowerCase()`.
- Nombre: minúsculas, sin acentos, espacios colapsados.

Reglas:

- teléfono/email: `strong`
- nombre exacto: `medium`
- nombre aproximado: `weak`
- varios matches: `ambiguous`
- notas peligrosas o `bloqueado_no_reservar=true`: `blocked`

Notas peligrosas detectadas: `NO COGER RESERVA`, `NO COGER RESERVAS`, `INFORMAL`, `NO VINO`.

## Uso En WhatsApp Y Panel

En cada inbound de Twilio se resuelve el teléfono contra `CLIENTES`.

Si hay match fuerte:

- se persiste `clientStatus=known`
- se persiste `clientName`
- se crea evento `client_directory_match`
- el panel muestra `Cliente habitual`

Si está bloqueado:

- se persiste `clientStatus=blocked`
- se marca `mode=human`
- se activa `humanRequested` y `requiresManualReview`
- se crea evento `client_directory_blocked`
- el bot responde: `Gracias, revisamos tu solicitud con el equipo y te contestamos por aqui.`

Si no existe la pestaña o está vacía, el flujo no rompe: el resultado es `unknown` y el panel muestra `Nuevo contacto`.

## Importación Segura

Archivos reales de clientes nunca deben commitearse. Están ignorados:

- `local-data/`
- `exports/`
- `imports/`
- `*.pdf`
- `*clientes*.csv`
- `*clientes*.tsv`

Comandos:

```powershell
npm run clients:ensure-sheet
npm run clients:import -- --file ./local-data/clientes.csv --dry-run
npm run clients:import -- --file ./local-data/clientes.csv --apply
npm run clients:import:pdf -- --file "../BBDD clientes.pdf" --dry-run
```

El import CSV/TSV imprime solo métricas agregadas. En `--apply`, primero duplica `CLIENTES` a `CLIENTES_BACKUP_<fecha>` y luego escribe la hoja.

El import PDF es solo preflight sin OCR: intenta extraer texto con `pdftotext` y no aplica cambios.

## REGISTRO_ENTRADA

No se ha encontrado una pestaña equivalente consolidada. Diseño pendiente para una siguiente pieza ligera:

```txt
created_at
source
action_type
client_status
client_name
phone_normalized
pet_name
check_in
check_out
reservation_id
decision
reason
human_notes
processed_by_team
processed_at
```

Esta pieza debe reutilizar la trazabilidad actual sin romper la escritura mensual de reservas.

## Pendiente

- Importar datos reales a `CLIENTES` desde CSV/TSV validado.
- Revisar manualmente duplicados y bloqueados antes de demo con cliente.
- Añadir enlace profundo a Google Sheets cuando se tenga `gid` de la pestaña.
- Implementar `REGISTRO_ENTRADA` si el cliente lo quiere visible en la demo.
