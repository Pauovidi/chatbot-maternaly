# Maternaly WhatsApp Availability Critical Tabs v1

## Scope

- Repo: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Base branch: `codex/maternaly-whatsapp-blw-availability-runtime-fix-v1`
- Work branch: `codex/maternaly-whatsapp-availability-critical-tabs-v1`
- Base commit: `5e96c9995ffe715c8594bead3c0d55ff2feaafad`
- Remote: `https://github.com/Pauovidi/chatbot-maternaly.git`

## Root Cause

`getNormalizedServiceAvailability()` was using the full normalized service snapshot and returned `ok=false` with `reason=header_not_found` for parse errors in any tab. That meant WhatsApp BLW availability could be blocked by non-critical tabs such as `Servicio_Config`, `Clientes_Local`, or `Interacciones_Chatbot`, even when `Grupos_Ediciones` and `Sesiones` contained valid BLW sessions.

The fallback copy then appeared because `runNormalizedRegistration()` mapped that availability failure to `read_error`, and `MaternalyCopyRenderer` rendered:

`Puedo ayudarte con Taller BLW, pero ahora no puedo validar disponibilidad automaticamente...`

## Critical Tabs

Critical for listing availability:

- `Grupos_Ediciones`
- `Sesiones`
- `Inscripciones` only for occupancy calculation

Non-critical for listing availability:

- `Servicio_Config`
- `Clientes_Local`
- `Interacciones_Chatbot`

Critical for write/registration:

- `Clientes_Local`
- `Inscripciones`
- `Interacciones_Chatbot`

Write tabs are validated only when the flow is ready to build/apply the write plan, not when the user is just asking for available sessions.

## What Changed

- Availability now reads normalized tabs individually and only blocks listing on critical availability failures.
- Non-critical parse errors are kept in diagnostics but do not prevent session listing.
- If `Inscripciones` fails but `Sesiones` includes direct `plazas_disponibles`, availability still lists sessions and reports `occupancy_unavailable_using_direct_seats`.
- The core rereads the full normalized snapshot before write-plan creation so write tabs still block safely when required.
- Availability events now include:
  - `criticalTabsOk`
  - `nonCriticalParseErrorsCount`
  - concrete `errorType`
- Copy rendering now refuses to show the availability fallback when session rows are already present.

## Tests Added

- BLW listing with non-critical parse error after `reiniciar`.
- `taller blw` and `quiero apuntarme al taller blw` against the non-critical-error fixture.
- BLW listing when `Inscripciones` fails but `Sesiones.plazas_disponibles` is present.
- Fallback with clear reason when `Sesiones` cannot be parsed.
- `Clientes_Local` parse error does not block listing but blocks the later write plan.
- Renderer guardrail: sessions present plus `read_error` still renders sessions, not fallback.

## Validation

- `npm.cmd run lint`: passed
- `npm.cmd run test:run`: passed, 64 test files, 417 tests passed, 1 todo
- `npm.cmd run build`: passed
- `npm.cmd run maternaly:health`: passed locally with `ok=true`
- `npm.cmd run maternaly:sheets:live-write-test`: completed with `exitCode=0`, `skipped=true`, `reason=missing_required_live_flags`

## Live Write Result

The local environment did not include live flags, live Sheet IDs, or credentials. No real Sheets write was attempted. This preserves the safe default behavior and does not change the previous external BLW live-write proof referenced by the prompt.

## How To Test On WhatsApp

1. Send `reiniciar`.
2. Send `quiero reservar taller blw`.
3. Verify the reply lists BLW date, time, center, and available seats.
4. Verify it does not contain `no puedo validar disponibilidad`.
5. Verify it does not contain `disponibilidad a validar` when `plazas_disponibles` is present.

## Dry Run Safety

To stay in dry-run mode, keep live write disabled:

- `MATERNALY_NORMALIZED_SHEETS_WRITE_MODE=dry_run`
- `GOOGLE_SHEETS_ACCESS_MODE=dry_run`
- `BOT_SHEETS_LIVE_WRITE_ENABLED=false`

Do not enable live writes unless the environment intentionally provides all required live flags and Sheet IDs.
