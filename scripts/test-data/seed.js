/**
 * Core seed/nuke logic — shared between CLI scripts and admin API routes.
 * Accepts a pg Pool instance; callers must ensure the pool is ready.
 */

const { PERSONAS } = require('./personas');
const { DEFAULT_CATEGORIES } = require('../../utils/defaultCategories');
const { P2P_MERCHANTS } = require('./merchants');
const {
  createRng, hashString, getMonthsBack,
  generateTransactions, generateAccounts, generateCategories,
  generateCompoundRules, enrichP2PTransactions,
  resolveScenarioTransactions,
} = require('./generators');

const { sandbox } = require('../../utils/plaidClient');

// Plaid sandbox institution IDs (these are Plaid's built-in test institutions)
const SANDBOX_INSTITUTIONS = {
  'First Platypus Bank': 'ins_109508',
  'Platypus OAuth Bank': 'ins_127287',
  'First Gingham Credit Union': 'ins_109509',
  'Tattersall Federal Credit Union': 'ins_109510',
  'Tartan Bank': 'ins_109511',
  'Houndstooth Bank': 'ins_109512',
};

const TABLES = ['users', 'transactions', 'plaid_items', 'categories', 'compound_rules'];

/**
 * Create real Plaid sandbox items for a persona.
 * Returns array of items with nested accounts for insertion.
 */
async function createSandboxAccounts(uid, persona) {
  const items = [];

  // Group account definitions by institution
  const byInstitution = {};
  for (const def of persona.accounts) {
    if (!byInstitution[def.institution]) byInstitution[def.institution] = [];
    byInstitution[def.institution].push(def);
  }

  for (const [institution, defs] of Object.entries(byInstitution)) {
    const sandboxInstId = persona.sandboxInstitutions?.[institution] || SANDBOX_INSTITUTIONS['First Platypus Bank'];

    // Create a sandbox public token
    const publicTokenResp = await sandbox.sandboxPublicTokenCreate({
      institution_id: sandboxInstId,
      initial_products: ['transactions'],
    });
    const publicToken = publicTokenResp.data.public_token;

    // Exchange for a real access token
    const exchangeResp = await sandbox.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchangeResp.data.access_token;

    // Fetch the actual accounts from Plaid to get real account IDs
    const accountsResp = await sandbox.accountsGet({ access_token: accessToken });
    const plaidAccounts = accountsResp.data.accounts;

    const item = {
      userId: uid,
      institution,
      accessToken,
      accounts: plaidAccounts,
    };

    // Set error if this institution should have an item error
    if (persona.itemErrors?.[institution]) {
      await sandbox.sandboxItemResetLogin({ access_token: accessToken });
      item.errorCode = persona.itemErrors[institution].error_code;
      item.errorMessage = persona.itemErrors[institution].error_message;
      item.errorDetectedAt = persona.itemErrors[institution].detectedAt || new Date();
    }

    items.push(item);
  }

  return items;
}

/**
 * Seed a single persona. Wipes existing data for that UID first.
 * @param {Pool} pool - pg Pool instance
 * @param {string} personaName - key from PERSONAS
 * @returns {{ persona: string, uid: string, counts: object }}
 */
