// utils/tellerTools.js
const crypto = require('crypto');
const { client: tellerClient } = require('./tellerClient');
const {
  findPlaidItems, findCategories, findUserRules, insertTransactions,
  upsertPlaidAccounts, updatePlaidItem, upsertBalanceSnapshot,
  updateConnectionHash, sweepPendingTransactions, insertSyncLog,
} = require('../db/database');
const { getMappingRuleList, mapTransactions } = require('./categoryMapping');

// Maps Teller's institution name → the exact string Plaid stamped on historical
// `transactions.account` rows, so cutover reconciliation matches. Populated in
// Task 10 after inspecting `SELECT DISTINCT account FROM transactions` on prod.
// Empty = pass-through (correct when the names already match, e.g. "Chase").
const INSTITUTION_NAME_OVERRIDES = {
  // Verified on prod (2026-05-23): Plaid historically stamped "Citizens Bank" on
  // transactions.account, but Teller calls the institution "Citizens". Map it so the
  // cutover reconciliation dedupes the ~90-day overlap instead of duplicating it.
  Citizens: 'Citizens Bank',
};

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
// AMOUNT SIGN: the app treats positive = money spent (BudgetView.vue:443). Teller
// signs amounts by their effect on the account's OWN balance, which is opposite
// between account types:
//   • depository purchase  → Teller negative (balance down)     → negate to get +spend
//   • credit-card purchase → Teller positive (balance owed up)  → keep as +spend
// So we negate for depository and keep the sign for credit. (Verified against Teller
// sandbox: checking outflows are negative, credit-card charges are positive.)
function tellerToInternal(t, { userId, institution, accountType }) {
  const raw = Number(t.amount);
  const amount = accountType === 'credit' ? raw : -raw;
  return {
    transaction_id: t.id,
    userId,
    account_id: t.account_id,
    name: t.description,
    merchant_name: t.details?.counterparty?.name || null,
    amount,
    date: t.date,
    pending: t.status === 'pending',
    account: normalizeInstitutionName(institution),
  };
}

// Teller GET /accounts has no balances (those come from /balances). Adapt to the
// shape upsertPlaidAccounts expects so we reuse the existing account upsert.
function tellerAccountToUpsertShape(a) {
  return {
    account_id: a.id,
    name: a.name || null,
    official_name: a.name || null,
    mask: a.last_four || null,
    type: a.type || null,       // 'depository' | 'credit'
    subtype: a.subtype || null, // 'checking' | 'savings' | 'credit_card'
    balances: { current: null, available: null, limit: null },
  };
}

function netFromBalances(balances) {
  return balances.reduce((sum, acct) => {
    const isLiability = acct.type === 'credit' || acct.type === 'loan';
    const bal = isLiability ? (acct.current ?? 0) : (acct.available ?? acct.current ?? 0);
    return isLiability ? sum - Math.abs(bal) : sum + bal;
  }, 0);
}

