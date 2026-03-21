# Transaction Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users split a single transaction across multiple categories with an inline editor in the Edit Transaction dialog and triage flow.

**Architecture:** Children-as-real-rows model. Two new columns on `transactions` (`parent_transaction_id`, `is_split_parent`). Parent gets flagged and filtered out of all queries/views. Children are normal transactions. Inline split editor replaces category/note fields when activated. Auto-remainder UX flows amount to next row.

**Tech Stack:** Postgres (migration), Express.js (API routes), Vue 3 + Quasar 2 + Vuex 4 (frontend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-20-transaction-splitting-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/007-transaction-splitting.sql` | Create | Schema: new columns + index |
| `db/database.js` | Modify | `TXN_COLUMNS`, `TXN_FIELD_MAP`, parent filter on ~12 queries, new `insertSplitChildren` + `deleteSplitChildren` + `findSplitChildren`, sync guard in `insertTransactions` |
| `api.js` | Modify | New `POST /split` and `POST /unsplit` routes |
| `frontend/src/api.js` | Modify | New `splitTransaction()` + `unsplitTransaction()` client functions |
| `frontend/src/store.js` | Modify | Extract `rebuildFlatArray` helper (with parent filter), new `splitTransaction` + `unsplitTransaction` mutations |
| `frontend/src/components/DialogComponent.vue` | Modify | Split button, inline split editor mode, attribution line for children |
| `frontend/src/views/BudgetView.vue` | Modify | Split button in triage, undo toasts for split/unsplit, pass split-related data to dialog |
| `__tests__/splitting.test.js` | Create | Backend: DB helpers, API validation |
| `frontend/src/__tests__/splitting.test.js` | Create | Frontend: store mutations, split editor logic |

---

## Task 1: Schema Migration

**Files:**
- Create: `db/migrations/007-transaction-splitting.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 007-transaction-splitting.sql
ALTER TABLE transactions ADD COLUMN parent_transaction_id UUID REFERENCES transactions(id);
ALTER TABLE transactions ADD COLUMN is_split_parent BOOLEAN DEFAULT false;
CREATE INDEX idx_txn_parent ON transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;
```

- [ ] **Step 2: Run the migration**

Run: `psql $DATABASE_URL -f db/migrations/007-transaction-splitting.sql`
Expected: `ALTER TABLE` x2, `CREATE INDEX` x1, no errors.

- [ ] **Step 3: Verify columns exist**

Run: `psql $DATABASE_URL -c "\d transactions" | grep -E "parent_transaction_id|is_split_parent"`
Expected: Both columns listed with correct types.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/007-transaction-splitting.sql
git commit -m "feat(schema): add parent_transaction_id and is_split_parent columns"
```

---

## Task 2: Database Helpers — Column Maps + Parent Filter

**Files:**
- Modify: `db/database.js`
- Create: `__tests__/splitting.test.js`

Read `db/database.js` before making any changes. Key locations:
- `TXN_COLUMNS` (lines ~28-40)
- `TXN_FIELD_MAP` (lines ~50-69)

- [ ] **Step 1: Add new columns to `TXN_COLUMNS`**

Add `'parent_transaction_id AS "parentTransactionId"'` and `'is_split_parent AS "isSplitParent"'` to the `TXN_COLUMNS` array.

- [ ] **Step 2: Add new fields to `TXN_FIELD_MAP`**

Add to the `TXN_FIELD_MAP` object:
```javascript
parentTransactionId: 'parent_transaction_id',
isSplitParent: 'is_split_parent',
```

- [ ] **Step 3: Add parent filter to all 12 queries**

For each function below, add `AND (is_split_parent IS NOT TRUE)` to the WHERE clause. Read each function first to find the exact insertion point.

**Transaction queries:**
- `findTransactionsByMonth` (~line 379)
- `findTransactionsPaginated` (~line 391)
- `findUnmappedTransactions` (~line 626)
- `renameTransactionCategory` (~line 671)

**Sweep/update queries:**
- `sweepTransactionsByConditions` (~line 591)
- `updateTransactionsByMerchant` (~line 535)
- `updateTransactionsByName` (~line 548)

**Tag aggregate queries:**
- `findTagTransactions` (~line 1090)
- `findTagSummary` (~line 1056)
- `findTagCategoryBreakdown` (~line 1076)

**Merchant aggregate queries:**
- `findMerchantsWithStats` (~line 1108)
- `findHistoricalCategoryMap` (~line 1138)

- [ ] **Step 4: Run existing tests to make sure nothing broke**

Run: `npx vitest run __tests__/database.test.js`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add db/database.js
git commit -m "feat(db): add split columns to TXN_COLUMNS/FIELD_MAP, parent filter on 12 queries"
```

---

## Task 3: Database Helpers — Split CRUD Functions

**Files:**
- Modify: `db/database.js`
- Create: `__tests__/splitting.test.js`

- [ ] **Step 1: Write tests for the new DB helpers**

Create `__tests__/splitting.test.js`. These test the pure logic of the helper functions (input validation, SQL building) — not actual DB calls.

```javascript
import { describe, it, expect } from 'vitest';

// Tests will validate the exported function signatures and basic behavior
// once the functions are implemented. For now, test the split transaction_id
// generation pattern and field inheritance logic.

describe('split transaction_id generation', () => {
  it('should generate unique transaction_ids for children', () => {
    // split-{parentTransactionId}-0, split-{parentTransactionId}-1, etc.
    const parentTxnId = 'abc123';
    const childIds = [0, 1, 2].map(i => `split-${parentTxnId}-${i}`);
    expect(childIds).toEqual(['split-abc123-0', 'split-abc123-1', 'split-abc123-2']);
    expect(new Set(childIds).size).toBe(3); // all unique
  });

  it('should not collide with Plaid transaction ID format', () => {
    const plaidId = 'wvqrVjNdMBCJkMa7D6DGCxxgqEPe3mCZrqWqd';
    const splitId = 'split-abc123-0';
    expect(splitId.startsWith('split-')).toBe(true);
    expect(plaidId.startsWith('split-')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/splitting.test.js`
Expected: PASS

- [ ] **Step 3: Write `insertSplitChildren` function**

Add to `db/database.js` near the other transaction helpers. Read the file first to find the right location (after `updateTransactionsByName`, before `sweepTransactionsByConditions` or at the end of the transaction section).

```javascript
/**
 * Insert split children for a parent transaction.
 * @param {string} parentId - Parent's UUID id
 * @param {string} parentTransactionId - Parent's transaction_id (Plaid ID)
 * @param {Object} parentFields - Fields to inherit: userId, date, effectiveDate,
 *   account, accountId, name, merchantName, plaidPfc, plaidPfcDetail, excludeFromTotal
 * @param {Array} splits - [{ amount, categoryName, note? }]
 * @returns {Array} Inserted child rows
 */
async function insertSplitChildren(parentId, parentTransactionId, parentFields, splits) {
  const children = [];
  for (let i = 0; i < splits.length; i++) {
    const txnId = `split-${parentTransactionId}-${i}`;
    const result = await pool.query(
      `INSERT INTO transactions (
        transaction_id, user_id, date, effective_date, account, account_id,
        name, merchant_name, plaid_pfc, plaid_pfc_detail, exclude_from_total,
        amount, mapped_category, note, manually_set, parent_transaction_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15)
      RETURNING ${TXN_COLUMNS}`,
      [
        txnId, parentFields.userId, parentFields.date, parentFields.effectiveDate,
        parentFields.account, parentFields.accountId, parentFields.name,
        parentFields.merchantName, parentFields.plaidPfc, parentFields.plaidPfcDetail,
        parentFields.excludeFromTotal || false,
        splits[i].amount, splits[i].categoryName, splits[i].note || null, parentId
      ]
    );
    children.push(result.rows[0]);
  }
  return children;
}
```

- [ ] **Step 4: Write `deleteSplitChildren` function**

```javascript
/**
 * Delete all split children for a parent, unflag the parent.
 * @param {string} parentId - Parent's UUID id
 * @returns {Object} Updated parent row
 */
async function deleteSplitChildren(parentId) {
  await pool.query(
    'DELETE FROM transactions WHERE parent_transaction_id = $1',
    [parentId]
  );
  const result = await pool.query(
    `UPDATE transactions SET is_split_parent = false
     WHERE id = $1 RETURNING ${TXN_COLUMNS}`,
    [parentId]
  );
  return result.rows[0];
}
```

- [ ] **Step 5: Write `findSplitChildren` function**

```javascript
/**
 * Find all split children for a parent transaction.
 * @param {string} parentId - Parent's UUID id
 * @returns {Array} Child rows
 */
async function findSplitChildren(parentId) {
  const result = await pool.query(
    `SELECT ${TXN_COLUMNS} FROM transactions
     WHERE parent_transaction_id = $1 ORDER BY amount DESC`,
    [parentId]
  );
  return result.rows;
}
```

- [ ] **Step 6: Export the new functions**

Add `insertSplitChildren`, `deleteSplitChildren`, and `findSplitChildren` to the `module.exports` object at the bottom of `db/database.js`.

- [ ] **Step 7: Add sync guard for modified transactions**

The sync guard does NOT go in `insertTransactions` (which uses `ON CONFLICT DO NOTHING` — safe for inserts). The risk is in the **modified transactions** path in `utils/plaidTools.js`, where Plaid sends updated data for existing transactions and the code calls `updateTransaction()` for each one.

Read `utils/plaidTools.js` and find the loop that processes `modifiedTxns`. Before calling `updateTransaction` for a modified transaction, query whether the existing row has `is_split_parent = true`. If so, skip the `amount` field from the update (other fields like name, merchant_name, pending status can still update).

```javascript
// In the modifiedTxns loop:
for (const txn of modifiedTxns) {
  // Check if this transaction is a split parent
  const existing = await pool.query(
    'SELECT is_split_parent FROM transactions WHERE transaction_id = $1 AND user_id = $2',
    [txn.transaction_id, userId]
  );
  const fields = { /* ... existing field mapping ... */ };
  if (existing.rows[0]?.is_split_parent) {
    delete fields.amount; // Preserve the original amount
  }
  await updateTransaction(userId, txn.transaction_id, fields);
}
```

If `plaidTools.js` does not have a separate modified-transactions path (i.e., all synced transactions go through `insertTransactions` with `DO NOTHING`), then this guard is not needed for V1 — document as a known limitation.

- [ ] **Step 8: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add db/database.js __tests__/splitting.test.js
git commit -m "feat(db): add insertSplitChildren, deleteSplitChildren, findSplitChildren, sync guard"
```

---

## Task 4: Backend API Routes

**Files:**
- Modify: `api.js`

Read `api.js` before making changes. New routes go before `module.exports = router` (~line 1302). Follow the existing validation pattern (try/catch, `validateIdToken`, destructure body, validate, execute).

- [ ] **Step 1: Write `POST /split` route**

```javascript
router.post('/split', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transaction_id, splits } = req.body;

    // Validate splits array
    if (!Array.isArray(splits) || splits.length < 2) {
      return res.status(400).json({ message: 'At least 2 splits required' });
    }
    if (splits.length > 20) {
      return res.status(400).json({ message: 'Maximum 20 splits allowed' });
    }

    // Find parent transaction
    const parentResult = await db.pool.query(
      `SELECT ${db.TXN_COLUMNS} FROM transactions WHERE transaction_id = $1 AND user_id = $2`,
      [transaction_id, uid]
    );
    if (parentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    const parent = parentResult.rows[0];

    // Gate checks
    if (parent.pending) {
      return res.status(400).json({ message: 'Cannot split pending transactions' });
    }
    if (parent.amount < 0) {
      return res.status(400).json({ message: 'Cannot split income transactions' });
    }
    if (parent.parentTransactionId) {
      return res.status(400).json({ message: 'Cannot split a split child' });
    }
    if (parent.isSplitParent) {
      return res.status(400).json({ message: 'Transaction is already split. Unsplit first.' });
    }

    // Validate split amounts
    for (const s of splits) {
      if (typeof s.amount !== 'number' || s.amount <= 0) {
        return res.status(400).json({ message: 'All split amounts must be positive numbers' });
      }
      if (!s.categoryName || typeof s.categoryName !== 'string') {
        return res.status(400).json({ message: 'All splits must have a categoryName' });
      }
    }

    const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(splitSum - parent.amount) > 0.01) {
      return res.status(400).json({
        message: `Split amounts ($${splitSum.toFixed(2)}) must equal transaction amount ($${Number(parent.amount).toFixed(2)})`
      });
    }

    // Validate categories exist
    const categories = await db.findCategories(uid);
    const categoryNames = new Set(categories.map(c => c.category));
    for (const s of splits) {
      if (!categoryNames.has(s.categoryName)) {
        return res.status(400).json({ message: `Category "${s.categoryName}" not found` });
      }
    }

    // Execute split
    await db.pool.query(
      'UPDATE transactions SET is_split_parent = true WHERE id = $1',
      [parent.id]
    );

    const parentFields = {
      userId: uid,
      date: parent.date,
      effectiveDate: parent.effectiveDate,
      account: parent.account,
      accountId: parent.accountId,
      name: parent.name,
      merchantName: parent.merchantName,
      plaidPfc: parent.plaidPfc,
      plaidPfcDetail: parent.plaidPfcDetail,
      excludeFromTotal: parent.excludeFromTotal,
    };

    const children = await db.insertSplitChildren(
      parent.id, parent.transactionId, parentFields, splits
    );

    // Return updated parent
    const updatedParent = await db.pool.query(
      `SELECT ${db.TXN_COLUMNS} FROM transactions WHERE id = $1`,
      [parent.id]
    );

    res.json({ parent: updatedParent.rows[0], children });
  } catch (error) {
    console.error('/split error:', error.message);
    res.status(500).json({ message: 'Failed to split transaction' });
  }
});
```

- [ ] **Step 2: Write `POST /unsplit` route**

```javascript
router.post('/unsplit', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transaction_id } = req.body;

    // Find the transaction (could be parent or child)
    const txnResult = await db.pool.query(
      `SELECT ${db.TXN_COLUMNS} FROM transactions WHERE transaction_id = $1 AND user_id = $2`,
      [transaction_id, uid]
    );
    if (txnResult.rows.length === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    const txn = txnResult.rows[0];

    // Resolve to parent (ownership already verified by user_id in initial query)
    let parentId;
    if (txn.isSplitParent) {
      parentId = txn.id;
    } else if (txn.parentTransactionId) {
      // Verify the parent also belongs to this user
      const parentCheck = await db.pool.query(
        'SELECT id, user_id FROM transactions WHERE id = $1',
        [txn.parentTransactionId]
      );
      if (!parentCheck.rows[0] || parentCheck.rows[0].user_id !== uid) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      parentId = txn.parentTransactionId;
    } else {
      return res.status(400).json({ message: 'Transaction is not split' });
    }

    // Get children before deleting (for undo data in response)
    const children = await db.findSplitChildren(parentId);

    // Delete children and unflag parent
    const parent = await db.deleteSplitChildren(parentId);

    res.json({ parent, previousSplits: children });
  } catch (error) {
    console.error('/unsplit error:', error.message);
    res.status(500).json({ message: 'Failed to unsplit transaction' });
  }
});
```

- [ ] **Step 3: Export `TXN_COLUMNS` from database.js if not already exported**

Check if `TXN_COLUMNS` is exported from `db/database.js`. The `/split` route uses `db.TXN_COLUMNS` for the parent lookup query. If not exported, add it to `module.exports`. Alternatively, use an existing helper like `findTransactionById` if one exists — read the file to check.

- [ ] **Step 4: Test manually with curl or the frontend**

Run: `npm start` (backend)
Test: Create a split via curl against a test transaction. Verify parent is flagged, children are inserted. Then unsplit and verify children are deleted, parent is restored.

- [ ] **Step 5: Commit**

```bash
git add api.js db/database.js
git commit -m "feat(api): add POST /split and POST /unsplit routes"
```

---

## Task 5: Frontend API Client

**Files:**
- Modify: `frontend/src/api.js`

Read `frontend/src/api.js` to find the right insertion point (after the last exported function, before `ensureAppData`). Follow the existing pattern: `getAuthHeaders()`, `Content-Type: application/json`, `fetch`, `response.json()`.

- [ ] **Step 1: Add `splitTransaction` function**

```javascript
export async function splitTransaction(transactionId, splits) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/split', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transaction_id: transactionId, splits }),
  });
  if (response.ok) {
    return response.json();
  } else {
    const err = await response.json().catch(() => ({}));
    _notify({ type: 'negative', message: err.message || 'Failed to split transaction' });
  }
}
```

- [ ] **Step 2: Add `unsplitTransaction` function**

```javascript
export async function unsplitTransaction(transactionId) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/unsplit', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transaction_id: transactionId }),
  });
  if (response.ok) {
    return response.json();
  } else {
    const err = await response.json().catch(() => ({}));
    _notify({ type: 'negative', message: err.message || 'Failed to unsplit transaction' });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(api-client): add splitTransaction and unsplitTransaction"
```

---

## Task 6: Store Mutations

**Files:**
- Modify: `frontend/src/store.js`
- Create: `frontend/src/__tests__/splitting.test.js`

Read `frontend/src/store.js` before making changes. Key: all 6 flat array rebuild sites use the same pattern:
```javascript
state.transactions = Object.keys(state.transactionsByMonth).sort().reverse().flatMap(k => state.transactionsByMonth[k]);
```

- [ ] **Step 1: Write tests for store mutations**

Create `frontend/src/__tests__/splitting.test.js`:

```javascript
import { describe, it, expect } from 'vitest';

// Test the rebuildFlatArray filtering logic
describe('rebuildFlatArray', () => {
  it('should exclude split parents from flat array', () => {
    const state = {
      transactionsByMonth: {
        '2026-03': [
          { transaction_id: 'txn1', date: '2026-03-15', isSplitParent: true, amount: 100 },
          { transaction_id: 'split-txn1-0', date: '2026-03-15', parentTransactionId: 'uuid1', amount: 60 },
          { transaction_id: 'split-txn1-1', date: '2026-03-15', parentTransactionId: 'uuid1', amount: 40 },
          { transaction_id: 'txn2', date: '2026-03-10', amount: 50 },
        ],
      },
      transactions: [],
    };

    // Simulate rebuild with filter
    state.transactions = Object.keys(state.transactionsByMonth)
      .sort().reverse()
      .flatMap(k => state.transactionsByMonth[k])
      .filter(t => !t.isSplitParent);

    expect(state.transactions).toHaveLength(3);
    expect(state.transactions.find(t => t.isSplitParent)).toBeUndefined();
    expect(state.transactions.find(t => t.transaction_id === 'txn2')).toBeDefined();
  });

  it('should keep split parents in transactionsByMonth for lookups', () => {
    const state = {
      transactionsByMonth: {
        '2026-03': [
          { transaction_id: 'txn1', isSplitParent: true },
          { transaction_id: 'split-txn1-0', parentTransactionId: 'uuid1' },
        ],
      },
      transactions: [],
    };

    // transactionsByMonth still has the parent
    const parent = state.transactionsByMonth['2026-03'].find(t => t.isSplitParent);
    expect(parent).toBeDefined();
  });
});

describe('splitTransaction mutation', () => {
  it('should flag parent and insert children into month bucket', () => {
    const parent = { id: 'uuid1', transaction_id: 'txn1', date: '2026-03-15', amount: 100, isSplitParent: false };
    const state = {
      transactionsByMonth: { '2026-03': [parent] },
      transactions: [parent],
    };

    // Simulate mutation
    const monthKey = '2026-03';
    const idx = state.transactionsByMonth[monthKey].findIndex(t => t.id === parent.id);
    state.transactionsByMonth[monthKey][idx] = { ...parent, isSplitParent: true };

    const children = [
      { id: 'uuid2', transaction_id: 'split-txn1-0', date: '2026-03-15', amount: 60, parentTransactionId: 'uuid1' },
      { id: 'uuid3', transaction_id: 'split-txn1-1', date: '2026-03-15', amount: 40, parentTransactionId: 'uuid1' },
    ];
    state.transactionsByMonth[monthKey].push(...children);

    // Rebuild flat array (with filter)
    state.transactions = Object.keys(state.transactionsByMonth)
      .sort().reverse()
      .flatMap(k => state.transactionsByMonth[k])
      .filter(t => !t.isSplitParent);

    expect(state.transactions).toHaveLength(2);
    expect(state.transactions.map(t => t.amount)).toEqual([60, 40]);
  });
});

describe('unsplitTransaction mutation', () => {
  it('should remove children and unflag parent', () => {
    const parent = { id: 'uuid1', transaction_id: 'txn1', date: '2026-03-15', amount: 100, isSplitParent: true };
    const child1 = { id: 'uuid2', transaction_id: 'split-txn1-0', date: '2026-03-15', amount: 60, parentTransactionId: 'uuid1' };
    const child2 = { id: 'uuid3', transaction_id: 'split-txn1-1', date: '2026-03-15', amount: 40, parentTransactionId: 'uuid1' };
    const state = {
      transactionsByMonth: { '2026-03': [parent, child1, child2] },
      transactions: [child1, child2], // parent already filtered out
    };

    // Simulate unsplit
    const restoredParent = { ...parent, isSplitParent: false };
    const monthKey = '2026-03';
    state.transactionsByMonth[monthKey] = state.transactionsByMonth[monthKey]
      .filter(t => t.parentTransactionId !== parent.id);
    const parentIdx = state.transactionsByMonth[monthKey].findIndex(t => t.id === parent.id);
    state.transactionsByMonth[monthKey][parentIdx] = restoredParent;

    // Rebuild
    state.transactions = Object.keys(state.transactionsByMonth)
      .sort().reverse()
      .flatMap(k => state.transactionsByMonth[k])
      .filter(t => !t.isSplitParent);

    expect(state.transactions).toHaveLength(1);
    expect(state.transactions[0].transaction_id).toBe('txn1');
    expect(state.transactions[0].isSplitParent).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run frontend/src/__tests__/splitting.test.js`
Expected: PASS

- [ ] **Step 3: Extract `rebuildFlatArray` helper**

In `store.js`, create a private helper function above the store definition:

```javascript
/** Rebuild flat transactions array from month buckets, excluding split parents. */
function rebuildFlatArray(state) {
  state.transactions = Object.keys(state.transactionsByMonth)
    .sort().reverse()
    .flatMap(k => state.transactionsByMonth[k])
    .filter(t => !t.isSplitParent);
}
```

Replace all 5 inline `flatMap` rebuild sites with `rebuildFlatArray(state)`:
1. `setMonthTransactions` mutation (~line 85)
2. `updateTransaction` month-change branch (~line 136)
3. `linkTransaction` month-change branch (~line 173)
4. `unlinkTransaction` month-change branch (~line 247)
5. `renameCategory` mutation (~line 288)

**Note:** `setTransactions` (~line 66-78) is NOT one of these — it works in reverse (sets `state.transactions` directly from an input array, then populates `transactionsByMonth` from it). For `setTransactions`, add the parent filter at the end: after populating `transactionsByMonth`, call `rebuildFlatArray(state)` to re-derive the flat array with the filter applied. Read the existing code to confirm the flow.

- [ ] **Step 4: Run existing store tests to verify refactor didn't break anything**

Run: `npx vitest run frontend/src/__tests__/store.mutations.test.js`
Expected: All existing tests pass.

- [ ] **Step 5: Add `splitTransaction` mutation**

```javascript
splitTransaction(state, { parent, children }) {
  // Update parent in month bucket
  const parentMonth = (parent.effectiveDate || parent.date || '').slice(0, 7);
  if (state.transactionsByMonth[parentMonth]) {
    const idx = state.transactionsByMonth[parentMonth].findIndex(t => t.id === parent.id);
    if (idx !== -1) state.transactionsByMonth[parentMonth][idx] = parent;
  }
  // Insert children into their month buckets
  for (const child of children) {
    const childMonth = (child.effectiveDate || child.date || '').slice(0, 7);
    if (!state.transactionsByMonth[childMonth]) {
      state.transactionsByMonth[childMonth] = [];
    }
    state.transactionsByMonth[childMonth].push(child);
  }
  rebuildFlatArray(state);
},
```

- [ ] **Step 6: Add `unsplitTransaction` mutation**

```javascript
unsplitTransaction(state, { parent }) {
  // Remove children from all month buckets
  for (const month of Object.keys(state.transactionsByMonth)) {
    state.transactionsByMonth[month] = state.transactionsByMonth[month]
      .filter(t => t.parentTransactionId !== parent.id);
  }
  // Update parent in its month bucket
  const parentMonth = (parent.effectiveDate || parent.date || '').slice(0, 7);
  if (state.transactionsByMonth[parentMonth]) {
    const idx = state.transactionsByMonth[parentMonth].findIndex(t => t.id === parent.id);
    if (idx !== -1) state.transactionsByMonth[parentMonth][idx] = parent;
  }
  rebuildFlatArray(state);
},
```

- [ ] **Step 7: Run all frontend tests**

Run: `npx vitest run frontend/src/__tests__/`
Expected: All tests pass including new splitting tests.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/store.js frontend/src/__tests__/splitting.test.js
git commit -m "feat(store): rebuildFlatArray helper with split parent filter, split/unsplit mutations"
```

---

## Task 7: DialogComponent — Split Button + Inline Editor

**Files:**
- Modify: `frontend/src/components/DialogComponent.vue`

Read `DialogComponent.vue` in full before making changes. Key areas:
- Props (~line 483)
- Template: transaction form (~lines 14-116)
- Footer actions (~lines 109-115)
- `data()` return object
- `updateTransaction` method (~line 595)
- Emits list (~line 545)

This is the largest UI task. The split editor replaces the category/note/toggles section when activated.

- [ ] **Step 1: Add split-related data properties**

In the `data()` return object, add:

```javascript
splitMode: false,
splitRows: [],    // [{ amount: null, categoryName: '' }]
```

- [ ] **Step 2: Add computed properties for split state**

```javascript
computed: {
  canSplit() {
    if (!this.item) return false;
    if (this.item.pending) return false;
    if (this.item.amount < 0) return false;
    if (this.item.parentTransactionId) return false;
    if (this.item.isSplitParent) return false;
    return this.dialogType === 'transaction';
  },
  splitRemaining() {
    const total = Number(this.item?.amount || 0);
    const used = this.splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    return Math.round((total - used) * 100) / 100;
  },
  splitValid() {
    return Math.abs(this.splitRemaining) < 0.01
      && this.splitRows.length >= 2
      && this.splitRows.every(r => r.amount > 0 && r.categoryName);
  },
  isSplitChild() {
    return !!this.item?.parentTransactionId;
  },
},
```

- [ ] **Step 3: Add split methods**

```javascript
methods: {
  enterSplitMode() {
    this.splitMode = true;
    this.splitRows = [{ amount: Number(this.item.amount), categoryName: '' }];
  },
  exitSplitMode() {
    this.splitMode = false;
    this.splitRows = [];
  },
  updateSplitAmount(index, value) {
    this.splitRows[index].amount = Number(value) || 0;
    // Auto-add remainder row if this row has a category and there's remaining
    this.$nextTick(() => this.maybeAddRemainderRow());
  },
  updateSplitCategory(index, value) {
    this.splitRows[index].categoryName = value;
    this.$nextTick(() => this.maybeAddRemainderRow());
  },
  maybeAddRemainderRow() {
    const lastRow = this.splitRows[this.splitRows.length - 1];
    if (lastRow.amount > 0 && lastRow.categoryName && this.splitRemaining > 0.01) {
      this.splitRows.push({ amount: this.splitRemaining, categoryName: '' });
    }
  },
  removeSplitRow(index) {
    if (this.splitRows.length <= 1) return;
    this.splitRows.splice(index, 1);
  },
  saveSplit() {
    if (!this.splitValid) return;
    this.$emit('save-split', {
      transaction_id: this.item.transaction_id,
      splits: this.splitRows.map(r => ({
        amount: Number(r.amount),
        categoryName: r.categoryName,
        note: null,
      })),
    });
  },
  requestUnsplit() {
    this.$emit('unsplit', { transaction_id: this.item.transaction_id });
  },
}
```

- [ ] **Step 4: Add `save-split` and `unsplit` to emits**

Add `'save-split'` and `'unsplit'` to the emits array (~line 545).

- [ ] **Step 5: Update template — split mode toggle**

In the transaction form template, wrap the existing category/note/toggles section in a `v-if="!splitMode"` block. After it, add the split editor `v-else` block:

```html
<!-- Normal edit fields (hidden in split mode) -->
<template v-if="!splitMode">
  <!-- existing: date, category, note, tags, toggles, similar checkbox -->
</template>

<!-- Split editor -->
<template v-else>
  <!-- Remaining pill -->
  <div class="basil-split__remaining" :class="{ 'basil-split__remaining--done': Math.abs(splitRemaining) < 0.01 }">
    {{ Math.abs(splitRemaining) < 0.01 ? 'Balanced' : `$${splitRemaining.toFixed(2)} remaining` }}
  </div>

  <!-- Split rows -->
  <div class="basil-split__rows">
    <div v-for="(row, i) in splitRows" :key="i" class="basil-split__row">
      <q-input
        outlined dense
        type="number"
        :model-value="row.amount"
        @update:model-value="updateSplitAmount(i, $event)"
        prefix="$"
        class="basil-split__amount"
        step="0.01"
        min="0.01"
      />
      <q-select
        outlined dense
        :model-value="row.categoryName"
        @update:model-value="updateSplitCategory(i, $event)"
        :options="dropDownOptions"
        label="Category"
        class="basil-split__category"
        @touchmove.stop.prevent
      />
      <q-btn
        v-if="splitRows.length > 1"
        flat round dense
        icon="close"
        size="sm"
        color="negative"
        @click="removeSplitRow(i)"
      />
      <div v-else style="width: 36px" />
    </div>
  </div>
</template>
```

- [ ] **Step 6: Update footer actions for split mode**

Replace the existing footer with conditional rendering:

```html
<div class="basil-dialog-actions">
  <template v-if="splitMode">
    <q-btn flat label="Cancel split" @click="exitSplitMode()" />
    <q-btn
      unelevated label="Save split" color="primary"
      :disable="!splitValid"
      @click="saveSplit()"
    />
  </template>
  <template v-else>
    <q-btn flat label="Cancel" v-close-popup />
    <div class="basil-dialog-actions__right">
      <q-btn v-if="canSplit" flat label="Split" icon="call_split" @click="enterSplitMode()" />
      <q-btn flat label="Reset" @click="resetData()" />
      <q-btn unelevated label="Submit" color="primary" :disable="!formSubmittable" @click="updateTransaction" />
    </div>
  </template>
</div>
```

- [ ] **Step 7: Add split child attribution line**

In the attribution section of the template (near the existing `attribution` display, ~line 38-46), add:

```html
<div v-if="isSplitChild" class="basil-dialog-txn-attribution basil-dialog-txn-attribution--link" @click="requestUnsplit()">
  <q-icon name="call_split" size="14px" />
  <span>Split from ${{ Math.abs(parentAmount).toFixed(2) }} {{ item.merchant_name || item.name }} · Unsplit</span>
</div>
```

This needs the parent amount. Add a prop or look it up from the store. The simplest approach: the parent passes it as part of the `item` when opening the dialog. Add to the `item` object when building the dialog in BudgetView — the parent data is in `transactionsByMonth`.

Alternatively, add a computed:
```javascript
parentAmount() {
  if (!this.item?.parentTransactionId) return null;
  // Search transactionsByMonth for the parent
  for (const month of Object.values(this.$store.state.transactionsByMonth)) {
    const parent = month.find(t => t.id === this.item.parentTransactionId);
    if (parent) return parent.amount;
  }
  return null;
},
```

- [ ] **Step 8: Add CSS for split editor**

Add scoped styles or add to `dialogs.css` (check which pattern DialogComponent uses — likely scoped):

Add styles to `frontend/src/styles/dialogs.css` (shared by both DialogComponent and BudgetView triage):

```css
.basil-split__remaining {
  text-align: center;
  padding: var(--basil-space-2) 0 var(--basil-space-3);
  display: inline-block;
  padding: var(--basil-space-1) var(--basil-space-3);
  border-radius: var(--basil-radius-pill);
  background: var(--basil-warning-bg);
  color: var(--basil-warning);
}
.basil-split__remaining--done {
  background: var(--basil-positive-bg);
  color: var(--basil-positive);
}
.basil-split__rows {
  padding: 0 var(--basil-space-4);
}
.basil-split__row {
  display: flex;
  gap: var(--basil-space-2);
  align-items: center;
  margin-bottom: var(--basil-space-2);
}
.basil-split__amount {
  flex: 1;
}
.basil-split__category {
  flex: 1.5;
}
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/DialogComponent.vue
git commit -m "feat(dialog): inline split editor with auto-remainder, split child attribution"
```

---

## Task 8: BudgetView — Wire Up Split/Unsplit + Toasts

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`

Read BudgetView before making changes. Key areas:
- Dialog event handlers for the Edit Transaction dialog (~line 649 `@update-transaction="onSubmit"`)
- Triage actions template (~lines 809-819)
- `triageAccept` method (~line 1890)
- `onSubmit` method (~line 1783)

- [ ] **Step 1: Add `@save-split` and `@unsplit` handlers to all DialogComponent instances**

There are multiple places DialogComponent is used in BudgetView (category view dialog, table dialog, triage). Search for `<DialogComponent` and add the new event handlers to each:

```html
@save-split="handleSplit"
@unsplit="handleUnsplit"
```

- [ ] **Step 2: Import API functions**

At the top of the `<script>` section, add to the existing import from `../api.js`:

```javascript
import { splitTransaction, unsplitTransaction } from '../api.js';
```

(Or add to the existing import line if api functions are already imported.)

- [ ] **Step 3: Add `handleSplit` method**

```javascript
async handleSplit({ transaction_id, splits }) {
  const result = await splitTransaction(transaction_id, splits);
  if (!result) return;
  this.$store.commit('splitTransaction', result);
  // Close whichever dialog is open
  this.clicker = false;
  this.tableDialogOpen = false;
  this.triageOpen = false;
  // Rebuild page data
  this.groupTransactions();
  // Undo toast
  this.splitUndoData = { transaction_id, result };
  this.$q.notify({
    message: `Split into ${splits.length} categories`,
    color: 'dark',
    actions: [{
      label: 'Undo',
      color: 'white',
      handler: () => this.undoSplit(),
    }],
    timeout: 5000,
  });
},
```

- [ ] **Step 4: Add `handleUnsplit` method**

```javascript
async handleUnsplit({ transaction_id }) {
  const result = await unsplitTransaction(transaction_id);
  if (!result) return;
  this.$store.commit('unsplitTransaction', result);
  // Close dialog
  this.clicker = false;
  this.tableDialogOpen = false;
  // Rebuild page data
  this.groupTransactions();
  // Undo toast (re-split with previous data)
  const previousSplits = result.previousSplits;
  if (previousSplits?.length) {
    this.$q.notify({
      message: 'Restored original transaction',
      color: 'dark',
      actions: [{
        label: 'Undo',
        color: 'white',
        handler: async () => {
          const reSplit = await splitTransaction(
            result.parent.transactionId,
            previousSplits.map(c => ({
              amount: Number(c.amount),
              categoryName: c.mappedCategory,
              note: c.note,
            }))
          );
          if (reSplit) {
            this.$store.commit('splitTransaction', reSplit);
            this.groupTransactions();
          }
        },
      }],
      timeout: 5000,
    });
  }
},
```

- [ ] **Step 5: Add `undoSplit` method**

```javascript
async undoSplit() {
  if (!this.splitUndoData) return;
  const { transaction_id } = this.splitUndoData;
  const result = await unsplitTransaction(transaction_id);
  if (result) {
    this.$store.commit('unsplitTransaction', result);
    this.groupTransactions();
  }
  this.splitUndoData = null;
},
```

- [ ] **Step 6: Add `splitUndoData` to `data()`**

```javascript
splitUndoData: null,
```

- [ ] **Step 7: Add Split button to triage flow**

In the triage actions section (~lines 809-819), add a Split button before Skip:

```html
<div class="basil-triage__actions">
  <q-btn
    v-if="triageCanSplit"
    flat label="Split" icon="call_split"
    @click="triageSplitMode = true"
    :disable="triageSaving"
  />
  <q-btn flat label="Skip" @click="triageSkip()" :disable="triageSaving" />
  <q-btn
    unelevated color="primary" label="Save"
    :disable="!triageCategory || triageSaving"
    :loading="triageSaving"
    @click="triageAccept()"
  />
</div>
```

Add computed `triageCanSplit`:
```javascript
triageCanSplit() {
  const txn = this.triageItems[0];
  if (!txn) return false;
  return !txn.pending && txn.amount >= 0 && !txn.parentTransactionId && !txn.isSplitParent;
},
```

**Triage split editor:** When `triageSplitMode` is true, replace the category picker + similar checkbox section with split rows. The markup mirrors DialogComponent's split editor:

```html
<template v-if="triageSplitMode">
  <div class="basil-split__remaining" :class="{ 'basil-split__remaining--done': Math.abs(triageSplitRemaining) < 0.01 }">
    {{ Math.abs(triageSplitRemaining) < 0.01 ? 'Balanced' : `$${triageSplitRemaining.toFixed(2)} remaining` }}
  </div>
  <div class="basil-split__rows" style="padding: 0 var(--basil-space-4);">
    <div v-for="(row, i) in triageSplitRows" :key="i" class="basil-split__row">
      <q-input outlined dense type="number" :model-value="row.amount"
        @update:model-value="triageUpdateSplitAmount(i, $event)" prefix="$" class="basil-split__amount" step="0.01" min="0.01" />
      <q-select outlined dense :model-value="row.categoryName"
        @update:model-value="triageUpdateSplitCategory(i, $event)"
        :options="categoryMonthlyLimits.map(c => c.category).filter(c => c !== 'To Sort').sort()"
        label="Category" class="basil-split__category" @touchmove.stop.prevent />
      <q-btn v-if="triageSplitRows.length > 1" flat round dense icon="close" size="sm" color="negative"
        @click="triageSplitRows.splice(i, 1)" />
      <div v-else style="width: 36px" />
    </div>
  </div>
</template>
```

Add triage split data and methods:
- `triageSplitMode: false` and `triageSplitRows: []` in `data()`
- `triageSplitRemaining` computed (same logic as DialogComponent's `splitRemaining`)
- `triageUpdateSplitAmount`, `triageUpdateSplitCategory` methods (same auto-remainder logic)

Update triage actions when in split mode:
```html
<div class="basil-triage__actions">
  <q-btn flat label="Cancel split" @click="triageSplitMode = false; triageSplitRows = []" />
  <q-btn unelevated color="primary" label="Save split"
    :disable="Math.abs(triageSplitRemaining) > 0.01 || triageSplitRows.length < 2 || !triageSplitRows.every(r => r.amount > 0 && r.categoryName)"
    @click="handleSplit({ transaction_id: triageItems[0].transaction_id, splits: triageSplitRows })" />
</div>
```

Reset `triageSplitMode = false` in `triageAdvance()` so it clears when moving to the next transaction.

The split row CSS from DialogComponent's scoped styles (`.basil-split__*`) should be moved to `dialogs.css` so both DialogComponent and BudgetView can use it.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat(budget): wire up split/unsplit handlers, undo toasts, triage split button"
```

---

## Task 9: Split Badge on Transaction Rows

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`

- [ ] **Step 1: Add split badge to transaction rows**

In the "Show All" table row template (inside the name cell, near the existing relationship badges ~line 570-583), add:

```html
<span
  v-if="item.parentTransactionId"
  class="basil-relationship-badge"
>
  Split
  <q-tooltip>Part of a split transaction</q-tooltip>
</span>
```

This reuses the existing `basil-relationship-badge` class for consistent styling.

- [ ] **Step 2: Add split badge to budget category view rows**

Find the category view transaction rows (the collapsed view, ~lines 161-291) and add the same badge in the appropriate position near the merchant name.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat(ui): add split badge on transaction rows"
```

---

## Task 10: End-to-End Testing

- [ ] **Step 1: Run all automated tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Manual E2E test — split from Edit Transaction dialog**

1. Start backend (`npm start`) and frontend (`cd frontend && npm run dev`)
2. Open a transaction in the "Show All" table
3. Tap "Split" — verify category/note/toggles are replaced by split rows
4. First row has full amount, empty category
5. Change amount to partial, pick a category
6. Second row auto-appears with remainder
7. Pick category for second row
8. "Save split" enables when remaining = $0.00
9. Save — dialog closes, parent disappears, children appear in respective categories
10. Undo toast appears — tapping it restores the original transaction
11. Verify budget totals are correct (children sum = original amount)

- [ ] **Step 3: Manual E2E test — split from triage**

1. Navigate to budget view with unsorted transactions
2. Open triage flow (Sort Transactions)
3. On a suitable transaction, tap "Split"
4. Complete the split and save
5. Verify triage advances to next transaction

- [ ] **Step 4: Manual E2E test — unsplit from child edit dialog**

1. Find a split child in the transaction list (should have "Split" badge)
2. Open it — verify attribution line shows "Split from $X.XX Merchant · Unsplit"
3. Tap "Unsplit" — original transaction reappears, children removed
4. Undo toast appears — tapping it re-splits

- [ ] **Step 5: Manual E2E test — edge cases**

1. Try to split a pending transaction — "Split" button should be hidden
2. Try to split an income transaction (negative amount) — button hidden
3. Try to split a split child — button hidden
4. Verify charts (TrendsView) show correct totals after splitting
5. Verify search finds split children but not the hidden parent

- [ ] **Step 6: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix: address issues found during E2E testing"
```
