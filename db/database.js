const { Pool } = require('pg');
const { CATEGORY_TYPES } = require('../shared/categoryTypes');

// Parse DECIMAL/NUMERIC as float instead of string
require('pg').types.setTypeParser(1700, val => parseFloat(val));
// Parse DATE as string (YYYY-MM-DD) instead of Date object
require('pg').types.setTypeParser(1082, val => val);

let _pool = null;

function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _pool.on('error', (err) => console.error('DB pool error:', err));
  }
  return _pool;
}

async function connectToDb() {
  const pool = getPool();
  const client = await pool.connect();
  client.release();
  console.log('DB: Postgres pool connected');
  return pool;
}

// ---- Column aliases for API-compatible return shapes ----

const TXN_COLUMNS = [
  'id', 'transaction_id', 'user_id AS "userId"', 'account_id',
  'name', 'merchant_name', 'amount', 'date',
  'effective_date AS "effectiveDate"',
  'mapped_category AS "mappedCategory"',
  'pending', 'pending_transaction_id',
  'note', 'exclude_from_total AS "excludeFromTotal"', 'manually_set',
  'account', 'plaid_pfc', 'plaid_pfc_detail AS "plaidPfcDetail"',
  'venmo_id', 'venmo_counterparty', 'venmo_note',
  'linked_transaction AS "linkedTransaction"',
  'dismissed_relationship AS "dismissedRelationship"',
  'inserted_at AS "insertDate"',
  'parent_transaction_id AS "parentTransactionId"',
  'is_split_parent AS "isSplitParent"',
].join(', ');

const TXN_TAGS_SUBQUERY = `
  COALESCE((
    SELECT json_agg(json_build_object('id', tg.id, 'name', tg.name))
    FROM transaction_tags tt
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tt.transaction_id = t.transaction_id
  ), '[]'::json) AS tags`;

const TXN_FIELD_MAP = {
  mappedCategory: 'mapped_category',
  excludeFromTotal: 'exclude_from_total',
  manually_set: 'manually_set',
  effectiveDate: 'effective_date',
  linkedTransaction: 'linked_transaction',
  dismissedRelationship: 'dismissed_relationship',
  name: 'name',
  merchant_name: 'merchant_name',
  amount: 'amount',
  date: 'date',
  pending: 'pending',
  note: 'note',
  account: 'account',
  venmo_id: 'venmo_id',
  venmo_note: 'venmo_note',
  venmo_counterparty: 'venmo_counterparty',
  plaidPfcDetail: 'plaid_pfc_detail',
  category: 'category',
  parentTransactionId: 'parent_transaction_id',
  isSplitParent: 'is_split_parent',
};

const JSONB_FIELDS = new Set(['linked_transaction']);

/** Build SET clause + params from a fields object using a field map. */
function buildSetClause(fields, fieldMap, startParam) {
  const setClauses = [];
  const params = [];
  let i = startParam;
  for (const [jsKey, sqlCol] of Object.entries(fieldMap)) {
    if (jsKey in fields) {
      if (JSONB_FIELDS.has(sqlCol) && fields[jsKey] !== null) {
        setClauses.push(`${sqlCol} = $${i}::jsonb`);
        params.push(JSON.stringify(fields[jsKey]));
      } else {
        setClauses.push(`${sqlCol} = $${i}`);
        params.push(fields[jsKey]);
      }
      i++;
    }
  }
  return { setClauses, params, nextParam: i };
}

// ========================
//  USERS
// ========================

async function findUser(userId, email) {
  const pool = getPool();
  const where = userId ? 'id = $1' : 'email = $1';
  const param = userId || email;
  const { rows } = await pool.query(
    `SELECT id, id AS "userId", email, name, picture,
            is_admin AS "isAdmin", onboarded_at, last_synced_at AS "lastSyncedAt",
            is_test_user AS "isTestUser", created_at, preferences
     FROM users WHERE ${where}`,
    [param]
  );
  return rows;
}

async function insertUser(user) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO users (id, email, name, picture, is_admin, onboarded_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.userId, user.email, user.name || null, user.picture || null,
     user.isAdmin || false, user.onboarded_at || null]
  );
}

const USER_FIELD_MAP = {
  onboarded_at: 'onboarded_at',
  lastSyncedAt: 'last_synced_at',
  email: 'email',
  name: 'name',
  picture: 'picture',
  isAdmin: 'is_admin',
};

async function updateUser(userId, fields) {
  const pool = getPool();
  const { setClauses, params } = buildSetClause(fields, USER_FIELD_MAP, 2);
  if (setClauses.length === 0) return;
  await pool.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1`,
    [userId, ...params]
  );
}

async function updateUserPreferences(userId, prefs) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE users SET preferences = COALESCE(preferences, '{}') || $2::jsonb
     WHERE id = $1 RETURNING preferences`,
    [userId, JSON.stringify(prefs)]
  );
  return rows[0]?.preferences || {};
}

