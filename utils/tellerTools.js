// utils/tellerTools.js
const crypto = require('crypto');

// Maps Teller's institution name → the exact string Plaid stamped on historical
// `transactions.account` rows, so cutover reconciliation matches. Populated in
// Task 10 after inspecting `SELECT DISTINCT account FROM transactions` on prod.
// Empty = pass-through (correct when the names already match, e.g. "Chase").
const INSTITUTION_NAME_OVERRIDES = {};

function buildFingerprint(txns) {
  const canonical = txns
    .map((t) => [t.id, t.amount, t.date, t.status, t.description].join('|'))
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function normalizeInstitutionName(name, overrideMap = INSTITUTION_NAME_OVERRIDES) {
  if (!name) return name;
  return overrideMap[name] || name;
}

// Map a Teller transaction to the internal shape insertTransactions expects.
// NOTE: Teller's ledger sign is the opposite of Plaid's. The app treats positive
// amount as money spent (BudgetView.vue:443), so we negate Teller's amount.
function tellerToInternal(t, { userId, institution }) {
  return {
    transaction_id: t.id,
    userId,
    account_id: t.account_id,
    name: t.description,
    merchant_name: t.details?.counterparty?.name || null,
    amount: -Number(t.amount),
    date: t.date,
    pending: t.status === 'pending',
    account: normalizeInstitutionName(institution),
  };
}

module.exports = {
  INSTITUTION_NAME_OVERRIDES,
  buildFingerprint,
  normalizeInstitutionName,
  tellerToInternal,
};
