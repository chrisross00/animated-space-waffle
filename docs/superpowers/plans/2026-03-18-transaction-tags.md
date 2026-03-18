# Transaction Tags Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-defined tags to transactions so users can track spending across categories and months for trips, events, and recurring themes.

**Architecture:** Tags are a many-to-many relationship via a `transaction_tags` join table. Tag data loads with transactions via a lateral subquery (preserves existing `TXN_COLUMNS` pattern). Tags are managed via dedicated CRUD routes and applied via bulk-native tag/untag endpoints. Frontend surfaces: tag picker in edit dialog, bulk tag in Show All, tag badges on rows, dedicated `/tags` view, tag filter on Show All.

**Tech Stack:** Postgres (migration), Express.js (routes), Vue 3 + Quasar 2 + Vuex 4 (frontend)

**Spec:** `docs/superpowers/specs/2026-03-18-transaction-tags-design.md`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `db/migrations/005-tags.sql` | Create | Schema: `tags` + `transaction_tags` tables |
| `db/database.js` | Modify | Tag DB helpers + lateral subquery on transaction queries |
| `api.js` | Modify | Tag CRUD + tag/untag + tag summary routes |
| `frontend/src/api.js` | Modify | Frontend fetch wrappers for tag routes |
| `frontend/src/store.js` | Modify | `tags` state, mutations, `clearState` |
| `frontend/src/components/TagPicker.vue` | Create | Reusable tag picker (q-select with chips) |
| `frontend/src/components/DialogComponent.vue` | Modify | Add TagPicker to edit transaction form |
| `frontend/src/views/BudgetView.vue` | Modify | Tag badges on txn rows, bulk tag action, tag filter |
| `frontend/src/views/TagsView.vue` | Create | Dedicated tags view |
| `frontend/src/styles/tags.css` | Create | Tag badge + tags view styles |
| `frontend/src/routes.js` | Modify | Add `/tags` route |
| `frontend/src/App.vue` | Modify | Add Tags to drawer nav |

---

## Chunk 1: Schema + Database Layer

### Task 1: Migration

**Files:**
- Create: `db/migrations/005-tags.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Transaction tags
CREATE TABLE IF NOT EXISTS tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  -- FK targets the UNIQUE transaction_id column (Plaid-assigned), not the UUID id PK
  transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  tag_id         UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);
```

- [ ] **Step 2: Run migration locally**

Run: `psql -d basil -f db/migrations/005-tags.sql`

Expected: `CREATE TABLE` x2, `CREATE INDEX`

- [ ] **Step 3: Verify tables exist**

Run: `psql -d basil -c "\dt tags" -c "\dt transaction_tags"`

- [ ] **Step 4: Commit**

```bash
git add db/migrations/005-tags.sql
git commit -m "migration: add tags and transaction_tags tables"
```

---

### Task 2: Database helpers for tags

**Files:**
- Modify: `db/database.js`

- [ ] **Step 1: Add tag CRUD helpers**

Add near the bottom of `database.js`, before the `module.exports`:

```js
// ---- Tags ----

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
  // Validate ownership: only tag transactions + tags belonging to this user
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
  // Only untag transactions belonging to this user
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
     WHERE tt.tag_id = $1 AND txn.user_id = $2
     GROUP BY txn.mapped_category
     ORDER BY SUM(txn.amount) DESC`,
    [tagId, userId]
  );
  return rows;
}

// findTagTransactions is defined in Task 3 after TXN_TAGS_SUBQUERY exists
```

- [ ] **Step 2: Export the new helpers**

Add to `module.exports`:

```js
  // Tags
  findTags,
  insertTag,
  deleteTag,
  tagTransactions,
  untagTransactions,
  findTagSummary,
  findTagCategoryBreakdown,
  findTagTransactions,