async function findAllUsers() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id AS "userId", email, name, picture, is_admin AS "isAdmin"
     FROM users ORDER BY created_at`
  );
  return rows;
}

// ========================
//  CATEGORIES + SIMPLE RULES
// ========================

async function findCategories(userId) {
  const pool = getPool();
  const { rows: categories } = await pool.query(
    `SELECT id AS "_id", user_id AS "userId", name AS "category", type,
            monthly_limit, show_on_budget, plaid_pfc, fixed, created_at
     FROM categories WHERE user_id = $1 ORDER BY created_at`,
    [userId]
  );
  if (categories.length === 0) return [];

  const catIds = categories.map(c => c._id);
  const { rows: rules } = await pool.query(
    `SELECT category_id, rule_type, rule_value
     FROM simple_rules WHERE category_id = ANY($1)`,
    [catIds]
  );

  const rulesMap = {};
  for (const r of rules) {
    if (!rulesMap[r.category_id]) rulesMap[r.category_id] = { merchant_name: [], name: [] };
    rulesMap[r.category_id][r.rule_type].push(r.rule_value);
  }

  return categories.map(cat => ({
    ...cat,
    rules: rulesMap[cat._id] || { merchant_name: [], name: [] },
  }));
}

async function insertCategory(cat) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO categories (user_id, name, type, monthly_limit, show_on_budget, plaid_pfc, fixed)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id AS "_id"`,
    [cat.userId, cat.category || cat.name, cat.type || CATEGORY_TYPES.EXPENSE,
     cat.monthly_limit || 0, cat.show_on_budget !== false, cat.plaid_pfc || null,
     cat.fixed || null]
  );
  return rows[0];
}

async function insertCategories(cats) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const cat of cats) {
      const { rows } = await client.query(
        `INSERT INTO categories (user_id, name, type, monthly_limit, show_on_budget, plaid_pfc, fixed)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [cat.userId, cat.category || cat.name, cat.type || CATEGORY_TYPES.EXPENSE,
         cat.monthly_limit || 0, cat.show_on_budget !== false, cat.plaid_pfc || null,
         cat.fixed || null]
      );
      const categoryId = rows[0].id;
      for (const merchant of cat.rules?.merchant_name || []) {
        await client.query(
          `INSERT INTO simple_rules (category_id, user_id, rule_type, rule_value)
           VALUES ($1, $2, 'merchant_name', $3) ON CONFLICT DO NOTHING`,
          [categoryId, cat.userId, merchant]
        );
      }
      for (const name of cat.rules?.name || []) {
        await client.query(
          `INSERT INTO simple_rules (category_id, user_id, rule_type, rule_value)
           VALUES ($1, $2, 'name', $3) ON CONFLICT DO NOTHING`,
          [categoryId, cat.userId, name]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const CAT_FIELD_MAP = {
  category: 'name',
  monthly_limit: 'monthly_limit',
  type: 'type',
  plaid_pfc: 'plaid_pfc',
  show_on_budget: 'show_on_budget',
  fixed: 'fixed',
};

async function updateCategory(categoryId, userId, fields) {
  const pool = getPool();
  const { setClauses, params } = buildSetClause(fields, CAT_FIELD_MAP, 3);
  if (setClauses.length === 0) return;
  await pool.query(
    `UPDATE categories SET ${setClauses.join(', ')} WHERE id = $1 AND user_id = $2`,
    [categoryId, userId, ...params]
  );
}

async function deleteCategory(categoryId, userId) {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM categories WHERE id = $1 AND user_id = $2`,
    [categoryId, userId]
  );
  return { deletedCount: result.rowCount };
}

async function removePfcFromOtherCategories(userId, excludeId, pfcValues) {
  if (!pfcValues || pfcValues.length === 0) return;
  const pool = getPool();
  await pool.query(
    `UPDATE categories SET plaid_pfc = (
       SELECT ARRAY(SELECT unnest(plaid_pfc) EXCEPT SELECT unnest($3::text[]))
     ) WHERE user_id = $1 AND id != $2 AND plaid_pfc && $3::text[]`,
    [userId, excludeId, pfcValues]
  );
}

async function removePfcFromAllCategories(userId, pfcValues) {
  if (!pfcValues || pfcValues.length === 0) return;
  const pool = getPool();
  await pool.query(
    `UPDATE categories SET plaid_pfc = (
       SELECT ARRAY(SELECT unnest(plaid_pfc) EXCEPT SELECT unnest($2::text[]))
     ) WHERE user_id = $1 AND plaid_pfc && $2::text[]`,
    [userId, pfcValues]
  );
}

// ---- Simple Rules ----

async function addSimpleRule(categoryId, userId, ruleType, ruleValue) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO simple_rules (category_id, user_id, rule_type, rule_value)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [categoryId, userId, ruleType, ruleValue]
  );
}

async function removeSimpleRule(categoryId, userId, ruleType, ruleValue) {
  const pool = getPool();
  await pool.query(
    `DELETE FROM simple_rules WHERE category_id = $1 AND user_id = $2
     AND rule_type = $3 AND rule_value = $4`,
    [categoryId, userId, ruleType, ruleValue]
  );
}

async function removeSimpleRuleFromAll(userId, ruleType, ruleValue) {
  const pool = getPool();
  await pool.query(
    `DELETE FROM simple_rules WHERE user_id = $1 AND rule_type = $2 AND rule_value = $3`,
    [userId, ruleType, ruleValue]
  );
}

// ========================
//  COMPOUND RULES
// ========================

async function findUserRules(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id AS "_id", user_id AS "userId", label, conditions, action,
            created_from AS "createdFrom", created_at AS "createdAt"
     FROM compound_rules WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function insertRule(rule) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO compound_rules (user_id, label, conditions, action, created_from, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [rule.userId, rule.label, JSON.stringify(rule.conditions),
     JSON.stringify(rule.action), rule.createdFrom || null, rule.createdAt || new Date()]
  );
  return { insertedId: rows[0].id };
}

async function updateCompoundRule(userId, ruleId, updates) {
  const pool = getPool();
  const setClauses = [];
  const params = [userId, ruleId];
  let i = 3;
  if ('label' in updates) {
    setClauses.push(`label = $${i}`); params.push(updates.label); i++;
  }
  if ('conditions' in updates) {
    setClauses.push(`conditions = $${i}::jsonb`);
    params.push(JSON.stringify(updates.conditions)); i++;
  }
  if ('action' in updates) {
    setClauses.push(`action = $${i}::jsonb`);
    params.push(JSON.stringify(updates.action)); i++;
  }
  if (setClauses.length === 0) return;
  await pool.query(
    `UPDATE compound_rules SET ${setClauses.join(', ')} WHERE user_id = $1 AND id = $2`,
    params
  );
}

