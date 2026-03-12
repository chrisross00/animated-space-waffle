-- Schema additions for Phase 3a migration
-- Run on the Hetzner Postgres instance after the initial schema

-- Users: missing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN DEFAULT false;

-- Plaid items: error detail columns + prev_cursor
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS error_detected_at TIMESTAMPTZ;
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS prev_cursor TEXT;

-- Transactions: dismissed_relationship should be TIMESTAMPTZ not BOOLEAN
-- (code stores ISO timestamp string, not true/false)
ALTER TABLE transactions DROP COLUMN IF EXISTS dismissed_relationship;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dismissed_relationship TIMESTAMPTZ;

-- Balance snapshots (new table)
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID REFERENCES plaid_items(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  net           DECIMAL(12,2),
  fetched_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_snapshots_item
  ON balance_snapshots(item_id, date);
