CREATE TABLE IF NOT EXISTS hotel_conversations (
  id text PRIMARY KEY,
  phone_e164 text NOT NULL,
  phone_normalized text NOT NULL,
  display_name text,
  customer_name text,
  mode text NOT NULL DEFAULT 'bot',
  status text NOT NULL DEFAULT 'open',
  unread_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS hotel_conversations_phone_idx
  ON hotel_conversations (phone_normalized);

CREATE INDEX IF NOT EXISTS hotel_conversations_updated_idx
  ON hotel_conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS hotel_conversation_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES hotel_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL,
  sender_type text NOT NULL,
  external_message_sid text,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_conversation_messages_external_sid_idx
  ON hotel_conversation_messages (external_message_sid)
  WHERE external_message_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS hotel_conversation_messages_conversation_idx
  ON hotel_conversation_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS hotel_conversation_events (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES hotel_conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS hotel_conversation_events_conversation_idx
  ON hotel_conversation_events (conversation_id, created_at);
