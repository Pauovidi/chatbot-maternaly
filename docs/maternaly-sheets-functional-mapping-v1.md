# Maternaly Sheets functional mapping V1

Source reports:

- `reports/maternaly_sheets_audit_202605311628.md`
- `reports/maternaly_sheets_audit_202605311628.json`

Config artifact:

- `config/maternaly-sheets.mapping.json`

## Sheet 1

ID: `163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI`

Observed shape:

- Public read via CSV.
- First visible row is a session/title row.
- Contact-like columns appear below: `NOMBRE`, `APELLIDOS`, `TELÉFONO`, `FP`, `OBSERVACIONES`.
- No reliable date, time or service column was detected in the sample.

Functional role:

- Treat as informational-session lead list.
- Service/session may be inferred only from the title row.
- Do not write into the observed tab.

Write status:

- Blocked for live writes.
- Dry-run only.
- A separate `TEST_BOT_WRITES` tab is required before any Editor test.

## Sheet 2

ID: `1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do`

Observed shape:

- Public read via CSV.
- Participant/payment style rows.
- Detected columns: `NOMBRE`, `APELLIDOS`, `TFNO`, `F. TEST`, `HORA`, `REALIZADO POR`, `PAGO`, `FECHA PAGO`, `FORMA PAGO`, `OBSERVACIONES`.

Functional role:

- Read participant rows, time, staff and payment context.
- Service is not explicit; the bot must not infer a course with high confidence unless conversation context supplies it.

Write status:

- Candidate for append-only dry-run plans.
- Live writes remain blocked.
- Real writes require Editor permission, `TEST_BOT_WRITES`, whitelist validation and `BOT_SHEETS_LIVE_WRITE_ENABLED=true`.

## Bot behavior

- Never confirm a reservation solely from public-read data.
- Never mark payment or invoice as final from ambiguous cells.
- Generate `ReservationWritePlan` in dry-run mode for operator review.
- Preserve idempotency key on every planned append.
- Use manual review when service, date/time, payment or invoice semantics are ambiguous.