async function deleteCompoundRule(userId, ruleId) {
  const pool = getPool();
  await pool.query(
    `DELETE FROM compound_rules WHERE user_id = $1 AND id = $2`,
    [userId, ruleId]
  );
}

// ========================
//  TRANSACTIONS
// ========================

async function findTransactionsByMonth(userId, month) {
  const pool = getPool();
  const monthStart = `${month}-01`;
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  const { rows } = await pool.query(
    `SELECT ${TXN_COLUMNS}, ${TXN_TAGS_SUBQUERY} FROM transactions t
     WHERE user_id = $1 AND (
       (effective_date IS NOT NULL AND effective_date >= $2 AND effective_date <= $3)
       OR
       (effective_date IS NULL AND date >= $2 AND date <= $3)
     )
     ORDER BY date DESC`,
    [userId, monthStart, monthEnd]
  );
  return rows;
}

async function findTransactionsPaginated(userId, { page = 1, limit = 100, search } = {}) {
  const pool = getPool();
  const params = [userId];
  let whereExtra = '';
  let paramIdx = 2;

  if (search) {
    whereExtra = ` AND (name ILIKE $${paramIdx} OR merchant_name ILIKE $${paramIdx} OR mapped_category ILIKE $${paramIdx} OR venmo_counterparty ILIKE $${paramIdx} OR venmo_note ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  const offset = (page - 1) * limit;
  const countParams = [...params];
  params.push(limit, offset);

  const [txnResult, countResult] = await Promise.all([
    pool.query(
      `SELECT ${TXN_COLUMNS}, ${TXN_TAGS_SUBQUERY} FROM transactions t
       WHERE user_id = $1 AND (is_split_parent IS NOT TRUE)${whereExtra}
       ORDER BY date DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1 AND (is_split_parent IS NOT TRUE)${whereExtra}`,
      countParams
    ),
  ]);

  const total = countResult.rows[0].count;
  return {
    transactions: txnResult.rows,
    total,
    hasMore: offset + txnResult.rows.length < total,
  };
}

async function insertTransactions(transactions) {
  if (!transactions || transactions.length === 0) return { reconciled: 0 };
  const pool = getPool();
  const client = await pool.connect();
  let reconciled = 0;
  try {
    await client.query('BEGIN');
    for (const t of transactions) {
      const pfc = t.personal_finance_category
        ? [t.personal_finance_category.primary]
        : (t.plaid_pfc || null);

      // Check for existing transaction with same real-world identity but different
      // Plaid transaction_id and account_id (e.g., migrated data with stale IDs).
      // If found, adopt the new Plaid IDs so future syncs work correctly.
      // Only reconcile when account_id differs — same account_id means it's a
      // legitimate second transaction (e.g., two coffees on the same day).
      const existing = await client.query(
        `SELECT id, transaction_id, account_id FROM transactions
         WHERE user_id = $1 AND name = $2 AND amount = $3 AND date = $4 AND account = $5
           AND account_id <> $6
         LIMIT 1`,
        [t.userId, t.name, t.amount, t.date, t.account || null, t.account_id || '']
      );

      if (existing.rows.length > 0) {
        // Adopt Plaid's current transaction_id and account_id.
        // Temporarily drop and re-add tags since FK has no ON UPDATE CASCADE.
        const oldTxnId = existing.rows[0].transaction_id;
        const tags = await client.query(
          `DELETE FROM transaction_tags WHERE transaction_id = $1 RETURNING tag_id`,
          [oldTxnId]
        );
        await client.query(
          `UPDATE transactions SET transaction_id = $1, account_id = $2
           WHERE id = $3`,
          [t.transaction_id, t.account_id || null, existing.rows[0].id]
        );
        for (const tag of tags.rows) {
          await client.query(
            `INSERT INTO transaction_tags (transaction_id, tag_id) VALUES ($1, $2)`,
            [t.transaction_id, tag.tag_id]
          );
        }
        reconciled++;
        continue;
      }

      await client.query(
        `INSERT INTO transactions (
           transaction_id, user_id, account_id, name, merchant_name,
           amount, date, effective_date, mapped_category, pending,
           pending_transaction_id, note, exclude_from_total, manually_set,
           account, plaid_pfc, plaid_pfc_detail, venmo_id, venmo_counterparty, venmo_note,
           linked_transaction, dismissed_relationship
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (transaction_id) DO UPDATE SET
           pending = EXCLUDED.pending,
           date = EXCLUDED.date`,
        [
          t.transaction_id, t.userId, t.account_id || null,
          t.name, t.merchant_name || null, t.amount, t.date,
          t.effectiveDate || t.effective_date || null,
          t.mappedCategory || t.mapped_category || null,
          t.pending || false, t.pending_transaction_id || null,
          t.note || null, t.excludeFromTotal || t.exclude_from_total || false,
          t.manually_set || false, t.account || null, pfc,
          t.personal_finance_category?.detailed || t.plaidPfcDetail || null,
          t.venmo_id || null, t.venmo_counterparty || null, t.venmo_note || null,
          t.linkedTransaction ? JSON.stringify(t.linkedTransaction) : null,
          t.dismissedRelationship || null,
        ]
      );
    }
    await client.query('COMMIT');
    return { reconciled };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updateTransaction(userId, transactionId, fields) {
  const pool = getPool();
  const { setClauses, params } = buildSetClause(fields, TXN_FIELD_MAP, 3);
  if (setClauses.length === 0) return;
  await pool.query(
    `UPDATE transactions SET ${setClauses.join(', ')}
     WHERE user_id = $1 AND transaction_id = $2`,
    [userId, transactionId, ...params]
  );
}

async function updateTransactionsBulk(userId, transactionIds, fields) {
  if (!transactionIds || transactionIds.length === 0) return { modifiedCount: 0 };
  const pool = getPool();
  const { setClauses, params } = buildSetClause(fields, TXN_FIELD_MAP, 3);
  if (setClauses.length === 0) return { modifiedCount: 0 };
  const result = await pool.query(
    `UPDATE transactions SET ${setClauses.join(', ')}
     WHERE user_id = $1 AND transaction_id = ANY($2)`,
    [userId, transactionIds, ...params]
  );
  return { matchedCount: result.rowCount, modifiedCount: result.rowCount };
}

async function updateTransactionsByMerchant(userId, merchantName, fields, excludeManuallySet = true) {
  const pool = getPool();
  const manualClause = excludeManuallySet ? ' AND (manually_set IS NULL OR manually_set = false)' : '';
  const { setClauses, params } = buildSetClause(fields, TXN_FIELD_MAP, 3);
  if (setClauses.length === 0) return { modifiedCount: 0 };
  const result = await pool.query(
    `UPDATE transactions SET ${setClauses.join(', ')}
     WHERE user_id = $1 AND merchant_name = $2${manualClause} AND (is_split_parent IS NOT TRUE)`,
    [userId, merchantName, ...params]
  );
  return { matchedCount: result.rowCount, modifiedCount: result.rowCount };
}

async function updateTransactionsByName(userId, txnName, fields, excludeManuallySet = true) {
  const pool = getPool();
  const manualClause = excludeManuallySet ? ' AND (manually_set IS NULL OR manually_set = false)' : '';
  const { setClauses, params } = buildSetClause(fields, TXN_FIELD_MAP, 3);
  if (setClauses.length === 0) return { modifiedCount: 0 };
  const result = await pool.query(
    `UPDATE transactions SET ${setClauses.join(', ')}
     WHERE user_id = $1 AND name = $2${manualClause} AND (is_split_parent IS NOT TRUE)`,
    [userId, txnName, ...params]
  );
  return { matchedCount: result.rowCount, modifiedCount: result.rowCount };
}

/** Convert compound rule conditions to SQL WHERE clause + params. */
function conditionsToSqlWhere(conditions, startParam = 1) {
  const clauses = [];
  const params = [];
  let i = startParam;

  for (const cond of conditions) {
    const { field, op, value } = cond;
    if (field === 'merchant_name') {
      if (op === 'eq') { clauses.push(`merchant_name = $${i}`); params.push(value); i++; }
      else if (op === 'contains') { clauses.push(`merchant_name ILIKE $${i}`); params.push(`%${value}%`); i++; }
    } else if (field === 'name') {
      if (op === 'eq') { clauses.push(`name = $${i}`); params.push(value); i++; }
      else if (op === 'contains') { clauses.push(`name ILIKE $${i}`); params.push(`%${value}%`); i++; }
    } else if (field === 'amount') {
      if (op === 'eq') { clauses.push(`ABS(amount) = $${i}`); params.push(value); i++; }
      else if (op === 'gt') { clauses.push(`ABS(amount) > $${i}`); params.push(value); i++; }
      else if (op === 'lt') { clauses.push(`ABS(amount) < $${i}`); params.push(value); i++; }
      else if (op === 'range') {
        clauses.push(`ABS(amount) >= $${i} AND ABS(amount) <= $${i + 1}`);
        params.push(value.min, value.max); i += 2;
      }
    } else if (field === 'account') {
      if (op === 'eq') { clauses.push(`account = $${i}`); params.push(value); i++; }
    }
  }

  return { clause: clauses.join(' AND '), params, nextParam: i };
}

async function sweepTransactionsByConditions(userId, conditions, fields) {
  const pool = getPool();
  const { clause, params: condParams } = conditionsToSqlWhere(conditions, 2);
  if (!clause) return { matchedCount: 0, modifiedCount: 0 };

  const { setClauses, params: setParams } = buildSetClause(fields, TXN_FIELD_MAP, 2 + condParams.length);
  if (setClauses.length === 0) return { matchedCount: 0, modifiedCount: 0 };

  const where = `user_id = $1 AND ${clause} AND (manually_set IS NULL OR manually_set = false) AND (is_split_parent IS NOT TRUE)`;
  const result = await pool.query(
    `UPDATE transactions SET ${setClauses.join(', ')} WHERE ${where}`,
    [userId, ...condParams, ...setParams]
  );
  console.log(`DB: sweepTransactionsByConditions matched ${result.rowCount}`);
  return { matchedCount: result.rowCount, modifiedCount: result.rowCount };
}

// ========================
//  SPLIT TRANSACTIONS
// ========================

async function insertSplitChildren(parentId, parentTransactionId, parentFields, splits) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE transactions SET is_split_parent = true WHERE id = $1',
      [parentId]
    );
    const children = [];
    for (let i = 0; i < splits.length; i++) {
      const txnId = `split-${parentTransactionId}-${i}`;
      const result = await client.query(
        `INSERT INTO transactions (
          transaction_id, user_id, date, effective_date, account, account_id,
          name, merchant_name, plaid_pfc, plaid_pfc_detail, exclude_from_total,
          amount, mapped_category, note, manually_set, parent_transaction_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15)
        RETURNING ${TXN_COLUMNS}`,
        [
          txnId, parentFields.userId, parentFields.date, parentFields.effectiveDate || null,
          parentFields.account || null, parentFields.accountId || null, parentFields.name,
          parentFields.merchantName || null, parentFields.plaidPfc || null,
          parentFields.plaidPfcDetail || null,
          parentFields.excludeFromTotal || false,
          splits[i].amount, splits[i].categoryName, splits[i].note || null, parentId,
        ]
      );
      children.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return children;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteSplitChildren(parentId) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM transactions WHERE parent_transaction_id = $1',
      [parentId]
    );
    const result = await client.query(
      `UPDATE transactions SET is_split_parent = false
       WHERE id = $1 RETURNING ${TXN_COLUMNS}`,
      [parentId]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function findSplitChildren(parentId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT ${TXN_COLUMNS} FROM transactions t
     WHERE parent_transaction_id = $1 ORDER BY amount DESC`,
    [parentId]
  );
  return result.rows;
}

async function deleteTransactions(userId) {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM transactions WHERE user_id = $1`, [userId]
  );
  return { deletedCount: result.rowCount };
}

async function deleteTransactionsByIds(userId, transactionIds) {
  if (!transactionIds || transactionIds.length === 0) return { deletedCount: 0 };
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM transactions WHERE user_id = $1 AND transaction_id = ANY($2)`,
    [userId, transactionIds]
  );
  return { deletedCount: result.rowCount };
}

