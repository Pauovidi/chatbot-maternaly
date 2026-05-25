CREATE TABLE IF NOT EXISTS hotel_reservations (
  reservation_id text PRIMARY KEY,
  status text,
  owner_name text,
  pet_name text,
  phone_e164 text,
  entry_date date,
  exit_date date,
  created_at timestamptz,
  updated_at timestamptz,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS hotel_reminders (
  reminder_id text PRIMARY KEY,
  reservation_id text,
  state text,
  due_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS hotel_reminders_due_idx
  ON hotel_reminders (state, due_at);

CREATE TABLE IF NOT EXISTS hotel_ops_logs (
  id text PRIMARY KEY,
  level text,
  event text,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS hotel_email_ingestion_records (
  fingerprint text PRIMARY KEY,
  message_id text,
  mailbox text,
  uid bigint,
  processed_at timestamptz,
  payload jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_email_ingestion_message_id_idx
  ON hotel_email_ingestion_records (message_id)
  WHERE message_id IS NOT NULL;
