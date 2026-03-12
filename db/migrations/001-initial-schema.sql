-- Basil Budgeting — complete Postgres schema
-- Combines initial schema + 002 additions into a single file for fresh setups.

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT,
  name            TEXT,
  picture         TEXT,
  is_admin        BOOLEAN DEFAULT false,
  is_test_user    BOOLEAN DEFAULT false,
  onboarded_at    TIMESTAMPTZ,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Plaid items (one per institution link)
CREATE TABLE IF NOT EXISTS plaid_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  institution     TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  next_cursor     TEXT,
  prev_cursor     TEXT,
  error_code      TEXT,
  error_message   TEXT,
  error_detected_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Plaid accounts (many per item)
CREATE TABLE IF NOT EXISTS plaid_accounts (
  account_id      TEXT PRIMARY KEY,
  item_id         UUID REFERENCES plaid_items(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT,
  official_name   TEXT,
  mask            TEXT,
  type            TEXT,
  subtype         TEXT,
  balance         DECIMAL(12,2),
  available       DECIMAL(12,2),
  "limit"         DECIMAL(12,2),
  balance_fetched_at TIMESTAMPTZ
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT DEFAULT 'expense',
  monthly_limit   DECIMAL(12,2) DEFAULT 0,
  show_on_budget  BOOLEAN DEFAULT true,
  plaid_pfc       TEXT[],
  fixed           BOOLEAN,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Simple rules
CREATE TABLE IF NOT EXISTS simple_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID REFERENCES categories(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  rule_type       TEXT NOT NULL,
  rule_value      TEXT NOT NULL,
  UNIQUE(user_id, rule_type, rule_value)
);

-- Compound rules
CREATE TABLE IF NOT EXISTS compound_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  label           TEXT,
  conditions      JSONB NOT NULL,
  action          JSONB NOT NULL,
  created_from    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    TEXT UNIQUE NOT NULL,
  user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
  account_id        TEXT,
  name              TEXT,
  merchant_name     TEXT,
  amount            DECIMAL(12,2),
  date              DATE,
  effective_date    DATE,
  mapped_category   TEXT,
  pending           BOOLEAN DEFAULT false,
  pending_transaction_id TEXT,
  note              TEXT,
  exclude_from_total BOOLEAN DEFAULT false,
  manually_set      BOOLEAN DEFAULT false,
  account           TEXT,
  plaid_pfc         TEXT[],
  venmo_id          TEXT,
  venmo_counterparty TEXT,
  venmo_note        TEXT,
  linked_transaction JSONB,
  dismissed_relationship TIMESTAMPTZ,
  inserted_at       TIMESTAMPTZ DEFAULT now()
);

-- Balance snapshots
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         UUID REFERENCES plaid_items(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  net             DECIMAL(12,2),
  fetched_at      TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_txn_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_txn_user_merchant ON transactions(user_id, merchant_name);
CREATE INDEX IF NOT EXISTS idx_txn_user_category ON transactions(user_id, mapped_category);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_simple_rules_user ON simple_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_compound_rules_user ON compound_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_item ON balance_snapshots(item_id, date);