async function findUnmappedTransactions(userId) {
  const pool = getPool();
  const where = userId
    ? `user_id = $1 AND mapped_category IS NULL AND (is_split_parent IS NOT TRUE)`
    : `mapped_category IS NULL AND (is_split_parent IS NOT TRUE)`;
  const params = userId ? [userId] : [];
  const { rows } = await pool.query(
    `SELECT ${TXN_COLUMNS} FROM transactions WHERE ${where}`, params
  );
  return rows;
}

async function cleanPendingTransactions(userId) {
  const pool = getPool();
  const whereUser = userId ? ' AND t1.user_id = $1' : '';
  const params = userId ? [userId] : [];
  const result = await pool.query(
    `DELETE FROM transactions t1
     WHERE t1.pending = true${whereUser}
     AND EXISTS (
       SELECT 1 FROM transactions t2
       WHERE t2.pending_transaction_id = t1.transaction_id
       AND t2.pending = false
       AND t2.user_id = t1.user_id
     )`,
    params
  );
  return { deletedCount: result.rowCount };
}

async function deduplicateTransactions(userId) {
  const pool = getPool();
  const params = userId ? [userId] : [];
  const whereUser = userId ? ' AND t1.user_id = $1' : '';
  const result = await pool.query(
    `DELETE FROM transactions t1
     USING transactions t2
     WHERE t1.transaction_id = t2.transaction_id
     AND t1.user_id = t2.user_id
     AND t1.id > t2.id${whereUser}`,
    params
  );
  console.log(`DB: deduplicateTransactions removed ${result.rowCount} duplicates`);
}

