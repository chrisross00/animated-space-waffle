-- 011-category-source.sql
-- Records how a transaction got its category, powering the "guess" badge:
--   'rule'            user-defined compound/name/merchant rule matched (confident)
--   'teller_category' auto-applied from Teller's coarse category (a guess)
--   'manual'          user explicitly set/confirmed the category
--   NULL              uncategorized (To Sort) or pre-existing rows
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_source TEXT;
