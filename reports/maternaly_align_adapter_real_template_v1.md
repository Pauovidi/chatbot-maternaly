# Maternaly align adapter real template v1

## Root Cause

The previous normalized Sheets adapter and live-write script were aligned with a technical column contract, not with the real Excel/Google Sheets template used by Maternaly. The code expected fields such as `nombre_completo`, `idempotency_key`, `created_at`, `event` and sometimes `session_id` in write tabs, while the real template uses operational Spanish columns such as `cliente_id`, `nombre`, `apellidos`, `telefono_normalizado`, `inscripcion_id`, `fecha_hora`, `canal`, `accion_realizada` and `estado_inscripcion`.

This caused safe live-write checks to classify real headers as incomplete even when the sheet header row was detected correctly.

## Real Headers Supported

`Clientes_Local`:
`cliente_id`, `nombre`, `apellidos`, `telefono_normalizado`, `email`, `dni_nif`, `fpp`, `fecha_nacimiento_bebe`, `centro_preferente`, `canal_origen`, `consentimiento_comunicaciones`, `estado_cliente`, `cliente_global_id`, `notas_privadas`, `fecha_alta`, `ultima_actualizacion`

`Inscripciones`:
`inscripcion_id`, `cliente_id`, `nombre`, `apellidos`, `telefono`, `grupo_id`, `servicio_id`, `fecha_inscripcion`, `canal_origen`, `precio_acordado`, `estado_pago`, `estado_inscripcion`, `fpp`, `pareja_nombre`, `consentimiento_comunicaciones`, `observaciones`

`Interacciones_Chatbot`:
`interaccion_id`, `fecha_hora`, `canal`, `telefono`, `cliente_id`, `lead_id`, `servicio_id`, `intent`, `mensaje_usuario_resumen`, `respuesta_bot_resumen`, `accion_realizada`, `resultado`, `requiere_humano`, `conversation_id`, `observaciones`

`Sesiones` and `Grupos_Ediciones`:
Spanish variants are supported for session, group, service, date, start/end time, center, modality, status, total capacity, occupied seats, available seats, chatbot visibility/reservability and notes.

## Real To Logical Mapping

- `cliente_id` -> `clientId`
- `nombre` + `apellidos` -> `firstName`, `lastName`, logical `fullName`
- `telefono_normalizado` / `telefono` -> `phone`
- `inscripcion_id` -> `registrationId`
- `interaccion_id` -> `interactionId`
- `fecha_hora`, `fecha_inscripcion`, `fecha_alta` -> `createdAt`
- `canal`, `canal_origen` -> `source`
- `accion_realizada` -> `event`
- `resultado`, `estado_inscripcion`, `estado_cliente`, `estado_sesion` -> logical status/result fields
- `observaciones`, `notas_privadas` -> `notes`
- `precio_acordado` -> `price`
- `estado_pago` -> `paymentStatus`
- `pareja_nombre` -> `partnerName`
- `fecha_nacimiento_bebe` -> `babyBirthDate`
- `fpp` -> `fppOrDueDate`

## Adapter Changes

- Extended normalized column aliases in TypeScript to cover the real template.
- Updated tab header expectations so shifted real headers on row 3 are accepted.
- Changed write validation from fixed technical columns to logical requirements with alternatives.
- Generated real-template IDs: `cliente_id`, `inscripcion_id` and `interaccion_id`.
- Split full name into `nombre` and `apellidos` when possible.
- Wrote BLW baby birth date and charla FPP/partner data to real columns when present.
- Wrote `precio_acordado`, `estado_pago`, `estado_inscripcion`, `canal_origen`, timestamps and trace notes.
- Availability now prefers `plazas_disponibles` / `plazas_ocupadas` / `capacidad_total` from `Sesiones`, and uses `centro` in option text.

## Node Script Changes

- Mirrored aliases and header expectations in `scripts/maternaly-sheets-live-write-test.mjs`.
- Real write tabs no longer require `idempotency_key`.
- Required-column errors now report `missing_required_columns:<tab>:<logical group>` with accepted aliases and detected headers.
- Synthetic live-write rows use generated real IDs and write marker/trace data into real columns.
- The script still blocks legacy originals, redacts Sheet IDs, skips safely without live flags and does not print secrets.

## Tests Added Or Updated

- Real shifted headers are parsed for `Clientes_Local`, `Inscripciones` and `Interacciones_Chatbot`.
- Real template write headers pass without `idempotency_key`.
- Real shifted `Sesiones` uses `centro`, `capacidad_total` and `plazas_disponibles`.
- Write plan produces values for `cliente_id`, `inscripcion_id`, `interaccion_id`, `fecha_hora`, `accion_realizada`, `resultado`, `precio_acordado` and related real columns.
- WhatsApp BLW flow lists date/time/center/seats from the real template and reaches dry-run prepared state.
- WhatsApp charla flow uses the real template and reaches dry-run prepared state after synthetic FPP/partner data.
- Existing handoff paths for cancellation, date changes, payment and invoices remain human-only.

## WhatsApp Smoke Test

Use synthetic data only:

1. `reiniciar`
2. `quiero reservar taller blw`
3. `opcion 1`
4. `Soy PRUEBA BOT BLW, teléfono +34999000111, email prueba.bot.blw@example.test. Vamos 2 personas. La fecha de nacimiento del bebé es 2025-01-15.`

Expected result: the bot lists real options with date, time, center and seats, then prepares a request for Maternaly review. It must not claim a paid or confirmed place.

## EasyPanel Live-Write Test

After deploying this branch through the safe normal process, run:

```bash
npm run maternaly:sheets:live-write-test
```

The script writes only when all explicit live flags and allowlisted normalized Sheet IDs are already present. Otherwise it exits with a safe skip.

Temporary live-write flag names:

- `MATERNALY_ALLOW_SYNTHETIC_LIVE_WRITE`
- `MATERNALY_NORMALIZED_SHEETS_ENABLED`
- `MATERNALY_NORMALIZED_SHEETS_WRITE_MODE`
- `GOOGLE_SHEETS_ACCESS_MODE`
- `BOT_SHEETS_LIVE_WRITE_ENABLED`
- `MATERNALY_NORMALIZED_SHEET_IDS`
- `MATERNALY_CHARLA_EMBARAZO_SHEET_ID`
- `MATERNALY_BLW_SHEET_ID`

Return to dry-run by disabling synthetic live writes and setting normalized write mode or bot live-write flag back to dry-run/off. Do not target protected legacy originals.

## Deployment Note

No deploy or restart was performed in this task. The handoff is the pushed branch plus local validation results.
