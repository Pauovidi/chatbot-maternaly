CREATE TABLE IF NOT EXISTS maternaly_contacts (
  id text PRIMARY KEY,
  phone_e164 text,
  phone_normalized text UNIQUE,
  display_name text,
  email text,
  source text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'active',
  redacted_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maternaly_contacts_phone_idx
  ON maternaly_contacts (phone_normalized);

CREATE TABLE IF NOT EXISTS maternaly_manual_handoffs (
  id text PRIMARY KEY,
  conversation_id text REFERENCES hotel_conversations(id) ON DELETE CASCADE,
  contact_id text REFERENCES maternaly_contacts(id) ON DELETE SET NULL,
  reason text,
  status text NOT NULL DEFAULT 'open',
  assigned_to text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS maternaly_manual_handoffs_conversation_idx
  ON maternaly_manual_handoffs (conversation_id, opened_at DESC);

CREATE OR REPLACE VIEW maternaly_conversations AS
  SELECT id, phone_e164, phone_normalized, display_name, customer_name, mode,
    status, unread_count, created_at, updated_at, payload
  FROM hotel_conversations;

CREATE OR REPLACE VIEW maternaly_messages AS
  SELECT id, conversation_id, direction, sender_type, external_message_sid,
    created_at, payload
  FROM hotel_conversation_messages;
