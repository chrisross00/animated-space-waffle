# Plan: Smart To Sort — Suggestion Engine + Triage UX

## Context
Transactions from peer payment apps (Venmo, Cash App, Zelle, PayPal) end up in "To Sort" because the merchant name carries no categorical signal. More broadly, any uncategorized transaction sits there waiting for manual attention. This feature adds: (1) a client-side suggestion engine that detects patterns and proposes categories, and (2) a triage UX — a nudge card on the dashboard + a bottom sheet flow — that lets users rapidly categorize unsorted transactions one at a time.

No new backend endpoints. No new routes. No new files — all changes go into BudgetView.vue and BudgetView.css.

---

## Files to modify

| File | What changes |
|------|-------------|
| `frontend/src/views/BudgetView.vue` | Computed properties (suggestion engine), data, methods, template (nudge card + triage dialog) |
| `frontend/src/styles/BudgetView.css` | CSS for nudge card + triage flow |

### Key existing code to reuse (no modifications needed)
| File | What | Why |
|------|------|-----|
| `frontend/src/firebase.js` | `handleDialogSubmit()` (line 130) | Call directly from `triageAccept()` — same POST shape as `onSubmit` |
| `frontend/src/store.js` | `updateTransaction` mutation (line 42) | Updates `mappedCategory` in the store reactively |
| `frontend/src/views/BudgetView.vue` | `updatedTransaction` watcher (line 1180) | Triggers `store.commit`, `groupTransactions()`, and `monthStats` recalc — we set `this.updatedTransaction = {...data}` to piggyback on this |
| `frontend/src/views/BudgetView.vue` | `recurringMerchants` computed (line 598) | Reuse for recurring boost signal |
| `frontend/src/views/BudgetView.vue` | `formatDate()` method (line 1093) | Already exists, reuse in triage display |

---

## Part 1: Suggestion Engine (computed properties)

All added to the `computed:` block after `recurringByCategory` (~line 628).

### `historicalCategoryMap`
Builds a lookup from lowercase merchant/name → most-frequently-assigned non-"To Sort" category across ALL historical transactions. This is the primary suggestion signal.

```js
historicalCategoryMap() {
  const freqMap = {};
  for (const txn of store.state.transactions || []) {
    if (txn.pending || !txn.mappedCategory || txn.mappedCategory === 'To Sort') continue;
    const key = (txn.merchant_name || txn.name || '').toLowerCase().trim();
    if (!key) continue;
    if (!freqMap[key]) freqMap[key] = {};
    freqMap[key][txn.mappedCategory] = (freqMap[key][txn.mappedCategory] || 0) + 1;
  }
  const result = {};
  for (const [key, cats] of Object.entries(freqMap)) {
    let best = null, bestCount = 0;
    for (const [cat, count] of Object.entries(cats)) {
      if (count > bestCount) { best = cat; bestCount = count; }
    }
    if (best) result[key] = { category: best, count: bestCount };
  }
  return result;
}
```

### `toSortTransactions`
Current-month, non-pending transactions with `mappedCategory === 'To Sort'`.

```js
toSortTransactions() {
  const sel = this.selectedDate.actual;
  return (store.state.transactions || []).filter(txn =>
    !txn.pending && txn.mappedCategory === 'To Sort' &&
    dayjs(txn.date).year() === sel.year() &&
    dayjs(txn.date).month() === sel.month()
  );
}
```

### `toSortWithSuggestions`
Enriches each To Sort transaction with `{ suggestion, confidence, reason }`.

**Signals in priority order:**
1. **Historical match** — has this merchant/name ever been categorized? Strongest signal. `count >= 3` → high confidence, else medium.
2. **Recurring boost** — if also in `recurringMerchants`, bump to high confidence.
3. **Same-day context** — if no historical match, and there's exactly one categorized transaction on the same day, suggest that category (low confidence). Conservative: skip if multiple same-day matches (ambiguous).

### `toSortSuggestionStats`
Summary for the nudge card: `{ total, withSuggestion }`.

### `triageItems`
`toSortWithSuggestions` filtered to exclude `triageSkipped` transaction IDs. This is what the triage flow iterates through.

---

## Part 2: Nudge Card (template)

**Insertion point:** After line 116 (closing `</div>` of the stats-row wrapper), before line 118 (Button Container). Below Actuals/Projections, above the month picker + category list.

**Visibility:** `v-if="toSortSuggestionStats.total > 0 && !showAll && !isLoading && !isRefreshing"`

**Structure:**
```
┌──────────────────────────────────┐
│ TO SORT                      › │
│                                  │
│  7  transactions to review       │
│     3 with suggested categories  │
└──────────────────────────────────┘
```

