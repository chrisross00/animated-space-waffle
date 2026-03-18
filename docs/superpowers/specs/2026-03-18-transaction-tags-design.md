# Transaction Tags

**Date:** 2026-03-18
**Status:** Draft

---

## Problem

Users want to track spending across categories and months for events, trips, and
recurring themes. "How much did my vacation cost?" spans Food, Transport, and Lodging
across multiple months — categories alone can't answer this. Tags are a user-defined
dimension that groups transactions by meaning rather than category.

## Scope — v1

1. **Edit Transaction dialog** — tag picker to add/remove tags per transaction
2. **Bulk tagging in Show All table** — select rows, apply tags
3. **Tag badges on transaction rows** — visible on budget view and Show All table
4. **Dedicated Tags view (`/tags`)** — tag list with spend summary, category breakdown,
   transaction drill-down, swipe-to-delete
5. **Tag filter on Show All table** — filter transactions by tag

### Deferred to v2

- Rule action: auto-tag via compound rules (placeholder already in RuleEditorDialog)
- Tag filter on Trends view
- Bulk untag
- Tag rename
- Tag groups/hierarchy
- Tag colors

---

## Data Model

### `tags` table

```sql
CREATE TABLE IF NOT EXISTS tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);
```

### `transaction_tags` join table

```sql
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE CASCADE,
  tag_id         UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX idx_transaction_tags_tag ON transaction_tags(tag_id);
```

Note: `transaction_id` references the UNIQUE `transaction_id` column (Plaid-assigned),
not the UUID `id` PK. This matches how the rest of the codebase identifies transactions.

Many-to-many. A transaction can have multiple tags, a tag can be on many transactions.
Tags are user-scoped. The join table is the source of truth. Deleting a tag cascades
to `transaction_tags`, removing it from all transactions.

---

## Backend API

### Tag CRUD

| Method | Route | Body | Returns |
|--------|-------|------|---------|
| `GET` | `/api/tags` | — | `[{ id, name, createdAt }]` |
| `POST` | `/api/tags` | `{ name }` | `{ id, name, createdAt }`. 409 if duplicate. |
| `POST` | `/api/deleteTag` | `{ tagId }` | `{ ok: true }`. Cascades to transaction_tags. |

Note: uses `POST /api/deleteTag` (not HTTP DELETE) to match the project's convention
where all destructive operations use POST (`deleteRule`, `deleteCompoundRule`,
`deleteCategory`, etc.).

### Tagging transactions

| Method | Route | Body | Returns |
|--------|-------|------|---------|
| `POST` | `/api/tagTransactions` | `{ transactionIds: [...], tagIds: [...] }` | `{ tagged: count }` |
| `POST` | `/api/untagTransactions` | `{ transactionIds: [...], tagIds: [...] }` | `{ untagged: count }` |

Flat route names match project convention (`bulkCategorize`, `linkTransactions`, etc.).
Bulk-native: same endpoint whether tagging 1 transaction from the edit dialog or 50
from the table. Uses `INSERT ... ON CONFLICT DO NOTHING` for idempotent tagging.

### Tag analytics (for Tags view)

| Method | Route | Returns |
|--------|-------|---------|
| `GET` | `/api/tags/:id/summary` | `{ tag: { id, name }, totalSpend, transactionCount, dateRange: { earliest, latest }, categoryBreakdown: [{ category, amount }] }` |
| `GET` | `/api/tags/:id/transactions` | `{ transactions: [...] }` (paginated) |

### Loading tags onto transactions

`GET /api/transactions?month=YYYY-MM` already returns transactions. Extend the query
to include a `tags` array on each transaction: `[{ id, name }]`.

**Implementation approach:** Use a lateral subquery rather than a JOIN + GROUP BY to
avoid refactoring the shared `TXN_COLUMNS` pattern used across multiple query functions:

```sql
SELECT ${TXN_COLUMNS},
  COALESCE((
    SELECT json_agg(json_build_object('id', tg.id, 'name', tg.name))
    FROM transaction_tags tt
    JOIN tags tg ON tg.id = tt.tag_id
    WHERE tt.transaction_id = t.transaction_id
  ), '[]'::json) AS tags
FROM transactions t
WHERE ...
```

This preserves the existing `TXN_COLUMNS` select pattern — no GROUP BY needed, no
refactor of other query functions. Apply the same subquery to both
`findTransactionsByMonth` and `findTransactionsPaginated` (used by search in Show All).

For transactions with no tags, `tags` is an empty array (not null).

---

## Frontend — Store

### State additions

- `store.state.tags` — `[{ id, name, createdAt }]`, full tag list for the user
- Each transaction in `store.state.transactions` gains a `tags` array: `[{ id, name }]`

### Mutations

- `setTags(state, tags)` — replace full tag list
- `addTag(state, tag)` — append a new tag
- `removeTag(state, tagId)` — remove from list + strip from all transactions' tags arrays
- `setTransactionTags(state, { transactionIds, tags })` — update tags on specific transactions

`clearState` mutation must also reset `tags: []`.

