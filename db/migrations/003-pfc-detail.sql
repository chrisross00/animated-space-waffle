-- Add plaid_pfc_detail column to store the detailed PFC code from Plaid
-- e.g. 'FOOD_AND_DRINK_RESTAURANTS' alongside the existing primary 'FOOD_AND_DRINK'
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plaid_pfc_detail TEXT;