async function pullTellerTransactions(uid) {
  const userId = uid.toString();
  const connections = (await findPlaidItems(userId)).filter((c) => c.active && c.accessToken);
  const categories = await findCategories(userId);
  const ruleList = await getMappingRuleList(categories);
  const compoundRules = await findUserRules(userId);
  const errors = {};

  for (const conn of connections) {
    try {
      const c = tellerClient(conn.accessToken);
      const accounts = await c.getAccounts();
      await upsertPlaidAccounts(conn.id, userId, accounts.map(tellerAccountToUpsertShape));

      let allTxns = [];
      for (const acct of accounts) {
        const txns = await c.getTransactions(acct.id);
        allTxns.push(...txns);
      }

      const hash = buildFingerprint(allTxns);
      if (hash === conn.lastTransactionsHash) continue; // nothing changed — skip import + sweep

      // Amount sign is account-type-aware (depository vs credit), so map each
      // transaction with its owning account's type.
      const accountTypeById = new Map(accounts.map((a) => [a.id, a.type]));
      const mapped = allTxns.map((t) => tellerToInternal(t, {
        userId, institution: conn.institution, accountType: accountTypeById.get(t.account_id),
      }));
      const categorized = await mapTransactions(mapped, ruleList, compoundRules);
      await insertTransactions(categorized);

      const accountIds = accounts.map((a) => a.id);
      const freshIds = allTxns.map((t) => t.id);
      await sweepPendingTransactions(userId, accountIds, freshIds);

      await updateConnectionHash(conn.id, hash);
      await insertSyncLog({
        userId, institution: conn.institution,
        addedCount: allTxns.length, modifiedCount: 0, removedCount: 0,
      });
      await updatePlaidItem(userId, conn.institution, {
        errorCode: null, errorMessage: null, errorDetectedAt: null,
      });
    } catch (err) {
      if (err.tellerDisconnected) {
        await updatePlaidItem(userId, conn.institution, {
          errorCode: 'disconnected',
          errorMessage: 'Reconnect required',
          errorDetectedAt: new Date(),
        });
        errors[conn.institution] = { error_code: 'disconnected', detectedAt: new Date() };
      } else {
        console.error(`pullTellerTransactions error for ${conn.institution}:`, err.message);
      }
    }
  }

  return { errors: Object.keys(errors).length ? errors : null };
}

async function fetchAndStoreBalances(uid) {
  const userId = uid.toString();
  const connections = await findPlaidItems(userId);
  const results = {};
  const balanceErrors = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const conn of connections) {
    // Manual accounts (no access token): snapshot the cached balances, same as Plaid path.
    if (!conn.accessToken) {
      if (conn.accounts?.length) {
        const manual = conn.accounts.map((a) => ({
          account_id: a.accountId, name: a.name, type: a.type, subtype: a.subtype,
          current: a.balance, available: a.available, limit: a.limit,
          fetchedAt: a.balanceFetchedAt, manual: true,
        }));
        results[conn.institution] = manual;
        await upsertBalanceSnapshot(conn.id, {
          date: today, net: Math.round(netFromBalances(manual) * 100) / 100, fetchedAt: new Date(),
        });
      }
      continue;
    }
    if (!conn.active) continue; // frozen Plaid-era connection — don't hit the network

    try {
      const c = tellerClient(conn.accessToken);
      const accounts = await c.getAccounts();
      await upsertPlaidAccounts(conn.id, userId, accounts.map(tellerAccountToUpsertShape));
      const fetchedAt = new Date();
      const balances = [];
      for (const a of accounts) {
        const b = await c.getBalance(a.id);
        balances.push({
          account_id: a.id, name: a.name, type: a.type, subtype: a.subtype,
          current: b.ledger != null ? Number(b.ledger) : null,
          available: b.available != null ? Number(b.available) : null,
          limit: null, fetchedAt,
        });
      }
      // Persist fetched balances onto the account rows.
      await upsertPlaidAccounts(conn.id, userId, accounts.map((a, i) => ({
        ...tellerAccountToUpsertShape(a),
        balances: { current: balances[i].current, available: balances[i].available, limit: null },
      })));

      await upsertBalanceSnapshot(conn.id, {
        date: today, net: Math.round(netFromBalances(balances) * 100) / 100, fetchedAt,
      });
      results[conn.institution] = balances;
    } catch (err) {
      if (err.tellerDisconnected) {
        await updatePlaidItem(userId, conn.institution, {
          errorCode: 'disconnected', errorMessage: 'Reconnect required', errorDetectedAt: new Date(),
        });
        balanceErrors[conn.institution] = { error_code: 'disconnected', detectedAt: new Date() };
      } else {
        console.error(`fetchAndStoreBalances error for ${conn.institution}:`, err.message);
      }
    }
  }

  return { balances: results, errors: Object.keys(balanceErrors).length ? balanceErrors : null };
}

module.exports = {
  INSTITUTION_NAME_OVERRIDES,
  buildFingerprint,
  normalizeInstitutionName,
  tellerToInternal,
  pullTellerTransactions,
  fetchAndStoreBalances,
};