```

- [ ] **Step 3: Run tests**

Run: `npm test` from root

Expected: All 132 tests pass (no new tests yet — helpers aren't tested directly)

- [ ] **Step 4: Commit**

```bash
git add db/database.js
git commit -m "feat: add tag database helpers"
```

---

### Task 3: Add tags lateral subquery to transaction queries

**Files:**
- Modify: `db/database.js` — `findTransactionsByMonth` (~line 363) and `findTransactionsPaginated` (~line 383)

- [ ] **Step 1: Define the tags subquery snippet**

Add near `TXN_COLUMNS` (line 28):

```js
const TXN_TAGS_SUBQUERY = `
  COALESCE((
    SELECT json_agg(json_build_object('id', tg.id, 'name', tg.name))
    FROM transaction_tags tt
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tt.transaction_id = t.transaction_id
  ), '[]'::json) AS tags`;
```

- [ ] **Step 2: Update `findTransactionsByMonth`**

Change the SELECT from:

```js
`SELECT ${TXN_COLUMNS} FROM transactions
```

To:

```js
`SELECT ${TXN_COLUMNS}, ${TXN_TAGS_SUBQUERY} FROM transactions t
```

Note: the table alias `t` is needed for the subquery correlation. Verify the WHERE
clause uses unqualified column names (they do — `user_id`, `effective_date`, `date`
are unambiguous since there's only one table).

- [ ] **Step 3: Update `findTransactionsPaginated`**

Same change — add `, ${TXN_TAGS_SUBQUERY}` to the SELECT and add `t` alias.

Both the count query and the data query need the alias on `transactions t`, but only
the data query gets the tags subquery (count doesn't need it).

- [ ] **Step 4: Add `findTagTransactions` helper**

This was deferred from Task 2 because it needs `TXN_TAGS_SUBQUERY`. Note: can't use
bare `TXN_COLUMNS` in a JOIN (ambiguous `transaction_id`). Use a subquery instead:

```js
async function findTagTransactions(tagId, userId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${TXN_COLUMNS}, ${TXN_TAGS_SUBQUERY}
     FROM transactions t
     WHERE t.transaction_id IN (
       SELECT transaction_id FROM transaction_tags WHERE tag_id = $1
     ) AND t.user_id = $2
     ORDER BY t.date DESC`,
    [tagId, userId]
  );
  return rows;
}
```

Using `IN (subquery)` instead of JOIN avoids the ambiguous column issue with
`TXN_COLUMNS` which has bare `transaction_id`.

- [ ] **Step 5: Run tests**

Run: `npm test` from root

Expected: All pass. The lateral subquery returns `[]` for untagged transactions.

- [ ] **Step 6: Commit**

```bash
git add db/database.js
git commit -m "feat: include tags on transaction query results via lateral subquery"
```

---

## Chunk 2: Backend API Routes

### Task 4: Tag CRUD routes

**Files:**
- Modify: `api.js`

- [ ] **Step 1: Import tag helpers**

Add to the destructured require from `./db/database`:

```js
findTags, insertTag, deleteTag, tagTransactions, untagTransactions,
findTagSummary, findTagCategoryBreakdown, findTagTransactions,
```

- [ ] **Step 2: Add tag CRUD routes**

Add before the Venmo enrichment section:

```js
// ---- Tags ----

router.get('/tags', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const tags = await findTags(uid);
    res.json(tags);
  } catch (error) {
    console.error('/tags error:', error);
    res.status(500).json({ message: 'Failed to fetch tags' });
  }
});

router.post('/tags', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    const tag = await insertTag(uid, name.trim());
    res.json(tag);
  } catch (error) {
    if (error.code === '23505') { // unique violation
      return res.status(409).json({ message: 'Tag already exists' });
    }
    console.error('/tags create error:', error);
    res.status(500).json({ message: 'Failed to create tag' });
  }
});

router.post('/deleteTag', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { tagId } = req.body;
    if (!tagId) return res.status(400).json({ message: 'tagId is required' });
    await deleteTag(tagId, uid);
    res.json({ ok: true });
  } catch (error) {
    console.error('/deleteTag error:', error);
    res.status(500).json({ message: 'Failed to delete tag' });
  }
});
```

- [ ] **Step 3: Add tag/untag routes**

```js
router.post('/tagTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionIds, tagIds } = req.body;
    if (!Array.isArray(transactionIds) || !Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'transactionIds and tagIds must be arrays' });
    }
    const tagged = await tagTransactions(uid, transactionIds, tagIds);
    res.json({ tagged });
  } catch (error) {
    console.error('/tagTransactions error:', error);
    res.status(500).json({ message: 'Failed to tag transactions' });
  }
});

router.post('/untagTransactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const { transactionIds, tagIds } = req.body;
    if (!Array.isArray(transactionIds) || !Array.isArray(tagIds)) {
      return res.status(400).json({ message: 'transactionIds and tagIds must be arrays' });
    }
    const untagged = await untagTransactions(uid, transactionIds, tagIds);
    res.json({ untagged });
  } catch (error) {
    console.error('/untagTransactions error:', error);
    res.status(500).json({ message: 'Failed to untag transactions' });
  }
});
```

- [ ] **Step 4: Add tag analytics routes**

```js
router.get('/tags/:id/summary', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const summary = await findTagSummary(req.params.id, uid);
    if (!summary) return res.status(404).json({ message: 'Tag not found' });
    const categoryBreakdown = await findTagCategoryBreakdown(req.params.id, uid);
    res.json({
      tag: { id: summary.id, name: summary.tagName },
      totalSpend: Number(summary.totalSpend),
      transactionCount: Number(summary.transactionCount),
      dateRange: { earliest: summary.earliest, latest: summary.latest },
      categoryBreakdown,
    });
  } catch (error) {
    console.error('/tags/:id/summary error:', error);
    res.status(500).json({ message: 'Failed to fetch tag summary' });
  }
});

router.get('/tags/:id/transactions', async (req, res) => {
  try {
    const decodedToken = await validateIdToken(req);
    const uid = decodedToken.uid;
    const transactions = await findTagTransactions(req.params.id, uid);
    res.json({ transactions });
  } catch (error) {
    console.error('/tags/:id/transactions error:', error);
    res.status(500).json({ message: 'Failed to fetch tag transactions' });
  }
});
```

- [ ] **Step 5: Run tests**

Run: `npm test` from root

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add api.js
git commit -m "feat: add tag CRUD, tag/untag, and tag analytics routes"
```

---

## Chunk 3: Frontend Store + API Wrappers

### Task 5: Store state and mutations

**Files:**
- Modify: `frontend/src/store.js`

- [ ] **Step 1: Add `tags` to state**

Add after `rules: []` (line 11):

```js
tags: [],
```

- [ ] **Step 2: Add `tags` to `clearState`**

Add after `state.rules = [];` (line 52):

```js
state.tags = [];
```

- [ ] **Step 3: Add tag mutations**

Add after the existing rule mutations:

```js
setTags(state, tags) {
    state.tags = tags || [];
},
addTag(state, tag) {
    state.tags.push(tag);
},
removeTag(state, tagId) {
    state.tags = state.tags.filter(t => t.id !== tagId);
    // Strip tag from all loaded transactions
    for (const txn of state.transactions) {
        if (txn.tags) {
            txn.tags = txn.tags.filter(t => t.id !== tagId);
        }
    }
},
setTransactionTags(state, { transactionIds, tags }) {
    const idSet = new Set(transactionIds);
    for (const txn of state.transactions) {
        if (idSet.has(txn.transaction_id)) {
            txn.tags = tags;
        }
    }
},
addTransactionTags(state, { transactionIds, tagIds }) {
    const idSet = new Set(transactionIds);
    const newTags = state.tags.filter(t => tagIds.includes(t.id));
    for (const txn of state.transactions) {
        if (idSet.has(txn.transaction_id)) {
            if (!txn.tags) txn.tags = [];
            for (const tag of newTags) {
                if (!txn.tags.some(t => t.id === tag.id)) {
                    txn.tags.push(tag);
                }
            }
        }
    }
},
removeTransactionTags(state, { transactionIds, tagIds }) {
    const idSet = new Set(transactionIds);
    const removeSet = new Set(tagIds);
    for (const txn of state.transactions) {
        if (idSet.has(txn.transaction_id) && txn.tags) {
            txn.tags = txn.tags.filter(t => !removeSet.has(t.id));
        }
    }
},
```

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm test`

Expected: All 153 pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store.js
git commit -m "feat: add tags state and mutations to Vuex store"
```

---

### Task 6: Frontend API wrappers + ensureAppData

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add tag API wrappers**

Add after the `deleteManualAccountApi` function:

```js
export async function fetchTags() {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/tags', { headers });
    if (response.ok) return response.json();
  }
  return [];
}

