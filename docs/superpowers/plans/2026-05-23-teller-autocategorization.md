# Teller Auto-Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore automatic first-pass categorization after the Plaid→Teller migration by mapping Teller's coarse `details.category` to Basil categories, applied as a flagged "guess," with the user's own rules still taking priority.

**Architecture:** Replace the dead PFC layer in `categoryMapping.js` with a general `TELLER_CATEGORY_TO_BASIL` map (no per-user history mining). Each categorization layer stamps a new `category_source` field (`rule` / `teller_category` / `manual` / null) which drives a guess badge and a "review guesses" filter in the UI.

**Tech Stack:** Node/Express + Postgres (`pg`), Vue 3 + Vuex, Vitest (pure-function tests only — no live DB/API in the suite).

**Spec:** `docs/superpowers/specs/2026-05-23-teller-autocategorization-design.md`

---

## Testing approach

The Vitest suite tests **pure functions only**. So: the map and the `categoryMapping.js` layer get full TDD; the I/O pieces (migration, persistence, recategorization wiring, frontend badge/filter) are implemented with complete code and verified by the Task 9 smoke test. Do not add live-DB or Vue component tests to the suite.

## File structure

**Create:**
- `db/migrations/011-category-source.sql` — add nullable `category_source` column.
- `utils/tellerCategoryMapping.js` — `TELLER_CATEGORY_TO_BASIL` map.

**Modify:**
- `utils/tellerTools.js` — `tellerToInternal` carries `teller_category`.
- `utils/categoryMapping.js` — new Teller-category layer + `category_source` stamping.
- `db/database.js` — persist `category_source` (insert), read it (`TXN_COLUMNS`), allow updating it (`TXN_FIELD_MAP`).
- `api.js` — `handleDialogSubmit`: stamp `manual`/`rule` on recategorization.
- `frontend/src/views/BudgetView.vue` — guess badge + review-guesses filter.
- `frontend/src/views/BudgetView.vue` CSS / `App.vue` global styles — `basil-txn-guess` badge style.

---

## Task 1: Migration 011 — `category_source` column

**Files:**
- Create: `db/migrations/011-category-source.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 011-category-source.sql
-- Records how a transaction got its category, powering the "guess" badge:
--   'rule'            user-defined compound/name/merchant rule matched (confident)
--   'teller_category' auto-applied from Teller's coarse category (a guess)
--   'manual'          user explicitly set/confirmed the category
--   NULL              uncategorized (To Sort) or pre-existing rows
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_source TEXT;
```

- [ ] **Step 2: Run it against the local DB**

Run: `psql "postgresql://chris@localhost/basil" -f db/migrations/011-category-source.sql`
Expected: `ALTER TABLE`, no errors.

- [ ] **Step 3: Verify the column exists**

Run: `psql "postgresql://chris@localhost/basil" -c "SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name='category_source';"`
Expected: one row, `category_source`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/011-category-source.sql
git commit -m "feat(db): add category_source column (migration 011)"
```

---

## Task 2: `TELLER_CATEGORY_TO_BASIL` map (TDD)

**Files:**
- Create: `__tests__/tellerCategoryMapping.test.js`
- Create: `utils/tellerCategoryMapping.js`

- [ ] **Step 1: Write the failing test**

```js
// __tests__/tellerCategoryMapping.test.js
import { describe, it, expect } from 'vitest';
const { TELLER_CATEGORY_TO_BASIL } = require('../utils/tellerCategoryMapping');

// The 12 real Basil default categories (utils/defaultCategories.js).
const BASIL_CATEGORIES = new Set([
  'Income', 'Rent & Utilities', 'Food & Dining', 'Transportation', 'Entertainment',
  'Travel', 'Shopping', 'Health', 'Services', 'Taxes & Giving', 'Payments & Transfers', 'To Sort',
]);