### Loading

Tags load during `ensureAppData` alongside categories and rules (added to the
existing `Promise.all`). A new `fetchTags()` API wrapper calls `GET /api/tags` and
commits `setTags`.

---

## Frontend — Tag Picker Component

Reusable `TagPicker.vue` component used in the edit dialog and bulk tag action.

**Implementation:** Quasar `q-select` with `use-chips`, `multiple`, `use-input`,
`new-value-mode="add-unique"`. Shows existing tags from `store.state.tags` as
filterable options. Creating a new tag inline calls `POST /api/tags`, adds to store,
and includes it in the selection.

**Props:**
- `modelValue` — array of tag objects `[{ id, name }]`
- Emits `update:modelValue` on change

**Behavior:**
- Type to filter existing tags
- Type a new name + confirm to create inline
- Chips render inside the field for selected tags
- Removal via chip × button

---

## Frontend — Edit Transaction Dialog

**Location:** `DialogComponent.vue`, as a standalone section between `basil-dialog-fields`
(Date/Category/Note) and `basil-dialog-toggles` (Exclude from total). Keeps the tag
picker visually separate from the core fields since chips can take vertical space.

**Field:** `TagPicker` component bound to the transaction's current tags.

**On submit:** Diff the before/after tag lists. Call `POST /api/tagTransactions` for
additions and `POST /api/untagTransactions` for removals. Update store via
`setTransactionTags` mutation.

**Tag creation:** When a user types a new tag name and confirms in the picker,
`POST /api/tags` creates it immediately. The new tag appears in `store.state.tags` and
is included in the transaction's tags on submit.

---

## Frontend — Bulk Tagging in Show All Table

**Entry point:** The existing bulk action bar (appears on row selection) gains a "Tag"
button alongside "Move to category".

**Flow:**
1. User selects rows (long-press on mobile, checkboxes on desktop)
2. Taps "Tag" in the bulk bar
3. `BasilTray` opens with `TagPicker` and "Apply" button
4. Tags are added to all selected transactions via `POST /api/tagTransactions`
5. Tray closes, selection clears, badges appear on rows

**No bulk untag in v1.** Remove tags per-transaction in the edit dialog.

---

## Frontend — Tag Badges on Transaction Rows

**Where:** Individual transaction rows in budget view (expanded category list) and
Show All table. Not on category header rows.

**Rendering:** Compact chips after the transaction name, before the amount.
- Background: `var(--basil-surface-alt)`
- Text: `var(--basil-text-secondary)`
- Font size: 0.6875rem
- Long tag names truncated with ellipsis (max-width on chip)
- CSS class: `basil-tag-badge`

**Not tappable in v1** — purely visual. Filtering is via the Show All table filter.

**Mobile:** Max 2 visible badges + "+N" overflow indicator. Full list in edit dialog.

---

## Frontend — Tags View (`/tags`)

**Route:** `/tags`. On desktop, accessible from the top nav (alongside Rules, Merchants).
On mobile, accessible from the hamburger/drawer menu — the bottom nav (4 tabs) is full.
Mobile nav placement can be revisited when "Customizable nav" (backlog item) is built.

**Tag list:** Each row shows:
- Tag name
- Total spend (sum of tagged transaction amounts)
- Transaction count
- Date range (earliest → latest)

**Tap a tag → detail expansion or drill-down:**
- Category breakdown: list showing spend per category (Food $400, Transport $200)
- Transaction list: all transactions with this tag, sorted by date

**Tag management:** Swipe-to-delete via `SwipeReveal` (same pattern as RulesView).
Deleting removes the tag from all transactions (backend cascade). No rename in v1.

**Empty state:** `EmptyState` component — "No tags yet" with guidance text.

**Loading:** Uses `store.state.bootstrapping` three-state pattern (skeleton → empty → content).

**Data source:** Tag list from `GET /api/tags`. Summary/transactions fetched on tap
from `GET /api/tags/:id/summary` and `GET /api/tags/:id/transactions`.

---

## Frontend — Tag Filter on Show All Table

**Implementation:** `q-select` dropdown in the Show All table controls, populated from
`store.state.tags`. When a tag is selected, filter `tableTransactions` to only show
transactions whose `tags` array contains the selected tag.

**Client-side:** No new backend endpoint. Filters the in-memory transaction list.

**Clearable:** `clearable` prop on the select. Cleared → show all transactions.

**Stacks with search:** Tag filter and text search are independent — both applied
simultaneously.

**Mobile toolbar:** The controls row is already crowded on mobile. Implementation
should address this — likely a collapsible filter section or a filter icon that
expands to show tag + amount filters.

---

## Out of scope

- Rule action: auto-tag (v2 — placeholder exists in RuleEditorDialog)
- Tag filter on Trends view (v2)
- Bulk untag (v2)
- Tag rename (v2 — delete + recreate for now)
- Tag groups/hierarchy (future — flat only, schema designed for later `group` column)
- Tag colors (future)
- Tappable tag badges (future — filtering from badge tap)