export async function createTag(name) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name }),
    });
    if (response.ok) return response.json();
    const err = await response.json().catch(() => ({}));
    _notify({ type: 'negative', message: err.message || 'Failed to create tag' });
  }
}

export async function deleteTagApi(tagId) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/deleteTag', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tagId }),
    });
    if (response.ok) return response.json();
    _notify({ type: 'negative', message: 'Failed to delete tag' });
  }
}

export async function tagTransactionsApi(transactionIds, tagIds) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/tagTransactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ transactionIds, tagIds }),
    });
    if (response.ok) return response.json();
    _notify({ type: 'negative', message: 'Failed to tag transactions' });
  }
}

export async function untagTransactionsApi(transactionIds, tagIds) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/untagTransactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ transactionIds, tagIds }),
    });
    if (response.ok) return response.json();
    _notify({ type: 'negative', message: 'Failed to untag transactions' });
  }
}

export async function fetchTagSummary(tagId) {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch(`/api/tags/${tagId}/summary`, { headers });
    if (response.ok) return response.json();
  }
}

export async function fetchTagTransactions(tagId) {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch(`/api/tags/${tagId}/transactions`, { headers });
    if (response.ok) return response.json();
  }
}
```

- [ ] **Step 2: Add fetchTags to ensureAppData**

In `ensureAppData` (~line 518), change:

```js
const [categories, rules] = await Promise.all([
    fetchCategories(),
    fetchRules(),
]);
if (categories) store.commit('setCategories', categories);
if (rules)      store.commit('setRules', rules);
```

To:

```js
const [categories, rules, tags] = await Promise.all([
    fetchCategories(),
    fetchRules(),
    fetchTags(),
]);
if (categories) store.commit('setCategories', categories);
if (rules)      store.commit('setRules', rules);
if (tags)       store.commit('setTags', tags);
```

- [ ] **Step 3: Run frontend tests + build**

Run: `cd frontend && npm test && npm run build`

Expected: All pass, build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat: add tag API wrappers and load tags in ensureAppData"
```