describe('TELLER_CATEGORY_TO_BASIL', () => {
  it('maps a few known Teller categories to the right Basil categories', () => {
    expect(TELLER_CATEGORY_TO_BASIL.dining).toBe('Food & Dining');
    expect(TELLER_CATEGORY_TO_BASIL.shopping).toBe('Shopping');
    expect(TELLER_CATEGORY_TO_BASIL.entertainment).toBe('Entertainment');
    expect(TELLER_CATEGORY_TO_BASIL.fuel).toBe('Transportation');
    expect(TELLER_CATEGORY_TO_BASIL.income).toBe('Income');
  });

  it('every mapped value is a real Basil category', () => {
    for (const [tellerCat, basilCat] of Object.entries(TELLER_CATEGORY_TO_BASIL)) {
      expect(BASIL_CATEGORIES.has(basilCat), `${tellerCat} -> ${basilCat}`).toBe(true);
    }
  });

  it('does NOT map "general" (catch-all falls through to To Sort)', () => {
    expect(TELLER_CATEGORY_TO_BASIL.general).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tellerCategoryMapping`
Expected: FAIL — `Cannot find module '../utils/tellerCategoryMapping'`.

- [ ] **Step 3: Implement the map**

```js
// utils/tellerCategoryMapping.js
// Teller's coarse transaction `details.category` → Basil category.
// General taxonomy (NOT user-personalized). Keys omitted intentionally fall through
// to To Sort: "general" (Teller's catch-all) and any value not listed here.
// Verify against Teller's docs and add new values as Teller introduces them.
const TELLER_CATEGORY_TO_BASIL = {
  accommodation: 'Travel',
  bar: 'Food & Dining',
  dining: 'Food & Dining',
  groceries: 'Food & Dining',
  clothing: 'Shopping',
  electronics: 'Shopping',
  office: 'Shopping',
  home: 'Shopping',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  sport: 'Entertainment',
  fuel: 'Transportation',
  transport: 'Transportation',
  transportation: 'Transportation',
  health: 'Health',
  phone: 'Rent & Utilities',
  utilities: 'Rent & Utilities',
  charity: 'Taxes & Giving',
  tax: 'Taxes & Giving',
  income: 'Income',
  loan: 'Payments & Transfers',
  investment: 'Payments & Transfers',
  insurance: 'Services',
  service: 'Services',
  software: 'Services',
  education: 'Services',
  advertising: 'Services',
  // 'general' intentionally omitted → To Sort
};

module.exports = { TELLER_CATEGORY_TO_BASIL };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tellerCategoryMapping`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add utils/tellerCategoryMapping.js __tests__/tellerCategoryMapping.test.js
git commit -m "feat(teller): TELLER_CATEGORY_TO_BASIL map with tests"
```

---

## Task 3: `tellerToInternal` carries `teller_category`

**Files:**
- Modify: `utils/tellerTools.js` (`tellerToInternal`)
- Modify: `__tests__/tellerTools.test.js`

- [ ] **Step 1: Add a failing test** (in `__tests__/tellerTools.test.js`, inside the `describe('tellerToInternal', …)` block)

```js
  it('carries Teller details.category as teller_category', () => {
    const withCat = { ...base, details: { category: 'shopping', counterparty: { name: 'Amazon' } } };
    expect(tellerToInternal(withCat, { userId: 'u1', institution: 'Chase', accountType: 'credit' }).teller_category).toBe('shopping');
  });

  it('teller_category is null when Teller provides none', () => {
    const noCat = { ...base, details: { counterparty: { name: 'X' } } };
    expect(tellerToInternal(noCat, { userId: 'u1', institution: 'Chase' }).teller_category).toBe(null);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tellerTools`
Expected: FAIL — `teller_category` is `undefined`, not the expected value.

- [ ] **Step 3: Add the field** — in `utils/tellerTools.js`, inside the object returned by `tellerToInternal`, add a line after `merchant_name`:

```js
    merchant_name: t.details?.counterparty?.name || null,
    teller_category: t.details?.category || null,
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tellerTools`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add utils/tellerTools.js __tests__/tellerTools.test.js
git commit -m "feat(teller): carry Teller category onto transactions"
```

---

## Task 4: Teller-category layer + `category_source` stamping (TDD)

**Files:**
- Modify: `utils/categoryMapping.js` (`mapTransactions`)
- Create: `__tests__/categoryMappingTeller.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// __tests__/categoryMappingTeller.test.js
import { describe, it, expect } from 'vitest';
const { mapTransactions } = require('../utils/categoryMapping');

const noRules = [];           // ruleList
const noCompound = [];        // compoundRules

describe('mapTransactions — Teller category layer', () => {
  it('maps a specific Teller category to Basil and stamps teller_category', async () => {
    const txns = [{ name: 'AMAZON MKTPL*X', merchant_name: 'Amazon', amount: 20, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('Shopping');
    expect(r.category_source).toBe('teller_category');
  });

  it('sends "general" to To Sort with null source (no guess)', async () => {
    const txns = [{ name: 'WHATEVER', merchant_name: 'X', amount: 5, teller_category: 'general' }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('To Sort');
    expect(r.category_source == null).toBe(true);
  });

  it('sends a missing category to To Sort with null source', async () => {
    const txns = [{ name: 'X', merchant_name: 'X', amount: 5, teller_category: null }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('To Sort');
    expect(r.category_source == null).toBe(true);
  });

  it('P2P goes to To Sort even with a Teller category', async () => {
    const txns = [{ name: 'Venmo Payment', merchant_name: 'Venmo', amount: 30, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, noRules, noCompound);
    expect(r.mappedCategory).toBe('To Sort');
  });

  it('a user merchant rule wins over the Teller category and stamps rule', async () => {
    const ruleList = [{ category: 'Travel', rules: { merchant_name: ['Amazon'] }, plaid_pfc: [] }];
    const txns = [{ name: 'AMAZON', merchant_name: 'Amazon', amount: 20, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, ruleList, noCompound);
    expect(r.mappedCategory).toBe('Travel');
    expect(r.category_source).toBe('rule');
  });

  it('a compound rule stamps rule', async () => {
    const compound = [{ conditions: [{ field: 'merchant_name', op: 'eq', value: 'Amazon' }], action: { type: 'categorize', categoryName: 'Health' } }];
    const txns = [{ name: 'AMAZON', merchant_name: 'Amazon', amount: 20, teller_category: 'shopping' }];
    const [r] = await mapTransactions(txns, noRules, compound);
    expect(r.mappedCategory).toBe('Health');
    expect(r.category_source).toBe('rule');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- categoryMappingTeller`
Expected: FAIL — `category_source` undefined / Teller layer not present.

- [ ] **Step 3: Implement**

In `utils/categoryMapping.js`:

(a) Add the import at the top (after the existing requires):

```js
const { TELLER_CATEGORY_TO_BASIL } = require('./tellerCategoryMapping');
```

(b) Stamp `category_source = 'rule'` wherever a user rule assigns a category. In the
compound-rules block, change the `categorize` branch:

```js
          if (action.type === 'categorize') {
            transaction.mappedCategory = action.categoryName;
            transaction.category_source = 'rule';
            if (action.note) transaction.note = action.note;
          } else if (action.type === 'route') {
```

In each of the rule layers that set `transaction.mappedCategory = rule.category` (the
exact-name loop, the category[1] loop, and the merchant_name/transaction_type/account/
category[0] block), set `transaction.category_source = 'rule'` immediately after each
assignment. (There are five such assignments — add the stamp after every one.)

(c) Replace the PFC-detail block (the `transaction.personal_finance_category?.detailed`
block) — leave it intact for legacy Plaid rows, but ADD the new Teller layer immediately
before the "FALLBACK: To Sort" block:

```js
  // RULE: Teller coarse category → Basil (a flagged guess). Specific categories only;
  // "general"/missing fall through to To Sort. P2P always → To Sort.
  transactions.forEach(transaction => {
    if (!transaction.mappedCategory && transaction.teller_category) {
      if (isP2PTransaction(transaction)) {
        transaction.mappedCategory = 'To Sort';
      } else {
        const mapped = TELLER_CATEGORY_TO_BASIL[transaction.teller_category];
        if (mapped) {
          transaction.mappedCategory = mapped;
          transaction.category_source = 'teller_category';
        }
      }
    }
  });
```

(The `To Sort` fallback below leaves `category_source` unset/null, which is correct.)

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- categoryMappingTeller` then `npm test`
Expected: new file PASSES; full suite still green.

- [ ] **Step 5: Commit**

```bash
git add utils/categoryMapping.js __tests__/categoryMappingTeller.test.js
git commit -m "feat(teller): Teller-category layer + category_source stamping"
```

---

## Task 5: Persist + read + allow-update `category_source` (`db/database.js`)

**Files:**
- Modify: `db/database.js` — `insertTransactions` INSERT, `TXN_COLUMNS`, `TXN_FIELD_MAP`

- [ ] **Step 1: Add to `TXN_FIELD_MAP`** — after the `mappedCategory: 'mapped_category',` line:

```js
  mappedCategory: 'mapped_category',
  categorySource: 'category_source',
```

- [ ] **Step 2: Add to `TXN_COLUMNS`** — after the `'mapped_category AS "mappedCategory"',` entry:

```js
  'mapped_category AS "mappedCategory"',
  'category_source AS "categorySource"',
```

- [ ] **Step 3: Persist on insert.** In `insertTransactions`, add `category_source` to the
INSERT column list and a matching `$23` value. Change the column list line that ends
`...dismissed_relationship` to also include `category_source`, bump the VALUES list to
`$23`, and add `t.category_source || null` to the params array (as the new last element,
matching position $23). Concretely, the INSERT becomes:

```js
        `INSERT INTO transactions (
           transaction_id, user_id, account_id, name, merchant_name,
           amount, date, effective_date, mapped_category, pending,
           pending_transaction_id, note, exclude_from_total, manually_set,
           account, plaid_pfc, plaid_pfc_detail, venmo_id, venmo_counterparty, venmo_note,
           linked_transaction, dismissed_relationship, category_source
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (transaction_id) DO UPDATE SET
           pending = EXCLUDED.pending,
           date = EXCLUDED.date`,
```

and append to the params array (after `t.dismissedRelationship || null,`):

```js
          t.dismissedRelationship || null,
          t.category_source || null,
```

- [ ] **Step 4: Verify the module loads + existing DB tests pass**

Run: `node -e "require('./db/database'); console.log('ok')" && npm test -- database`
Expected: `ok`; `database.test.js` green.

- [ ] **Step 5: Commit**

```bash
git add db/database.js
git commit -m "feat(db): persist/read/update category_source"
```

---

## Task 6: Stamp source on recategorization (`api.js`)

**Files:**
- Modify: `api.js` — `handleDialogSubmit` (~lines 312-348)

- [ ] **Step 1: Manual edit → `category_source: 'manual'`.** In the `fields` object built
for the transaction update, add `categorySource`:

```js
    const fields = {
      mappedCategory: req.body.mappedCategory,
      categorySource: 'manual',
      date: req.body.date,
      note: req.body.note,
      excludeFromTotal: req.body.excludeFromTotal,
      ...(shouldPin && { manually_set: true }),
      effectiveDate: effectiveDate || null,
    };
```

(Any explicit category change through the dialog is a user decision → `manual`, clearing
the guess badge. `updateTransaction` maps `categorySource` via `TXN_FIELD_MAP` from Task 5.)

- [ ] **Step 2: Auto-learn rule sweeps → `category_source: 'rule'`.** In the two auto-learn
branches, add `categorySource: 'rule'` to the sweep updates:

```js
        await updateTransactionsByMerchant(uid, req.body.merchantName, { mappedCategory: req.body.mappedCategory, categorySource: 'rule' });
```

and

```js
        await updateTransactionsByName(uid, req.body.name, { mappedCategory: req.body.mappedCategory, categorySource: 'rule' });
```

(These helpers build their SET clause via `buildSetClause`/`TXN_FIELD_MAP`, so the new
key flows through. If a helper does not use the field map, add `category_source` to its
update explicitly.)

- [ ] **Step 3: Verify api.js loads**

Run: `node -e "require('./api'); console.log('LOAD_OK'); process.exit(0)"`
Expected: `LOAD_OK`.

- [ ] **Step 4: Commit**

```bash
git add api.js
git commit -m "feat(teller): stamp manual/rule category_source on recategorization"
```

---

## Task 7: Guess badge (frontend)

> Read `DESIGN.md` first (frontend rule). Reuse the existing `basil-txn-pending` badge pattern; use `var(--basil-*)` tokens only.

**Files:**
- Modify: `frontend/src/views/BudgetView.vue` (template + `<style>`)

- [ ] **Step 1: Add the badge in the category-row transaction list.** Next to the existing
pending badge (~line 427), add:

```html
                            <span v-if="item.pending" class="basil-txn-pending">Pending</span>
                            <span v-if="item.categorySource === 'teller_category'" class="basil-txn-guess">Guess</span>
```

- [ ] **Step 2: Add the badge in the Show All table rows.** Next to the table's pending
badge (~line 624), add the same span using the row accessor:

```html
                        <span v-if="sortedTableTransactions[vRow.index]?.pending" class="basil-txn-pending">Pending</span>
                        <span v-if="sortedTableTransactions[vRow.index]?.categorySource === 'teller_category'" class="basil-txn-guess">Guess</span>
```

- [ ] **Step 3: Style it.** In `BudgetView.vue`'s `<style>` (next to the `.basil-txn-pending`
rule), add a token-based style — distinct but quiet (e.g. an amber/“review” tone):

```css
.basil-txn-guess {
  display: inline-block;
  margin-left: var(--basil-space-2);
  padding: 0 var(--basil-space-2);
  font-size: var(--basil-font-xs);
  border-radius: var(--basil-radius-sm);
  background: var(--basil-warning-bg, var(--basil-surface-alt));
  color: var(--basil-warning, var(--basil-text-muted));
}
```

(If those exact tokens don't exist, match the tokens used by `.basil-txn-pending` in the
same file — the point is a quiet, token-based badge, no hard-coded colors.)

- [ ] **Step 4: Build to verify**

Run: `npm run build --prefix frontend`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat(teller): guess badge on auto-categorized transactions"
```

---

## Task 8: "Review guesses" filter in Show All (frontend)

**Files:**
- Modify: `frontend/src/views/BudgetView.vue` (Show All controls + table filter computed + `data()`)

- [ ] **Step 1: Add filter state.** In `data()`, add:

```js
        showGuessesOnly: false,
```

- [ ] **Step 2: Apply it in the table filter.** In the computed that filters Show All rows
(`tableTransactions` / `sortedTableTransactions` pipeline — the same place the amount/
search filters are applied, ~lines 1186-1189), add a filter step:

```js
        if (this.showGuessesOnly) {
          rows = rows.filter(t => t.categorySource === 'teller_category');
        }
```

- [ ] **Step 3: Add the toggle + count to the Show All controls.** Near the Show All search/
filter controls (the bulk/filter bar around lines 292-340 in the template), add a
non-blocking toggle showing the guess count:

```html
            <BasilButton
              v-if="guessCount > 0"
              variant="flat"
              :label="showGuessesOnly ? 'Show all' : `Review ${guessCount} guesses`"
              @click="showGuessesOnly = !showGuessesOnly" />
```

and add a `guessCount` computed:

```js
      guessCount() {
        return this.tableTransactions.filter(t => t.categorySource === 'teller_category').length;
      },
```

(Use `tableTransactions` = the pre-guess-filter list so the count is stable. If the
existing filter pipeline names differ, wire `guessCount` to the unfiltered month rows.)

- [ ] **Step 4: Build to verify**

Run: `npm run build --prefix frontend`
Expected: build succeeds; no unresolved references.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat(teller): review-guesses filter in Show All"
```

---

## Task 9: Smoke test + production rollout

No code unless a check fails. Local first, then prod (mirrors the migration cutover process).

- [ ] **Step 1: Local — re-pull with categories.** With the dev server running and a Teller
sandbox (or dev) connection linked locally: clear the connection's transactions + reset
its `last_transactions_hash`, then Sync. Confirm new rows have `category_source`:
`psql "postgresql://chris@localhost/basil" -c "SELECT category_source, count(*) FROM transactions WHERE account_id IN (SELECT account_id FROM plaid_accounts a JOIN plaid_items i ON i.id=a.item_id WHERE i.active=true) GROUP BY 1;"`
Expected: a mix of `teller_category` and `NULL` (To Sort); `rule` for any matching rules.
- [ ] **Step 2: Local — badge + filter.** In the app, confirm guessed transactions show the
"Guess" badge, and the "Review N guesses" toggle filters to them.
- [ ] **Step 3: Local — recategorize clears guess.** Recategorize a guessed transaction; confirm
its badge disappears and `category_source` is now `manual` (or `rule` if a rule was created).
- [ ] **Step 4: Full suite + build.** `npm test` and `npm run build --prefix frontend` both pass.
- [ ] **Step 5: Production rollout.** Run migration 011 on prod **before** the code deploy
(the read/insert reference `category_source`):
`ssh ktrlabs 'cd /opt/basil && docker compose exec -T postgres psql -U basil -d basil' < db/migrations/011-category-source.sql`
then verify the column exists, then merge to `main` + push (CI deploys). Existing rows
keep `category_source = NULL` (no backfill); only newly-synced transactions get a source.
- [ ] **Step 6: Post-deploy.** Tap Sync in prod; confirm new transactions get badges and the
review filter works. Watch Sentry 24h.

---

## Self-Review

**Spec coverage:**
- Replace PFC layer with Teller-category map → Tasks 2, 4. ✅
- No history mining → map is static/general (Task 2). ✅
- Auto-apply but flag as guess → `category_source='teller_category'` (Task 4) + badge (Task 7). ✅
- Only specific categories; `general`/missing/P2P → To Sort → Task 4 tests. ✅
- `category_source` field (`rule`/`teller_category`/`manual`/null) → Tasks 1, 4, 5, 6. ✅
- Recategorize clears guess → Task 6 (`manual`/`rule`). ✅
- Badge everywhere + review filter → Tasks 7, 8. ✅
- Carry Teller category onto txns → Task 3. ✅
- Testing convention (pure-function TDD, I/O via smoke) → followed. ✅

**Placeholder scan:** No TBD/TODO. The map (Task 2) lists Teller's documented enum with a note to verify/extend against Teller docs — concrete values, not a placeholder. ✅

**Type/signature consistency:** `teller_category` set in Task 3, read in Task 4. `category_source` written (Task 5 insert), read (Task 5 `TXN_COLUMNS` → `categorySource`), updated (Task 5 `TXN_FIELD_MAP` + Task 6), consumed in frontend as `categorySource` (Tasks 7, 8). `TELLER_CATEGORY_TO_BASIL` defined Task 2, imported Task 4. Consistent. ✅

**Frontend line numbers are approximate** (BudgetView ~1,700 lines) — locate by the cited anchors (`basil-txn-pending`, the Show All filter pipeline, `data()`); see `CLAUDE.md` BudgetView map.