async function renameTransactionCategory(userId, oldName, newName) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE transactions SET mapped_category = $3
     WHERE user_id = $1 AND mapped_category = $2 AND (is_split_parent IS NOT TRUE)`,
    [userId, oldName, newName]
  );
  return { matchedCount: result.rowCount, modifiedCount: result.rowCount };
}

async function clearManualOverrides(userId) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE transactions SET manually_set = false
     WHERE user_id = $1 AND manually_set = true`,
    [userId]
  );
  return { matchedCount: result.rowCount, modifiedCount: result.rowCount };
}

async function clearVenmoEnrichment(userId) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE transactions SET venmo_id = NULL, venmo_note = NULL, venmo_counterparty = NULL
     WHERE user_id = $1 AND venmo_id IS NOT NULL`,
    [userId]
  );
  return { matchedCount: result.rowCount, modifiedCount: result.rowCount };
}

// ========================
//  PLAID ITEMS + ACCOUNTS
// ========================

async function findPlaidItems(userId) {
  const pool = getPool();
  const { rows: items } = await pool.query(
    `SELECT id, user_id AS "userId", institution, access_token AS "accessToken",
            next_cursor AS "nextCursor", prev_cursor AS "prevCursor",
            error_code AS "errorCode", error_message AS "errorMessage",
            error_detected_at AS "errorDetectedAt", created_at AS "createdAt",
            active, last_transactions_hash AS "lastTransactionsHash",
            enrollment_id AS "enrollmentId"
     FROM plaid_items WHERE user_id = $1 ORDER BY institution`,
    [userId]
  );
  if (items.length === 0) return [];

  const itemIds = items.map(it => it.id);
  const { rows: accounts } = await pool.query(
    `SELECT account_id AS "accountId", item_id AS "itemId",
            user_id AS "userId", name, official_name AS "officialName",
            mask, type, subtype, balance, available,
            "limit", balance_fetched_at AS "balanceFetchedAt", manual
     FROM plaid_accounts WHERE item_id = ANY($1)`,
    [itemIds]
  );

  const accountsByItem = {};
  for (const acct of accounts) {
    if (!accountsByItem[acct.itemId]) accountsByItem[acct.itemId] = [];
    accountsByItem[acct.itemId].push(acct);
  }

  // Fetch balance snapshots for all items in one query
  const { rows: snapshots } = await pool.query(
    `SELECT item_id AS "itemId", date, net, fetched_at AS "fetchedAt"
     FROM balance_snapshots WHERE item_id = ANY($1) ORDER BY date`,
    [itemIds]
  );
  const snapshotsByItem = {};
  for (const snap of snapshots) {
    if (!snapshotsByItem[snap.itemId]) snapshotsByItem[snap.itemId] = [];
    snapshotsByItem[snap.itemId].push(snap);
  }

  return items.map(item => {
    const accts = accountsByItem[item.id] || [];
    // Format balances in the shape createClientSideUser expects
    const balances = accts.length ? accts.map(a => ({
      account_id: a.accountId,
      name: a.name,
      official_name: a.officialName,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      current: a.balance,
      available: a.available,
      limit: a.limit,
      fetchedAt: a.balanceFetchedAt,
      ...(a.manual ? { manual: true } : {}),
    })) : null;

    // Build itemError from error columns
    const itemError = item.errorCode ? {
      error_code: item.errorCode,
      error_message: item.errorMessage,
      detected_at: item.errorDetectedAt,
    } : null;

    return {
      ...item,
      manual: !item.accessToken,
      accounts: accts,
      balances,
      balanceSnapshots: snapshotsByItem[item.id] || [],
      itemError,
    };
  });
}

async function findPlaidItemByInstitution(userId, institution) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, user_id AS "userId", institution, access_token AS "accessToken",
            next_cursor AS "nextCursor", prev_cursor AS "prevCursor",
            error_code AS "errorCode", error_message AS "errorMessage",
            error_detected_at AS "errorDetectedAt", created_at AS "createdAt",
            active, last_transactions_hash AS "lastTransactionsHash",
            enrollment_id AS "enrollmentId"
     FROM plaid_items WHERE user_id = $1 AND institution = $2`,
    [userId, institution]
  );
  if (rows.length === 0) return null;

  const item = rows[0];
  const { rows: accounts } = await pool.query(
    `SELECT account_id AS "accountId", item_id AS "itemId",
            user_id AS "userId", name, official_name AS "officialName",
            mask, type, subtype, balance, available,
            "limit", balance_fetched_at AS "balanceFetchedAt"
     FROM plaid_accounts WHERE item_id = $1`,
    [item.id]
  );
  item.accounts = accounts;
  return item;
}

