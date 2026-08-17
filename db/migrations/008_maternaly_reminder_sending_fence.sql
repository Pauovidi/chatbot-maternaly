-- Linearization fence between a cancellable claimed job and an external send.
-- Once status is `sending`, cancellation reports no cancelled row; a worker must
-- finish with the same lease or leave the job for explicit reconciliation.
ALTER TABLE maternaly_reminders
  DROP CONSTRAINT IF EXISTS maternaly_reminders_status_check;

ALTER TABLE maternaly_reminders
  ADD CONSTRAINT maternaly_reminders_status_check
  CHECK (
    status IN (
      'scheduled',
      'processing',
      'sending',
      'sent',
      'cancelled',
      'blocked',
      'failed'
    )
  );

CREATE INDEX IF NOT EXISTS maternaly_reminders_expired_sending_idx
  ON maternaly_reminders (lease_expires_at, reminder_id)
  WHERE status = 'sending';