async function seedPersona(pool, personaName) {
  const persona = PERSONAS[personaName];
  if (!persona) throw new Error(`Unknown persona: "${personaName}"`);

  const uid = persona.uid;
  const counts = { users: 0, accounts: 0, categories: 0, rules: 0, transactions: 0 };

  // 1. Nuke existing data for this UID (order matters for FK constraints)
  await pool.query(`DELETE FROM transactions WHERE user_id = $1`, [uid]);
  await pool.query(`DELETE FROM compound_rules WHERE user_id = $1`, [uid]);
  await pool.query(`DELETE FROM categories WHERE user_id = $1`, [uid]);
  await pool.query(`DELETE FROM plaid_items WHERE user_id = $1`, [uid]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);

  // 2. Insert user
  await pool.query(
    `INSERT INTO users (id, email, name, picture, is_admin, is_test_user, onboarded_at)
     VALUES ($1, $2, $3, $4, $5, true, $6)`,
    [uid, persona.user.email, persona.user.name, persona.user.picture || null,
     persona.user.isAdmin || false, persona.user.onboarded_at || null]
  );
  counts.users = 1;

  // 3. Accounts (plaid_items + plaid_accounts)
  let accountMap = {};
  if (persona.accounts && persona.accounts.length > 0) {
    let items;
    if (persona.useSandbox) {
      items = await createSandboxAccounts(uid, persona);
      // Build accountMap from real Plaid accounts
      for (const item of items) {
        const firstAcct = item.accounts?.[0];
        if (firstAcct) {
          accountMap[item.institution] = {
            account_id: firstAcct.account_id,
            subtype: firstAcct.subtype,
          };
        }
      }
    } else {
      const result = generateAccounts(uid, persona.accounts);
      items = result.items;
      accountMap = result.accountMap;

      // Inject item errors if the persona defines them
      if (persona.itemErrors) {
        for (const item of items) {
          const errorData = persona.itemErrors[item.institution];
          if (errorData) {
            item.errorCode = errorData.error_code;
            item.errorMessage = errorData.error_message;
            item.errorDetectedAt = errorData.detectedAt || new Date();
          }
        }
      }
    }

    // Insert items and accounts
    for (const item of items) {
      const { rows } = await pool.query(
        `INSERT INTO plaid_items (user_id, institution, access_token, next_cursor,
           error_code, error_message, error_detected_at)
         VALUES ($1, $2, $3, '', $4, $5, $6) RETURNING id`,
        [uid, item.institution, item.accessToken,
         item.errorCode || null, item.errorMessage || null, item.errorDetectedAt || null]
      );
      const itemId = rows[0].id;

      // Insert accounts
      for (const acct of item.accounts || []) {
        const bal = acct.balances || acct;
        await pool.query(
          `INSERT INTO plaid_accounts (account_id, item_id, user_id, name, official_name,
             mask, type, subtype, balance, available, "limit", balance_fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (account_id) DO NOTHING`,
          [acct.account_id, itemId, uid, acct.name, acct.official_name || acct.name,
           acct.mask || '0000', acct.type, acct.subtype,
           bal.current ?? bal.balance ?? null,
           bal.available ?? null,
           bal.limit ?? null,
           new Date()]
        );
      }
    }
    counts.accounts = persona.accounts.length;
  }

  // 4. Categories + simple rules
  if (persona.categories !== null) {
    const categories = generateCategories(uid, DEFAULT_CATEGORIES, persona.categoryCustomizations || []);
    for (const cat of categories) {
      const { rows } = await pool.query(
        `INSERT INTO categories (user_id, name, type, monthly_limit, show_on_budget, plaid_pfc, fixed)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [uid, cat.category, cat.type || 'expense', cat.monthly_limit || 0,
         true, cat.plaid_pfc || null, cat.fixed || null]
      );
      const categoryId = rows[0].id;

      // Insert embedded simple rules
      for (const merchant of cat.rules?.merchant_name || []) {
        await pool.query(
          `INSERT INTO simple_rules (category_id, user_id, rule_type, rule_value)
           VALUES ($1, $2, 'merchant_name', $3) ON CONFLICT DO NOTHING`,
          [categoryId, uid, merchant]
        );
      }
      for (const name of cat.rules?.name || []) {
        await pool.query(
          `INSERT INTO simple_rules (category_id, user_id, rule_type, rule_value)
           VALUES ($1, $2, 'name', $3) ON CONFLICT DO NOTHING`,
          [categoryId, uid, name]
        );
      }
    }
    counts.categories = categories.length;
  }

  // 5. Compound rules
  if (persona.compoundRules && persona.compoundRules.length > 0) {
    const rules = generateCompoundRules(uid, persona.compoundRules);
    for (const r of rules) {
      await pool.query(
        `INSERT INTO compound_rules (user_id, label, conditions, action, created_from, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uid, r.label, JSON.stringify(r.conditions), JSON.stringify(r.action),
         r.createdFrom || null, r.createdAt || new Date()]
      );
    }
    counts.rules = rules.length;
  }

  // 6. Transactions
  if (persona.transactionConfig && Object.keys(accountMap).length > 0) {
    const config = persona.transactionConfig;
    const rng = createRng(hashString(uid));
    const months = getMonthsBack(config.months);

    let merchantPool = config.merchantPool;
    if (config.p2pHeavy) {
      merchantPool = { ...merchantPool };
      merchantPool['To Sort'] = [...(merchantPool['To Sort'] || []), ...P2P_MERCHANTS];
    }

    const transactions = generateTransactions({
      userId: uid,
      months,
      merchantPool,
      accountMap,
      rng,
      density: config.density || 'normal',
    });

    if (config.p2pHeavy) {
      enrichP2PTransactions(rng, transactions);
    }

    if (config.manuallySetCount) {
      const candidates = transactions.filter(t => t.mappedCategory && t.mappedCategory !== 'To Sort');
      const count = Math.min(config.manuallySetCount, candidates.length);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(rng() * candidates.length);
        candidates[idx].manually_set = true;
        candidates.splice(idx, 1);
      }
    }

    // Inject scenario transactions (hand-crafted split/return test pairs)
    if (persona.scenarioTransactions) {
      const scenarioTxns = resolveScenarioTransactions({
        userId: uid,
        scenarios: persona.scenarioTransactions,
        accountMap,
        months,
        txnCounterStart: transactions.length,
      });

      // Resolve cross-references for pre-linked pairs
      const placeholder = '__placeholder_linked_partner__';
      for (let i = 0; i < scenarioTxns.length - 1; i++) {
        const a = scenarioTxns[i], b = scenarioTxns[i + 1];
        if (a.linkedTransaction?.transaction_id === placeholder &&
            b.linkedTransaction?.transaction_id === placeholder) {
          a.linkedTransaction.transaction_id = b.transaction_id;
          b.linkedTransaction.transaction_id = a.transaction_id;
          i++;
        }
      }

      transactions.push(...scenarioTxns);
    }

    // Batch insert transactions
    for (const t of transactions) {
      const pfc = t.personal_finance_category
        ? [t.personal_finance_category.primary]
        : (t.plaid_pfc || null);
      await pool.query(
        `INSERT INTO transactions (
           transaction_id, user_id, name, merchant_name, amount, date,
           effective_date, mapped_category, pending, pending_transaction_id,
           note, exclude_from_total, manually_set, account, plaid_pfc, plaid_pfc_detail,
           venmo_id, venmo_counterparty, venmo_note,
           linked_transaction, dismissed_relationship
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [
          t.transaction_id, uid, t.name, t.merchant_name || null,
          t.amount, t.date, t.effectiveDate || null,
          t.mappedCategory || null, t.pending || false,
          t.pending_transaction_id || null, t.note || null,
          t.excludeFromTotal || false, t.manually_set || false,
          t.account || null, pfc,
          t.personal_finance_category?.detailed || null,
          t.venmo_id || null, t.venmo_counterparty || null, t.venmo_note || null,
          t.linkedTransaction ? JSON.stringify(t.linkedTransaction) : null,
          t.dismissedRelationship || null,
        ]
      );
    }
    counts.transactions = transactions.length;
  }

  return { persona: personaName, uid, counts };
}

/**
 * List all test users in the database.
 * @param {Pool} pool - pg Pool instance
 * @returns {Array<{ userId, name, email }>}
 */
async function listTestUsers(pool) {
  const { rows } = await pool.query(
    `SELECT id AS "userId", name, email FROM users WHERE is_test_user = true`
  );
  return rows;
}

/**
 * Nuke all test user data.
 * @param {Pool} pool - pg Pool instance
 * @param {{ dryRun?: boolean }} options
 */
async function nukeTestUsers(pool, { dryRun = false } = {}) {
  const testUsers = await listTestUsers(pool);
  if (testUsers.length === 0) return { users: [], deleted: {} };

  const uids = testUsers.map(u => u.userId);
  const tableNames = ['transactions', 'compound_rules', 'simple_rules', 'categories', 'plaid_items', 'users'];
  const result = {};

  for (const table of tableNames) {
    const col = table === 'users' ? 'id' : 'user_id';
    if (dryRun) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${col} = ANY($1)`, [uids]
      );
      result[table] = rows[0].count;
    } else {
      const del = await pool.query(
        `DELETE FROM ${table} WHERE ${col} = ANY($1)`, [uids]
      );
      result[table] = del.rowCount;
    }
  }

  return {
    users: testUsers,
    [dryRun ? 'wouldDelete' : 'deleted']: result,
  };
}

/**
 * Get available persona names.
 * @returns {Array<{ name: string, uid: string }>}
 */
function getPersonaList() {
  return Object.entries(PERSONAS).map(([name, p]) => ({ name, uid: p.uid }));
}

module.exports = { seedPersona, listTestUsers, nukeTestUsers, getPersonaList };
