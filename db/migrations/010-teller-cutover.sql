-- 010-teller-cutover.sql
-- Teller cutover: additive only. Table rename + cursor-column drops are deferred
-- to the Phase 3 cleanup PR so the Plaid path keeps working during side-by-side
-- and rollback stays a one-click code revert.

-- Whether a connection is syncable. Frozen (false) = historical Plaid-era, kept
-- for its data but never synced again.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- Fingerprint of the last full transaction pull, for sync early-exit.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS last_transactions_hash TEXT;

-- Teller enrollment id, needed to drive Connect's reconnect (update) mode.
ALTER TABLE plaid_items ADD COLUMN IF NOT EXISTS enrollment_id TEXT;

-- Replace the strict (user_id, institution) uniqueness with a partial index that
-- only applies to active rows. This lets a frozen Plaid "Chase" and a new active
-- Teller "Chase" coexist.
ALTER TABLE plaid_items DROP CONSTRAINT IF EXISTS plaid_items_user_id_institution_key;
CREATE UNIQUE INDEX IF NOT EXISTS bank_connections_user_institution_active_uk
  ON plaid_items (user_id, institution) WHERE active = true;

-- Freeze every existing (Plaid-era) connection. New Teller connections insert as active.
UPDATE plaid_items SET active = false;
