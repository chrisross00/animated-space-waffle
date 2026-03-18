-- Allow plaid_items with NULL access_token (manual accounts)
ALTER TABLE plaid_items ALTER COLUMN access_token DROP NOT NULL;

-- Ensure unique constraint exists for balance snapshot upsert
-- (may already exist from 002-schema-additions.sql; IF NOT EXISTS via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'balance_snapshots_item_id_date_key'
  ) THEN
    ALTER TABLE balance_snapshots ADD CONSTRAINT balance_snapshots_item_id_date_key UNIQUE (item_id, date);
  END IF;
END $$;

-- Explicit manual flag for manually-created accounts
ALTER TABLE plaid_accounts ADD COLUMN IF NOT EXISTS manual BOOLEAN DEFAULT false;