---

## Chunk 4: TagPicker Component + Edit Transaction Dialog

### Task 7: TagPicker component

**Files:**
- Create: `frontend/src/components/TagPicker.vue`

- [ ] **Step 1: Create TagPicker component**

```vue
<template>
  <q-select
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :options="filteredOptions"
    multiple
    use-chips
    use-input
    input-debounce="0"
    label="Tags"
    outlined
    dense
    @new-value="onNewValue"
    @filter="onFilter"
  >
    <template v-slot:no-option>
      <q-item>
        <q-item-section style="color: var(--basil-text-secondary); font-size: 0.8125rem;">
          Type to create a new tag
        </q-item-section>
      </q-item>
    </template>
  </q-select>
</template>

<script>
import { createTag } from '@/api';
import store from '../store';

export default {
  name: 'TagPicker',
  props: {
    modelValue: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],

  data() {
    return {
      filteredOptions: [],
    };
  },

  methods: {
    onFilter(val, update) {
      update(() => {
        const allTags = store.state.tags || [];
        const options = allTags.map(t => ({ label: t.name, value: t.id, id: t.id, name: t.name }));
        if (!val) {
          this.filteredOptions = options;
        } else {
          const needle = val.toLowerCase();
          this.filteredOptions = options.filter(o => o.label.toLowerCase().includes(needle));
        }
      });
    },

    async onNewValue(val, done) {
      const trimmed = val.trim();
      if (!trimmed) return done(null);
      // Check if tag already exists
      const existing = (store.state.tags || []).find(
        t => t.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        done({ label: existing.name, value: existing.id, id: existing.id, name: existing.name });
        return;
      }
      // Create new tag
      const tag = await createTag(trimmed);
      if (tag) {
        store.commit('addTag', tag);
        done({ label: tag.name, value: tag.id, id: tag.id, name: tag.name });
      } else {
        done(null);
      }
    },
  },
};
</script>
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TagPicker.vue
git commit -m "feat: add TagPicker component"
```

