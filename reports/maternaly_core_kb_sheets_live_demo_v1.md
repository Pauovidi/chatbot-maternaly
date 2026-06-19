# Maternaly core KB Sheets demo report v1

Generated at: 2026-06-19T06:30:00Z

## Scope

- Conversation authority moved to `maternaly_core_policy_copy`.
- Visible bot copy is rendered by the Maternaly copy renderer.
- Twilio and YCloud inbound use the same Maternaly core adapter.
- Normalized Sheets remain protected by dry-run/live flags and legacy original Sheet ID blocking.

## Local validation

- `npm run lint`: passed.
- `npm run test:run`: passed, 62 files, 378 tests passed, 1 todo.
- `npm run build`: passed.
- `npm run maternaly:health`: passed locally.
- `npm run maternaly:sheets:dry-run-write`: passed with fixture fallback because local normalized Sheet IDs and Google credentials were not configured.
- `npm run maternaly:sheets:live-write-test`: skipped safely because `MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE=true` was not set.
- `npm run smoke:http`: passed against `http://127.0.0.1:3000`.

## Sheets status

- Dry-run write plan covered `taller_blw` and `charla_embarazo_1_20`.
- Synthetic marker: `PRUEBA_BOT_CODEX_NO_CLIENTE_REAL`.
- Planned tabs: `Clientes_Local`, `Inscripciones`, `Interacciones_Chatbot`.
- Live write attempted: no.
- Legacy original Sheet IDs: blocked for normalized scripts.
- Local audit status: blocked by missing normalized Sheet IDs in local env.

## Production/EasyPanel status

- No deploy was performed from this environment.
- EasyPanel health URL could not be resolved from local DNS during validation.
- Branch is code-ready for branch-driven deploy/restart once EasyPanel pulls the pushed branch.