async function insertPlaidItem({ userId, institution, accessToken, enrollmentId = null }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO plaid_items (user_id, institution, access_token, enrollment_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, institution, accessToken, enrollmentId]
  );
  return { id: rows[0].id };
}

const PLAID_ITEM_FIELD_MAP = {
  nextCursor: 'next_cursor',
  prevCursor: 'prev_cursor',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  errorDetectedAt: 'error_detected_at',
  accessToken: 'access_token',
};

async function updatePlaidItem(userId, institution, fields) {
  const pool = getPool();
  const setClauses = [];
  const params = [userId, institution];
  let i = 3;
  for (const [jsKey, sqlCol] of Object.entries(PLAID_ITEM_FIELD_MAP)) {
    if (jsKey in fields) {
      setClauses.push(`${sqlCol} = $${i}`);
      params.push(fields[jsKey]);
      i++;
    }
  }
  if (setClauses.length === 0) return;
  await pool.query(
    `UPDATE plaid_items SET ${setClauses.join(', ')}
     WHERE user_id = $1 AND institution = $2`,
    params
  );
}

async function updatePlaidItemByToken(accessToken, fields) {
  const pool = getPool();
  const setClauses = [];
  const params = [accessToken];
  let i = 2;
  for (const [jsKey, sqlCol] of Object.entries(PLAID_ITEM_FIELD_MAP)) {
    if (jsKey in fields) {
      setClauses.push(`${sqlCol} = $${i}`);
      params.push(fields[jsKey]);
      i++;
    }
  }
  if (setClauses.length === 0) return;
  await pool.query(
    `UPDATE plaid_items SET ${setClauses.join(', ')} WHERE access_token = $1`,
    params
  );
}

async function deletePlaidItem(userId, institution) {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM plaid_items WHERE user_id = $1 AND institution = $2`,
    [userId, institution]
  );
  return { deletedCount: result.rowCount };
}

// Delete only the ACTIVE connection for an institution (Teller path). Preserves
// frozen Plaid-era rows that share the institution name during side-by-side.
async function deleteActiveBankConnection(userId, institution) {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM plaid_items WHERE user_id = $1 AND institution = $2 AND active = true`,
    [userId, institution]
  );
  return { deletedCount: result.rowCount };
}

async function deleteAllPlaidItems(userId) {
  const pool = getPool();
  await pool.query(`DELETE FROM plaid_items WHERE user_id = $1`, [userId]);
}

