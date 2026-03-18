# UAT Polish — Remaining Items

Tracking remaining items from the original UAT feedback list. Tiers 1–3 are done
and merged to main.

## Completed (Tiers 1–3)

- [x] **Rules: replace `gt` with `>`** — Tier 1
- [x] **Get rid of vertical color bar on side of budget** — Tier 1
- [x] **Privacy policy not visible** — Tier 1
- [x] **All txns search bottom padding (chin coverage)** — Tier 2
- [x] **Trends: spending graph toggle expenses/savings** — Tier 2
- [x] **`pfc_detail` lost from expanded budget view** — Tier 3 (restored + backfill script)
- [x] **Get rid of pencil icons on category rows** — Tier 3

## Remaining

### UX overhaul: trays + swipe

- [ ] **Convert modals to trays** — bottom-sheet style with notch handle. Pull up to
      expand, pull down to dismiss. Applies to Edit Transaction, Edit Category,
      RuleEditorDialog, and any other modal surfaces.
- [ ] **Swipe gestures on list rows** — swipe-to-act on transaction rows and
      category rows (e.g. swipe to categorize, swipe to edit). Replaces the removed
      pencil icon as the category edit entry point.

### All Transactions rethink

- [ ] **Search area shrinks/jumps with few results** — the current inline "Show All"
      table resizes awkwardly when results are sparse. Consider transitioning to a
      dedicated full-page view (Gmail-style smooth navigation) instead of inline toggle.

### Tags

- [ ] **Tags on transactions** — details TBD. Likely a lightweight labeling system
      orthogonal to categories (e.g. "vacation", "tax-deductible", "reimbursable").

### Data freshness

- [ ] **Midday balance updates → refresh net worth + graph snapshots** — if Plaid
      pushes updated balances during the day, net worth figures and balance history
      charts should reflect the new data without waiting for the next full sync.

### Rules loading pattern

- [ ] **Rules: confirm loading strategy** — are compound rules using the same
      month-based lazy loading pattern as transactions, or loading all at once?
      If loading all, evaluate whether pagination/lazy loading is needed at scale.
