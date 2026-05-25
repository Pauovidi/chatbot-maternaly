CREATE TABLE IF NOT EXISTS hotel_schema_migrations (
  id integer PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