async function upsertPlaidAccounts(itemId, userId, accounts) {
  if (!accounts || accounts.length === 0) return;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const a of accounts) {
      await client.query(
        `INSERT INTO plaid_accounts (account_id, item_id, user_id, name, official_name,
           mask, type, subtype, balance, available, "limit", balance_fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (account_id) DO UPDATE SET
           name = EXCLUDED.name, official_name = EXCLUDED.official_name,
           mask = EXCLUDED.mask, type = EXCLUDED.type, subtype = EXCLUDED.subtype,
           balance = EXCLUDED.balance, available = EXCLUDED.available,
           "limit" = EXCLUDED."limit", balance_fetched_at = EXCLUDED.balance_fetched_at`,
        [
          a.account_id, itemId, userId,
          a.name || null, a.official_name || null,
          a.mask || null, a.type || null, a.subtype || null,
          a.balances?.current ?? null,
          a.balances?.available ?? null,
          a.balances?.limit ?? null,
          new Date(),
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updatePlaidAccountBalances(itemId, accounts) {
  if (!accounts || accounts.length === 0) return;
  const pool = getPool();
  for (const a of accounts) {
    await pool.query(
      `UPDATE plaid_accounts
       SET balance = $2, available = $3, "limit" = $4, balance_fetched_at = $5
       WHERE account_id = $1`,
      [a.account_id, a.balances?.current ?? null, a.balances?.available ?? null,
       a.balances?.limit ?? null, new Date()]
    );
  }
}

// ---- Balance Snapshots ----

async function upsertBalanceSnapshot(itemId, { date, net, fetchedAt }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO balance_snapshots (item_id, date, net, fetched_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id, date) DO UPDATE
       SET net = EXCLUDED.net, fetched_at = EXCLUDED.fetched_at
       WHERE balance_snapshots.net IS DISTINCT FROM EXCLUDED.net`,
    [itemId, date, net, fetchedAt || new Date()]
  );
}

// Persist the fingerprint of a connection's last full transaction pull.
async function updateConnectionHash(connectionId, hash) {
  const pool = getPool();
  await pool.query(
    `UPDATE plaid_items SET last_transactions_hash = $2 WHERE id = $1`,
    [connectionId, hash]
  );
}

// Pending-sweep: delete this user's pending rows on the given accounts that the
// latest Teller pull no longer reports (they posted under a new id, or dropped).
// Returns the number of rows removed.
async function sweepPendingTransactions(userId, accountIds, freshIds) {
  if (!accountIds.length) return 0;
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM transactions
      WHERE user_id = $1
        AND account_id = ANY($2)
        AND pending = true
        AND NOT (transaction_id = ANY($3))`,
    [userId, accountIds, freshIds]
  );
  return result.rowCount;
}

async function findBalanceSnapshots(itemId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT date, net, fetched_at AS "fetchedAt"
     FROM balance_snapshots WHERE item_id = $1 ORDER BY date`,
    [itemId]
  );
  return rows;
}

async function findBalanceSnapshotsByUser(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT bs.item_id AS "itemId", bs.date, bs.net, bs.fetched_at AS "fetchedAt"
     FROM balance_snapshots bs
     JOIN plaid_items pi ON pi.id = bs.item_id
     WHERE pi.user_id = $1
     ORDER BY bs.date`,
    [userId]
  );
  return rows;
}

async function deleteBalanceSnapshots(userId) {
  const pool = getPool();
  await pool.query(
    `DELETE FROM balance_snapshots bs
     USING plaid_items pi
     WHERE bs.item_id = pi.id AND pi.user_id = $1`,
    [userId]
  );
}

// ========================
//  TAGS
// ========================

async function findTags(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, created_at AS "createdAt"
     FROM tags WHERE user_id = $1 ORDER BY name`,
    [userId]
  );
  return rows;
}

async function insertTag(userId, name) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO tags (user_id, name) VALUES ($1, $2)
     RETURNING id, name, created_at AS "createdAt"`,
    [userId, name]
  );
  return rows[0];
}

async function deleteTag(tagId, userId) {
  const pool = getPool();
  await pool.query(
    `DELETE FROM tags WHERE id = $1 AND user_id = $2`,
    [tagId, userId]
  );
}

async function tagTransactions(userId, transactionIds, tagIds) {
  if (!transactionIds.length || !tagIds.length) return 0;
  const pool = getPool();
  // Validate ownership
  const { rows: validTxns } = await pool.query(
    `SELECT transaction_id FROM transactions WHERE transaction_id = ANY($1) AND user_id = $2`,
    [transactionIds, userId]
  );
  const { rows: validTags } = await pool.query(
    `SELECT id FROM tags WHERE id = ANY($1) AND user_id = $2`,
    [tagIds, userId]
  );
  const txnIds = validTxns.map(r => r.transaction_id);
  const tIds = validTags.map(r => r.id);
  if (!txnIds.length || !tIds.length) return 0;

  const values = [];
  const params = [];
  let idx = 1;
  for (const txnId of txnIds) {
    for (const tagId of tIds) {
      values.push(`($${idx}, $${idx + 1})`);
      params.push(txnId, tagId);
      idx += 2;
    }
  }
  const { rowCount } = await pool.query(
    `INSERT INTO transaction_tags (transaction_id, tag_id)
     VALUES ${values.join(', ')}
     ON CONFLICT DO NOTHING`,
    params
  );
  return rowCount;
}

async function untagTransactions(userId, transactionIds, tagIds) {
  if (!transactionIds.length || !tagIds.length) return 0;
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM transaction_tags tt
     USING transactions t
     WHERE tt.transaction_id = t.transaction_id
       AND t.user_id = $1
       AND tt.transaction_id = ANY($2)
       AND tt.tag_id = ANY($3)`,
    [userId, transactionIds, tagIds]
  );
  return rowCount;
}

async function findTagSummary(tagId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       t.id, t.name AS "tagName",
       COUNT(DISTINCT tt.transaction_id) AS "transactionCount",
       COALESCE(SUM(txn.amount), 0) AS "totalSpend",
       MIN(txn.date) AS "earliest",
       MAX(txn.date) AS "latest"
     FROM tags t
     LEFT JOIN transaction_tags tt ON tt.tag_id = t.id
     LEFT JOIN transactions txn ON txn.transaction_id = tt.transaction_id
       AND (txn.is_split_parent IS NOT TRUE)
     WHERE t.id = $1 AND t.user_id = $2
     GROUP BY t.id, t.name`,
    [tagId, userId]
  );
  if (!rows.length) return null;
  return rows[0];
}

async function findTagCategoryBreakdown(tagId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT txn.mapped_category AS "category", SUM(txn.amount) AS "amount"
     FROM transaction_tags tt
     JOIN transactions txn ON txn.transaction_id = tt.transaction_id
     WHERE tt.tag_id = $1 AND txn.user_id = $2 AND (txn.is_split_parent IS NOT TRUE)
     GROUP BY txn.mapped_category
     ORDER BY SUM(txn.amount) DESC`,
    [tagId, userId]
  );
  return rows;
}

async function findTagTransactions(tagId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${TXN_COLUMNS}, ${TXN_TAGS_SUBQUERY}
     FROM transactions t
     WHERE t.transaction_id IN (
       SELECT transaction_id FROM transaction_tags WHERE tag_id = $1
     ) AND t.user_id = $2 AND (t.is_split_parent IS NOT TRUE)
     ORDER BY t.date DESC`,
    [tagId, userId]
  );
  return rows;
}

