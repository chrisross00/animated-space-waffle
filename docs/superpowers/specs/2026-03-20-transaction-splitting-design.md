# Transaction Splitting — Design Spec

> **Status:** Approved
> **Date:** 2026-03-20
> **Scope:** Manual amount-based splitting from Edit Transaction dialog and triage flow

## Summary

Split a single transaction across multiple categories. A $142.87 Costco run becomes
$85 Groceries + $35 Household + $22.87 Personal Care. Table stakes for budgeting apps —
YNAB, Monarch, Copilot, and Lunch Money all support this.

## Data Model

### Schema migration

Two new columns on `transactions`:

```sql
ALTER TABLE transactions ADD COLUMN parent_transaction_id UUID REFERENCES transactions(id);
ALTER TABLE transactions ADD COLUMN is_split_parent BOOLEAN DEFAULT false;
CREATE INDEX idx_txn_parent ON transactions(parent_transaction_id)
  WHERE parent_transaction_id IS NOT NULL;
```

### Parent row (when split)

- `is_split_parent = true`
- Excluded from all budget totals, charts, search results, rule sweeps
- Preserved in DB so Plaid sync can still reference it and user can unsplit
- Tags stay on the parent (hidden but preserved)

### Child rows

- New UUID `id`, generated `transaction_id` (e.g. `split-{parentTransactionId}-{index}`)
- `parent_transaction_id` → parent's `id`
- **Inherited from parent:** `user_id`, `date`, `effective_date`, `account`, `account_id`,
  `name`, `merchant_name`, `plaid_pfc`, `plaid_pfc_detail`, `exclude_from_total`
- **Own values:** `amount`, `mapped_category`, `note`
- `manually_set = true` — protects from rule sweeps
- No tags — children start clean, user can add tags individually

### Unsplit

- Delete all children where `parent_transaction_id = parent.id`
- Set parent's `is_split_parent = false`
- Parent reappears in all views as a normal transaction with its original tags

### Parent filter

Added to these DB queries as `AND (is_split_parent IS NOT TRUE)`:

**Transaction queries:**
- `findTransactionsByMonth`
- `findTransactionsPaginated`
- `findUnmappedTransactions`
- `renameTransactionCategory`

**Sweep/update queries:**
- `sweepTransactionsByConditions`
- `updateTransactionsByMerchant`
- `updateTransactionsByName`

**Tag aggregate queries (prevent double-counting with hidden parent):**
- `findTagTransactions`
- `findTagSummary`
- `findTagCategoryBreakdown`

**Merchant aggregate queries:**
- `findMerchantsWithStats`
- `findHistoricalCategoryMap`

Also add `is_split_parent` and `parent_transaction_id` to `TXN_COLUMNS` (SELECT alias
list) so query results include them for frontend use.

## API

### `POST /api/split`

Creates a split from a single transaction.

```
Body: {
  transaction_id: string,
  splits: [
    { amount: number, categoryName: string, note?: string },
    { amount: number, categoryName: string, note?: string },
    ...
  ]
}
Response: { parent, children }
```

**Validations:**
- Transaction exists and belongs to the authenticated user
- Sum of split amounts === parent amount (exact match)
- At least 2 splits, max 20
- All split amounts are positive (> 0)
- All `categoryName` values reference existing categories
- Transaction is not pending
- Transaction is not income (negative amount)
- Transaction is not already a split child
- Transaction is not already a split parent (must unsplit first)

**Actions:**
1. Set parent `is_split_parent = true`
2. Insert child rows with inherited fields + split-specific values
3. Return parent + children for store update

### `POST /api/unsplit`

Restores the original transaction.

```
Body: {
  transaction_id: string    // child's OR parent's transaction_id
}
Response: { parent }
```

**Actions:**
1. Resolve to parent (if given a child, follow `parent_transaction_id`)
2. Delete all children
3. Set parent `is_split_parent = false`
4. Return parent for store update

### Existing routes — no changes