---

### Task 8: Add TagPicker to Edit Transaction dialog

**Files:**
- Modify: `frontend/src/components/DialogComponent.vue`

- [ ] **Step 1: Import TagPicker**

Add to the imports:

```js
import TagPicker from './TagPicker.vue';
```

Add to `components`:

```js
components: { TagPicker },
```

- [ ] **Step 2: Add tag state to data**

Add to `data()`:

```js
selectedTags: [],
originalTags: [],
```

- [ ] **Step 3: Initialize tags when dialog opens**

In the watcher or mounted logic that populates the dialog from `item` prop, add:

```js
this.selectedTags = (this.item?.tags || []).map(t => ({
  label: t.name, value: t.id, id: t.id, name: t.name
}));
this.originalTags = [...this.selectedTags];
```

Look for where `this.dialogBody` or similar fields are populated from `this.item` —
add the tag initialization alongside that.

- [ ] **Step 4: Add TagPicker to template**

Insert between `basil-dialog-fields` and `basil-dialog-toggles` sections. Find the
closing `</div>` of `basil-dialog-fields` and add after it:

```html
<div class="basil-dialog-tags q-px-md q-mb-sm">
  <TagPicker v-model="selectedTags" />
</div>
```

- [ ] **Step 5: Update `isFormSubmittable`**

The existing `isFormSubmittable` method controls whether Submit is enabled. Add a tag
diff check so the button enables when only tags changed:

```js
const tagsChanged = JSON.stringify(this.selectedTags.map(t => t.id || t.value).sort()) !==
                    JSON.stringify(this.originalTags.map(t => t.id || t.value).sort());
```

Return `true` if `tagsChanged` or any existing condition is true.

- [ ] **Step 6: Handle tag changes on submit**

Tag API calls are made directly in DialogComponent (not emitted to parent) — tags are
independent of the main transaction update and don't need the parent's orchestration.

In the submit handler, after the existing transaction update logic, add tag diffing:

```js
// Diff tags
const oldIds = new Set(this.originalTags.map(t => t.id || t.value));
const newIds = new Set(this.selectedTags.map(t => t.id || t.value));
const addedTagIds = [...newIds].filter(id => !oldIds.has(id));
const removedTagIds = [...oldIds].filter(id => !newIds.has(id));

if (addedTagIds.length) {
  await tagTransactionsApi([this.item.transaction_id], addedTagIds);
}
if (removedTagIds.length) {
  await untagTransactionsApi([this.item.transaction_id], removedTagIds);
}
// Update store
if (addedTagIds.length || removedTagIds.length) {
  this.$store.commit('setTransactionTags', {
    transactionIds: [this.item.transaction_id],
    tags: this.selectedTags.map(t => ({ id: t.id || t.value, name: t.label || t.name })),
  });
}
```

Import the API functions at the top:

```js
import { tagTransactionsApi, untagTransactionsApi } from '@/api';
```

- [ ] **Step 7: Verify build**

Run: `cd frontend && npm run build`

Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/DialogComponent.vue
git commit -m "feat: add TagPicker to edit transaction dialog"
```

---

## Chunk 5: Bulk Tagging + Tag Badges

### Task 9: Bulk tag action in Show All table

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`

- [ ] **Step 1: Add bulk tag state**

Add to `data()`:

```js
bulkTagOpen: false,
bulkTagSelection: [],
```

- [ ] **Step 2: Add "Tag" button to bulk action bars**

