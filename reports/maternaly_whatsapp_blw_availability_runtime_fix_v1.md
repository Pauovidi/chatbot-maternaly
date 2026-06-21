# Maternaly WhatsApp BLW Availability Runtime Fix v1

## Scope

- Repo: `D:\PAU OVIDI MM\Documents\Chatbot Maternaly Clean`
- Branch: `codex/maternaly-whatsapp-blw-availability-runtime-fix-v1`
- Base branch: `codex/maternaly-align-adapter-real-template-v1`
- Base commit checked before work: `21d6724f7cd228c607f30d44e013ebdd63d74aa9`
- Remote checked before work: `https://github.com/Pauovidi/chatbot-maternaly.git`

## Fix Summary

- Added a shared normalized availability reader for WhatsApp core, backed by the same normalized Sheets parser used by the real-template flow.
- Removed the WhatsApp core pre-read runtime gate that could fall back before attempting BLW availability when a BLW Sheet ID exists.
- Preserved write safety: the availability read can list sessions, while registration writes still go through the existing write plan and runtime write flags.
- Added safe availability telemetry:
  - `maternaly_availability_checked`
  - `maternaly_availability_fallback`
- Expanded mock NLU so equivalent BLW phrases, including bare `taller blw`, request normalized availability for reservable services.
- Updated the live-write script global result so one applied service plus another `skipped_no_available_session` reports `partial_success`.

## WhatsApp BLW Behavior Covered

The following phrases now list real-template BLW sessions instead of the old fallback:

- `quiero reservar taller blw`
- `estoy interesada en reservar en el taller blw`
- `quiero apuntarme al taller blw`
- `taller blw`

Expected session copy is covered with:

- `2026-09-25 17:00 Bilbao (14 plazas disponibles)`
- `2026-09-02 17:00 Erandio (14 plazas disponibles)`

The tests assert the reply does not contain:

- `no puedo validar disponibilidad`
- `disponibilidad a validar`

## Fallback Semantics

- Real fallback event is emitted only when availability is actually unavailable, for example `no_sessions_available`.
- Read/configuration failures still remain safe and explicit via `read_error` or `missing_sheet_id`.
- Event payloads redact Sheet IDs and do not include credentials or raw secrets.

## Validation

- `npm.cmd run lint`: passed
- `npm.cmd run test:run`: passed, 63 files, 411 tests passed, 1 todo
- `npm.cmd run build`: passed
- `npm.cmd run maternaly:health`: passed locally with `ok=true`
- `npm.cmd run maternaly:sheets:live-write-test`: completed with `exitCode=0`, `skipped=true`, `reason=missing_required_live_flags`

## Live Write Note

The local environment used for this run had no live Sheets credentials, no service Sheet IDs, and missing live-write flags, so no local live append was attempted. This is separate from the prior external BLW live-write proof referenced by the prompt.