`/handleDialogSubmit` works unchanged for editing children (they're normal transactions).

## Frontend Store

### New mutations

**`splitTransaction({ parent, children })`**
- Update parent in `transactionsByMonth` → set `is_split_parent = true`
- Insert children into correct month bucket(s)
- Rebuild flat `transactions` array

**`unsplitTransaction({ parent })`**
- Remove all transactions where `parent_transaction_id === parent.id` from month buckets
- Update parent: `is_split_parent = false`
- Rebuild flat `transactions` array

### Split parent filtering

Filter in the store rebuild — when `transactions` flat array is rebuilt from
`transactionsByMonth`, exclude rows where `is_split_parent === true`. Every consumer
gets clean data automatically. Parents remain accessible in `transactionsByMonth` for
lookups (e.g., attribution line on child's edit dialog).

**Implementation note:** The flat array is rebuilt in 6 places in `store.js`
(`setMonthTransactions`, `setTransactions`, `updateTransaction` re-bucket,
`linkTransaction`, `unlinkTransaction`, `updateCategory` rename). Extract the rebuild
into a private `rebuildFlatArray(state)` helper that includes the parent filter, and
call it from all 6 sites. This eliminates the risk of missing the filter somewhere and
is a quality-of-life cleanup for the existing code.

**`transactionsByMonth` intentionally retains parents.** Any code that iterates month
buckets directly (as opposed to `state.transactions`) will encounter split parents.
This is by design — it allows parent lookups for attribution and unsplit. Add a code
comment documenting this.

## UI — Split Editor

### Entry points

1. **Edit Transaction dialog** — "Split" button in footer alongside Submit.
   Hidden when: transaction is pending, income, or already a split child.
2. **Triage flow** — same "Split" button alongside Save/Skip. Same gating rules.

### Split mode (inline replacement)

Tapping "Split" hides: category picker, note field, toggles, similar-transaction
checkbox. Split rows appear in their place.

**Auto-remainder flow:**
1. First row: full amount pre-filled, empty category picker. User adjusts amount,
   picks a category.
2. Second row auto-appears with the remainder, empty category. User picks category,
   optionally adjusts amount.
3. Additional rows auto-appear as long as there's a remainder. User can also remove
   rows with the × button.
4. "Remaining" pill shows live counter — warning color when > $0, green at $0.00.
5. "Save split" enabled only when remaining = $0.00 and all rows have a category.
6. "Cancel split" returns to normal edit mode (no API call).

### After saving a split

- **Undo toast:** "Split into N categories · Undo" — tapping calls `/api/unsplit`
- Dialog closes
- Parent disappears from lists, children appear in their respective categories

### Viewing a split child later

- Edit dialog opens normally — it's just a transaction
- Attribution line (same position as rule attribution):
  "Split from $142.87 Costco · Unsplit"
- Tapping "Unsplit" calls `/api/unsplit`, shows undo toast:
  "Restored original · Undo" — tapping re-calls `/api/split` with previous split data
- **Undo data retention:** The frontend holds the split configuration (amounts,
  categories, notes) in memory for the toast duration. If the user navigates away
  or the toast expires, undo is no longer available. Acceptable for V1.

### Split indicator on transaction rows

Small badge or icon on child transaction rows (similar to existing "Payback" / "Return"
relationship badges). Subtle — doesn't clutter, but visible if looking.

## Plaid Sync Safety

Pending transactions are gated out of splitting, so the main risk is a posted
transaction receiving a merchant amount adjustment after being split (rare).

**V1 approach:** `insertTransactions` uses `ON CONFLICT (transaction_id) DO NOTHING`
for new inserts, so those are safe. The guard is needed on the **modified transactions**
path — when Plaid returns updated data for an existing transaction, check
`is_split_parent` before applying the amount change. If true, skip the amount update
and log to `sync_log`. No user-facing notification in V1.

## Not in V1

- **No percentage-based splitting** — amounts only
- **No auto-split rules** — no "always split Costco 60/40"
- **No splitting from bulk operations** — one transaction at a time
- **No splitting income** — gated out
- **No tag inheritance** — tags stay on hidden parent, children start with none
- **No split-across-months** — children inherit parent's date (user can move
  individual children via effective_date after splitting)
- **No Plaid amount-change notification UI** — skip update silently

## Key touchpoints

| Area | File(s) | Change |
|------|---------|--------|
| Schema | `db/migrations/007-transaction-splitting.sql` | Add columns + index |
| DB helpers | `db/database.js` | Parent filter on ~12 queries, new `insertSplitChildren` + `deleteSplitChildren`, `TXN_COLUMNS` + `TXN_FIELD_MAP` updates |
| API | `api.js` | New `/split` and `/unsplit` routes |
| Sync safety | `db/database.js` → `insertTransactions` | Skip amount update on split parents |
| Store | `frontend/src/store.js` | New mutations, parent filter in array rebuild |
| API client | `frontend/src/api.js` | New `splitTransaction()` + `unsplitTransaction()` functions |
| Edit dialog | `frontend/src/components/DialogComponent.vue` | Split button, inline split editor mode, attribution line for children |
| Triage | `frontend/src/views/BudgetView.vue` (triage section) | Split button in triage card |
| Toast | `frontend/src/views/BudgetView.vue` | Undo toasts for split and unsplit |