- Standard `basil-card-head` pattern with "To Sort" label and chevron_right
- Large display-font count on the left, descriptive text on the right
- Entire card is clickable → calls `openTriageFlow()`
- CSS: `basil-tosort-card`, `basil-tosort-card__body`, `basil-tosort-card__count`, `basil-tosort-card__headline`, `basil-tosort-card__hint`

---

## Part 3: Triage Flow (bottom sheet / dialog)

### Data properties to add
```js
triageOpen: false,
triageCategory: null,
triageCreateRule: false,
triageSaving: false,
triageDone: false,
triageSkipped: new Set(),
```

### Methods to add

**`openTriageFlow()`** — resets state, opens dialog, pre-fills first suggestion.

**`triageAccept()`** — saves via `handleDialogSubmit()`:
1. Build the same `d` object shape as `onSubmit` for `dialogType === 'transaction'` (lines 1021-1031)
2. Call `handleDialogSubmit(JSON.stringify(d))` directly
3. On success: set `this.updatedTransaction = {...data}` → triggers the existing watcher which calls `store.commit('updateTransaction')`, `groupTransactions()`, and `monthStats` recalc
4. If `createRule` was true and `merchantName` exists: do a local sweep updating matching To Sort transactions in the store (so the triage list reactively shrinks for all swept items, not just the one we saved)
5. Call `triageAdvance()`

**`triageSkip()`** — adds transaction_id to `triageSkipped` Set, calls `triageAdvance()`.

**`triageAdvance()`** — on `$nextTick`, checks `triageItems`. If empty → set `triageDone = true`. Else pre-fill `triageCategory` from next item's suggestion, reset `triageCreateRule`.

### Template structure

```
┌─────────────────────────────────────┐
│  ═══  (drag handle, mobile only)    │
│                                     │
│  Sort Transactions    2 of 7    ✕   │
│                                     │
│            -$42.50                  │
│            Venmo                    │
│          Feb 28, 2026              │
│                                     │
│     ✨ [ Food & Dining ]           │
│     Previously categorized (4x)     │
│                                     │
│  ┌─ Category ──────────────── ▾ ┐  │
│  └──────────────────────────────┘  │
│                                     │
│  ○ Remember for Venmo              │
│    All existing & future txns from  │
│    Venmo will be assigned to        │
│    Food & Dining.                   │
│                                     │
│  [ Skip ]              [ Save ]     │
└─────────────────────────────────────┘
```

**Key behaviors:**
- `q-dialog` with `:position="$q.screen.lt.sm ? 'bottom' : 'standard'"` — bottom sheet on mobile, centered dialog on desktop
- Card width: `100%` on mobile (bottom sheet pattern), `440px` on desktop
- Suggestion chip: clickable, toggles `triageCategory` to the suggestion value. Uses `auto_awesome` icon. Outlined when not selected, filled primary when selected.
- Category picker: `q-select` with full category list (excluding "To Sort"), so user can override the suggestion
- Remember toggle: `q-toggle` with merchant/name label. Shows disclosure text when enabled (same pattern as DialogComponent)
- Progress: `"2 of 7"` — calculated as `(total - remaining + 1) of total`
- Done state: checkmark icon + "All caught up!" + Done button → closes dialog

**Index management:** After each save, the saved transaction's `mappedCategory` changes, so `toSortWithSuggestions` reactively recomputes and shrinks. We always read `triageItems[0]` (the first non-skipped item). No explicit index counter needed — the list drains naturally.

---

## Part 4: CSS additions (BudgetView.css)

Two blocks:
1. **Nudge card** — `.basil-tosort-card` and children. Hover shadow, flex layout for count + text, warning color for count, muted hint text.
2. **Triage flow** — `.basil-triage__*` classes. Header with progress, centered transaction display (amount in display font, merchant, date), suggestion chip area, picker, toggle, action buttons, done state.

All use `var(--basil-*)` tokens — dark mode works automatically.

---

## Verification
1. Budget dashboard: nudge card appears when To Sort has items for the current month, hides when empty
2. Nudge card shows correct count + "X with suggested categories" subtitle
3. Tap nudge card → triage flow opens (bottom sheet on mobile, centered dialog on desktop)
4. Suggestion chip appears for transactions with historical matches, pre-selects the category
5. Save → transaction moves out of To Sort, budget view updates (category list, monthly stats), triage advances to next item
6. Save with "Remember" toggle → rule created, all matching transactions swept, triage list shrinks accordingly
7. Skip → transaction stays in To Sort but is excluded from the triage session
8. All items saved/skipped → "All caught up!" done state
9. Dark mode: all elements use tokens, no hardcoded colors
10. Desktop: dialog centered, 440px wide. Mobile: bottom sheet with drag handle