Find the desktop bulk action bar (near `applyBulkCategory`). Add a "Tag" button
alongside the existing category controls:

```html
<q-btn flat dense no-caps icon="sell" label="Tag" @click="bulkTagOpen = true" />
```

Do the same for the mobile bulk bar.

- [ ] **Step 3: Add bulk tag tray**

Add alongside other trays (near the VenmoEnrichmentDialog):

```html
<BasilTray v-model="bulkTagOpen" max-width="440px">
  <q-card flat>
    <div class="basil-dialog-header">
      <div class="basil-dialog-title">
        <span class="basil-dialog-title__sub">BULK TAG</span>
        <span class="basil-dialog-title__main">Tag {{ selectedRows.length }} transaction{{ selectedRows.length !== 1 ? 's' : '' }}</span>
      </div>
      <q-btn flat round dense icon="close" class="basil-dialog-close" @click="bulkTagOpen = false" />
    </div>
    <q-card-section>
      <TagPicker v-model="bulkTagSelection" />
    </q-card-section>
    <q-card-actions align="right" class="q-px-md q-pb-md">
      <q-btn flat label="Cancel" @click="bulkTagOpen = false" />
      <q-btn
        unelevated color="primary" label="Apply"
        :disable="!bulkTagSelection.length"
        @click="applyBulkTag"
      />
    </q-card-actions>
  </q-card>
</BasilTray>
```

- [ ] **Step 4: Add `applyBulkTag` method**

```js
async applyBulkTag() {
  const txnIds = this.selectedRows.map(r => r.transaction_id);
  const tagIds = this.bulkTagSelection.map(t => t.id || t.value);
  const result = await tagTransactionsApi(txnIds, tagIds);
  if (result) {
    this.$store.commit('addTransactionTags', { transactionIds: txnIds, tagIds });
    this.bulkTagOpen = false;
    this.bulkTagSelection = [];
    this.selectedRows = [];
  }
},
```

Import `TagPicker` and `tagTransactionsApi` at the top of the script.

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat: add bulk tag action to Show All table"
```

---

### Task 10: Tag badges on transaction rows

**Files:**
- Create: `frontend/src/styles/tags.css`
- Modify: `frontend/src/views/BudgetView.vue`

- [ ] **Step 1: Create tag badge styles**

```css
/* ---- Tag badges on transaction rows ---- */

