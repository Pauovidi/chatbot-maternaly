CREATE TABLE IF NOT EXISTS maternaly_service_sessions_cache (
  id text PRIMARY KEY,
  service_id text NOT NULL,
  service_name text NOT NULL,
  payload jsonb NOT NULL,
  source_sheet_id text,
  source_tab text,
  source_range text,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maternaly_reservations (
  id text PRIMARY KEY,
  conversation_id text REFERENCES hotel_conversations(id) ON DELETE SET NULL,
  contact_phone text NOT NULL,
  service_session_id text,
  status text NOT NULL,
  people_count integer NOT NULL DEFAULT 1,
  payment_status text NOT NULL DEFAULT 'payment_pending',
  invoice_status text NOT NULL DEFAULT 'invoice_pending',
  idempotency_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maternaly_reservation_write_plans (
  id text PRIMARY KEY,
  reservation_id text REFERENCES maternaly_reservations(id) ON DELETE CASCADE,
  idempotency_key text UNIQUE NOT NULL,
  plan jsonb NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maternaly_payments (
  id text PRIMARY KEY,
  reservation_id text REFERENCES maternaly_reservations(id) ON DELETE CASCADE,
  status text NOT NULL,
  payment_link text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maternaly_invoice_events (
  id text PRIMARY KEY,
  reservation_id text REFERENCES maternaly_reservations(id) ON DELETE CASCADE,
  status text NOT NULL,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maternaly_sheet_audit_logs (
  id text PRIMARY KEY,
  spreadsheet_id text NOT NULL,
  tab text,
  operation text NOT NULL,
  redacted_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maternaly_llm_interpretation_events (
  id text PRIMARY KEY,
  conversation_id text REFERENCES hotel_conversations(id) ON DELETE SET NULL,
  intent jsonb NOT NULL,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
