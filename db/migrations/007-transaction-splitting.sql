-- 007-transaction-splitting.sql
ALTER TABLE transactions ADD COLUMN parent_transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN is_split_parent BOOLEAN DEFAULT false;
CREATE INDEX idx_txn_parent ON transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;