.basil-tag-badge {
  display: inline-block;
  max-width: 80px;
  padding: 1px var(--basil-space-1);
  background: var(--basil-surface-alt);
  color: var(--basil-text-secondary);
  font-size: 0.6875rem;
  border-radius: var(--basil-radius-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
  line-height: 1.4;
}

.basil-tag-badges {
  display: inline;
  margin-left: var(--basil-space-1);
}

.basil-tag-badges .basil-tag-badge + .basil-tag-badge {
  margin-left: 2px;
}

.basil-tag-overflow {
  display: inline-block;
  padding: 1px var(--basil-space-1);
  color: var(--basil-text-muted);
  font-size: 0.6875rem;
  vertical-align: middle;
}
```

- [ ] **Step 2: Add badges to budget view transaction rows**

In the budget view category transaction list, find where the transaction name is
rendered. After the name, add:

```html
<span v-if="item.tags?.length" class="basil-tag-badges">
  <span
    v-for="tag in item.tags.slice(0, 2)"
    :key="tag.id"
    class="basil-tag-badge"
  >{{ tag.name }}</span>
  <span v-if="item.tags.length > 2" class="basil-tag-overflow">
    +{{ item.tags.length - 2 }}
  </span>
</span>
```

Apply the same pattern to the Show All table transaction rows.

Import the CSS:

```css
@import '../styles/tags.css';
```

Add to the BudgetView.css import or the BudgetView `<style>` block.

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/tags.css frontend/src/views/BudgetView.vue
git commit -m "feat: add tag badges on transaction rows"
```

---

## Chunk 6: Tags View + Tag Filter

### Task 11: Tags view

**Files:**
- Create: `frontend/src/views/TagsView.vue`
- Modify: `frontend/src/routes.js`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Create TagsView component**

Create `frontend/src/views/TagsView.vue` with:
- `ensureAppData` on mount
- Three-state loading pattern (`bootstrapping` → empty → content)
- Tag list from `store.state.tags`
- Each tag row shows name + summary stats (fetched on tap)
- Expandable detail: category breakdown + transaction list
- `SwipeReveal` for swipe-to-delete
- `EmptyState` for no tags

The view should follow the same patterns as `RulesView.vue` (list with swipe-to-delete,
data loaded from store + on-demand API calls for detail).

Key imports: `ensureAppData`, `fetchTagSummary`, `fetchTagTransactions`, `deleteTagApi`
from `@/api`, `SwipeReveal`, `EmptyState` from components, `store`.

- [ ] **Step 2: Add route**

In `frontend/src/routes.js`, add:

```js
const TagsView = () => import('./views/TagsView.vue')
```

And add to the routes array:

```js
{
    path: '/tags',
    name: 'TagsView',
    component: TagsView
},
```

- [ ] **Step 3: Add to drawer nav**

In `frontend/src/App.vue`, in the left drawer Navigation section (after the Rules
`q-item`), add:

```html
<q-item clickable to="/tags" @click="leftDrawerOpen = false">
  <q-item-section avatar>
    <q-icon name="sell" />
  </q-item-section>
  <q-item-section>
    <q-item-label>Tags</q-item-label>
    <q-item-label caption>Track spending by tag</q-item-label>
  </q-item-section>
</q-item>
```

Also add to the desktop nav tabs (alongside Rules):

```html
<q-route-tab to="/tags" icon="sell" label="Tags" />
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/TagsView.vue frontend/src/routes.js frontend/src/App.vue
git commit -m "feat: add Tags view with summary, detail, and swipe-to-delete"
```

---

### Task 12: Tag filter on Show All table

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`

- [ ] **Step 1: Add tag filter state**

Add to `data()`:

```js
tagFilter: null,
```

- [ ] **Step 2: Add filter to `tableTransactions` computed**

Find the `tableTransactions` computed property. Add tag filtering alongside the
existing search filter:

```js
if (this.tagFilter) {
  filtered = filtered.filter(t =>
    t.tags?.some(tag => tag.id === this.tagFilter)
  );
}
```

- [ ] **Step 3: Add filter control to the table toolbar**

Add a `q-select` in the controls row. On mobile, this may need to go behind a
filter icon that expands:

```html
<q-select
  v-model="tagFilter"
  :options="$store.state.tags.map(t => ({ label: t.name, value: t.id }))"
  emit-value map-options
  label="Filter by tag"
  outlined dense clearable
  style="min-width: 140px"
/>
```

For mobile: consider wrapping the search + tag filter in a collapsible row that
toggles via a filter icon button. Check existing mobile breakpoint patterns in
BudgetView to match.

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat: add tag filter to Show All table"
```

---

## Chunk 7: Production Migration + Final

### Task 13: Run production migration

- [ ] **Step 1: Run migration on prod (before deploy)**

```bash
ssh root@178.156.248.108 'docker exec -i basil-postgres-1 psql -U basil -d basil' < db/migrations/005-tags.sql
```

Expected: `CREATE TABLE` x2, `CREATE INDEX`

- [ ] **Step 2: Verify**

```bash
ssh root@178.156.248.108 'docker exec -i basil-postgres-1 psql -U basil -d basil -c "\dt tags" -c "\dt transaction_tags"'
```

---

### Task 14: Update CLAUDE.md

- [ ] **Step 1: Add tags to "What works end-to-end"**

Add: "Transaction tags: user-defined tags (trips, themes, events) with many-to-many
relationship, tag picker in edit dialog, bulk tagging from Show All table, tag badges
on transaction rows, dedicated Tags view with spend summary and category breakdown,
tag filter on Show All table"

- [ ] **Step 2: Move tags from backlog to shipped**

Remove the "Coming soon" placeholder reference in RuleEditorDialog backlog.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with shipped tags feature"
```
