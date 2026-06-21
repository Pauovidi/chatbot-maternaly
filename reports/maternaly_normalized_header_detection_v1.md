# Maternaly normalized header detection v1

## Root cause

The normalized Sheets parser was treating the first non-empty row as the header row. Some operational Maternaly templates use visual rows before the real table headers, so tabs such as `Sesiones` can look like:

1. Row 1: visual title, for example `Sesiones`
2. Row 2: visual help or description
3. Row 3: real headers, for example `sesion_id`, `grupo_id`, `servicio_id`, `fecha`, `hora_inicio`, `hora_fin`, `capacidad_total`, `estado`
4. Row 4 and below: actual session data

Because the title row was interpreted as headers, BLW availability lost date, time, location and capacity fields, and WhatsApp fell back to generic options such as `Taller BLW (disponibilidad a validar)`.

## Parser changes

- Added header-row auto-detection in `src/lib/maternaly/sheets/normalized-template.ts`.
- The detector scans the first 20 rows and scores candidates by recognized normalized column aliases.
- Detection uses tab-specific expectations for `Sesiones`, `Grupos_Ediciones`, `Clientes_Local`, `Inscripciones`, `Interacciones_Chatbot` and `Servicio_Config`.
- `rowsToObjects` now returns `headerRowIndex`, `headerRowNumber`, `headers`, `normalizedHeaders`, `rows` and a safe `parseError` when no valid header is found.
- Existing row-1 headers remain supported.
- Visual title/help rows are no longer accepted as headers when real normalized columns are missing.

## Node live-write script changes

- `scripts/maternaly-sheets-live-write-test.mjs` now contains an equivalent header detector.
- The logic is duplicated intentionally so the production script can continue running with plain `node` and does not depend on `tsx`.
- The script still validates required columns by normalized name, blocks protected legacy Sheet IDs, redacts Sheet IDs, skips safely when live flags are missing, and avoids printing secrets.
- If shifted headers cannot be detected, service processing returns a safe `skipped_header_not_found` status with per-tab parse errors.

## Safe diagnostics

The normalized WhatsApp flow now adds short diagnostic codes to the internal `maternaly_tool_executed` event where applicable:

- `missing_tab`
- `header_not_found`
- `missing_required_columns`
- `read_error`
- `unknown_capacity`
- `no_sessions_available`

These diagnostics are code-level labels only. They do not include secrets, full Sheet IDs or real customer data.

## Tests added or updated

- Header detection works when real headers are on row 3 below title/help rows.
- Row-1 normalized headers still work.
- `Sesiones` shifted headers parse `fecha`, `hora_inicio`, `hora_fin` and `capacidad_total`.
- Shifted BLW fixtures list real sessions with date, time, center, capacity and available seats.
- BLW 14-seat fixtures show 14 available seats with no registrations.
- Occupying registrations reduce shifted-template availability from 14 to 13.
- Missing real headers do not use visual titles as headers and return safe parse errors.
- The `.mjs` live-write parser detects shifted headers and rejects visual-only rows.
- WhatsApp flow for `quiero reservar taller blw` lists real date/time/location/seats and does not show `disponibilidad a validar` when fixture data is present.

## WhatsApp smoke test

Use synthetic data only:

1. Send `reiniciar`
2. Send `quiero reservar taller blw`
3. Confirm the bot lists options with dates, times, locations and seat counts, for example `2026-09-25 17:00 Taller BLW Bilbao (14 plazas disponibles)`
4. Send `opcion 1`
5. Send synthetic contact data only, never real customer data

Expected result: the bot prepares a request for review and does not claim a confirmed paid place unless a real validated write path is enabled.

## EasyPanel live-write test

After deploying this branch through the normal safe process, run:

```bash
npm run maternaly:sheets:live-write-test
```

The script should skip with exit 0 unless all explicit live flags are present. For a temporary synthetic live-write test, the environment must already be configured with the required live flags and allowlisted normalized Sheet IDs. Do not point the script at legacy originals.

Relevant flag names:

- `MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE`
- `MATERNALY_NORMALIZED_SHEETS_ENABLED`
- `MATERNALY_NORMALIZED_SHEETS_WRITE_MODE`
- `GOOGLE_SHEETS_ACCESS_MODE`
- `BOT_SHEETS_LIVE_WRITE_ENABLED`
- `MATERNALY_NORMALIZED_SHEET_IDS`
- `MATERNALY_CHARLA_EMBARAZO_SHEET_ID`
- `MATERNALY_BLW_SHEET_ID`

To return to dry-run, disable synthetic live writes and set normalized write mode back to dry-run or disable the bot live-write flag. Keep normalized Sheet IDs allowlisted only for the intended current normalized copies.

## Deployment note

No EasyPanel deploy or restart was performed from this task. The intended handoff is the pushed Git branch after local validation.
