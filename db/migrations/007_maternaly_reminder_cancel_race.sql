-- Keep active worker leases intact when a booking is cancelled concurrently.
-- Existing installations get the additive column; fresh installations already
-- receive it from migration 006.
ALTER TABLE maternaly_reminders
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS maternaly_reminders_cancel_requested_idx
  ON maternaly_reminders (lease_expires_at, reminder_id)
  WHERE status = 'processing' AND cancel_requested_at IS NOT NULL;
