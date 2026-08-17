CREATE TABLE IF NOT EXISTS maternaly_reminders (
  reminder_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  registration_id text NOT NULL,
  conversation_id text,
  service_key text NOT NULL,
  session_id text NOT NULL,
  session_starts_at timestamptz NOT NULL,
  scheduled_for timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  lead_hours smallint NOT NULL DEFAULT 48,
  time_zone text NOT NULL DEFAULT 'Europe/Madrid',
  phone_e164 text NOT NULL,
  modality text NOT NULL,
  location text NOT NULL,
  address text,
  online_access jsonb,
  status text NOT NULL DEFAULT 'scheduled',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  lease_token text,
  lease_expires_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancel_requested_at timestamptz,
  blocked_reason text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maternaly_reminders_service_check
    CHECK (service_key = 'charla_embarazo_1_20'),
  CONSTRAINT maternaly_reminders_modality_check
    CHECK (modality IN ('online', 'presencial')),
  CONSTRAINT maternaly_reminders_status_check
    CHECK (status IN ('scheduled', 'processing', 'sending', 'sent', 'cancelled', 'blocked', 'failed')),
  CONSTRAINT maternaly_reminders_lead_check
    CHECK (lead_hours = 48),
  CONSTRAINT maternaly_reminders_attempts_check
    CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts),
  CONSTRAINT maternaly_reminders_phone_check
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX IF NOT EXISTS maternaly_reminders_due_idx
  ON maternaly_reminders (next_attempt_at, reminder_id)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS maternaly_reminders_expired_lease_idx
  ON maternaly_reminders (lease_expires_at, reminder_id)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS maternaly_reminders_registration_idx
  ON maternaly_reminders (registration_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS maternaly_reminders_provider_message_idx
  ON maternaly_reminders (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