// ========================
//  AGGREGATIONS
// ========================

async function findMerchantsWithStats(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT merchant_name, COUNT(*)::int AS count,
            ARRAY_AGG(DISTINCT mapped_category)
              FILTER (WHERE mapped_category IS NOT NULL) AS categories
     FROM transactions
     WHERE user_id = $1 AND merchant_name IS NOT NULL AND (is_split_parent IS NOT TRUE)
     GROUP BY merchant_name
     ORDER BY merchant_name`,
    [userId]
  );
  return rows.map(r => ({
    merchant_name: r.merchant_name,
    count: r.count,
    categories: (r.categories || []).sort(),
  }));
}

async function findDistinctMerchants(userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT DISTINCT merchant_name FROM transactions
     WHERE user_id = $1 AND merchant_name IS NOT NULL
     ORDER BY merchant_name`,
    [userId]
  );
  return rows.map(r => r.merchant_name);
}

async function findHistoricalCategoryMap(userId, monthsBack = 12) {
  const pool = getPool();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { rows } = await pool.query(
    `WITH ranked AS (
       SELECT merchant_name, mapped_category,
              ROW_NUMBER() OVER (PARTITION BY merchant_name ORDER BY date DESC) AS rn,
              COUNT(*) OVER (PARTITION BY merchant_name) AS count
       FROM transactions
       WHERE user_id = $1 AND merchant_name IS NOT NULL
         AND mapped_category IS NOT NULL AND mapped_category != 'To Sort'
         AND date >= $2 AND (is_split_parent IS NOT TRUE)
     )
     SELECT merchant_name, mapped_category AS category, count
     FROM ranked WHERE rn = 1
     ORDER BY count DESC`,
    [userId, cutoffStr]
  );

  const map = {};
  for (const r of rows) {
    map[r.merchant_name] = { category: r.category, count: r.count };
  }
  return map;
}

// ========================
//  NUKE (delete all user data)
// ========================

async function nukeAllUserData(userId) {
  const pool = getPool();
  await Promise.all([
    pool.query(`DELETE FROM transactions WHERE user_id = $1`, [userId]),
    pool.query(`DELETE FROM categories WHERE user_id = $1`, [userId]),
    pool.query(`DELETE FROM compound_rules WHERE user_id = $1`, [userId]),
    pool.query(`DELETE FROM plaid_items WHERE user_id = $1`, [userId]),
  ]);
  await pool.query(
    `UPDATE users SET onboarded_at = NULL WHERE id = $1`, [userId]
  );
}

// ========================
//  SYNC LOG
// ========================

async function insertSyncLog({ userId, institution, addedCount, modifiedCount, removedCount }) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO sync_log (user_id, institution, added_count, modified_count, removed_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, institution, addedCount || 0, modifiedCount || 0, removedCount || 0]
  );
}

// ========================
//  EXPORTS
// ========================

module.exports = {
  connectToDb,
  getPool,
  // Users
  findUser,
  insertUser,
  updateUser,
  updateUserPreferences,
  findAllUsers,
  // Categories
  findCategories,
  insertCategory,
  insertCategories,
  updateCategory,
  deleteCategory,
  removePfcFromOtherCategories,
  removePfcFromAllCategories,
  // Simple Rules
  addSimpleRule,
  removeSimpleRule,
  removeSimpleRuleFromAll,
  // Compound Rules
  findUserRules,
  insertRule,
  updateCompoundRule,
  deleteCompoundRule,
  // Transactions
  findTransactionsByMonth,
  findTransactionsPaginated,
  insertTransactions,
  updateTransaction,
  updateTransactionsBulk,
  updateTransactionsByMerchant,
  updateTransactionsByName,
  sweepTransactionsByConditions,
  renameTransactionCategory,
  deleteTransactions,
  deleteTransactionsByIds,
  findUnmappedTransactions,
  cleanPendingTransactions,
  deduplicateTransactions,
  clearManualOverrides,
  clearVenmoEnrichment,
  // Split Transactions
  insertSplitChildren,
  deleteSplitChildren,
  findSplitChildren,
  // Plaid Items + Accounts
  findPlaidItems,
  findPlaidItemByInstitution,
  insertPlaidItem,
  updatePlaidItem,
  updatePlaidItemByToken,
  deletePlaidItem,
  deleteActiveBankConnection,
  deleteAllPlaidItems,
  upsertPlaidAccounts,
  updatePlaidAccountBalances,
  upsertBalanceSnapshot,
  updateConnectionHash,
  sweepPendingTransactions,
  findBalanceSnapshots,
  findBalanceSnapshotsByUser,
  deleteBalanceSnapshots,
  // Aggregations
  findMerchantsWithStats,
  findDistinctMerchants,
  findHistoricalCategoryMap,
  // Nuke
  nukeAllUserData,
  // Tags
  findTags,
  insertTag,
  deleteTag,
  tagTransactions,
  untagTransactions,
  findTagSummary,
  findTagCategoryBreakdown,
  findTagTransactions,
  // Sync Log
  insertSyncLog,
  // Utilities (exported for testing)
  buildSetClause,
  conditionsToSqlWhere,
  TXN_FIELD_MAP,
  TXN_COLUMNS,
  getPool,
};
