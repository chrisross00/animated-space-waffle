# Transaction Drill-Down Polish — Design Spec

**Goal:** Transform the bare transaction drill-down from a minimal list into a polished read-only insight view with merchant avatars, a collapsing summary header, and flat transaction list with dates.

**Scope:** Visual polish and insight stats only. No tap-to-edit, no PFC override system (that's a separate high-priority backlog item).

---

## User Flow

1. Budget page → spending breakdown → drill into category → tap PFC detail chip
2. Slide-left into `TransactionDrillDown` (existing route, existing transition)
3. User sees: summary header with stat cards (avg, largest, vs last month) + transaction list
4. User scrolls → stat cards collapse into compact bar (count + trend delta)
5. User scrolls back to top → stat cards expand back
6. Back button or swipe-back → returns to budget page (existing behavior)

---

## Layout: Two States

### Expanded (top of list)

```
┌─────────────────────────────────────┐
│  ←  Coffee · $127                   │  ← sticky header (existing)
├─────────────────────────────────────┤
│  MARCH 2026              7 transactions│
│  ┌─────────┐ ┌─────────┐ ┌─────────┐│
│  │ Avg     │ │ Largest │ │ vs Feb  ││
│  │ $18.14  │ │ $47.00  │ │ +23%   ││  ← stat cards
│  └─────────┘ └─────────┘ └─────────┘│
├─────────────────────────────────────┤
│  (ST) Starbucks              $6.45  │
│       Mar 25                        │
│  (BL) Blue Bottle Coffee     $5.75  │
│       Mar 25                        │
│  (DU) Dunkin'                $4.29  │
│       Mar 22                        │
│  ...                                │
└─────────────────────────────────────┘
```

### Collapsed (scrolling)

```
┌─────────────────────────────────────┐
│  ←  Coffee · $127                   │  ← sticky header (unchanged)
├─────────────────────────────────────┤
│  7 transactions · March 2026  ↑23%  │  ← compact bar
├─────────────────────────────────────┤
│  (DU) Dunkin'                $4.29  │
│       Mar 22                        │
│  ...                                │
└─────────────────────────────────────┘
```

---

## Summary Header

### Stat Cards (expanded state)

Three cards in a row:

| Card | Value | Source |
|------|-------|--------|
| **Avg** | `total / count` | Computed from `filteredTransactions` |
| **Largest** | `Math.max(...amounts)` | Largest absolute amount in the filtered set |
| **vs [prev month]** | Percentage change | Compare current month total to same PFC code in the previous month. Show `↑ N%` (red) or `↓ N%` (green) or `—` if no prior data. Month label abbreviation: "vs Feb" |

### Compact Bar (collapsed state)

Single line: `{count} transactions · {month year}` on the left, `↑ N% vs {prev}` on the right.

### Collapse Behavior

- Driven by scroll position of the transaction list
- Stat cards animate via `max-height` + `opacity` (CSS transition)
- Threshold: collapse begins when scroll > 0, fully collapsed by ~60px of scroll
- Compact bar is always rendered underneath stat cards; stat cards overlay it when expanded
- Scrolling back to top reverses the animation
- Implementation: scroll listener on the list container. When `scrollTop > 0`, add a `--collapsed` class to the summary. CSS transitions handle the animation. Simple boolean — no partial states.

---

## Transaction Rows

### Per-row content

- **Merchant avatar** — colored circle with initials (same logic as BudgetView)
  - Initials: first letter of first two words, or first two chars
  - Color: hash-based from 10-color palette
  - Size: 32px circle
- **Merchant name** — `merchant_name || name` (bold, primary text color)
- **Date** — `effectiveDate || date`, formatted as "Mar 25" (secondary text color, below merchant name)
- **Amount** — right-aligned, monospace, tabular-nums
  - Debits: `$6.45` in primary text color
  - Credits: `$6.45` in `var(--basil-positive)` color

### Not included (read-only scope)

- No tags, relationship badges, or split indicators
- No tap-to-edit (reserved for PFC override feature)
- No effective date icon (the date shown IS the effective date)

### Sort order

Newest first by `effectiveDate || date` (existing behavior, unchanged).

### Row separators

`1px solid var(--basil-border)` between rows (existing behavior).

---

## Merchant Avatar Utilities

`merchantInitials(row)` and `merchantColor(row)` currently live as local methods in BudgetView (~lines 2410-2429). These need to be **extracted to a shared utility** so TransactionDrillDown can reuse them without duplication.

Create: `frontend/src/utils/merchantDisplay.js`

```js
const MERCHANT_PALETTE = [
  '#b07d4a', '#4a8b6c', '#5a7fb5', '#8b5a4a',
  '#6b8b4a', '#7a5ab5', '#b54a6a', '#4a8b8b',
  '#b58b4a', '#6a7ab5',
]

export function merchantInitials(row) {
  const key = (row.merchant_name || row.name || '?').trim()
  const words = key.split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return key.substring(0, 2).toUpperCase()
}

export function merchantColor(row) {
  const key = row.merchant_name || row.name || '?'
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  return MERCHANT_PALETTE[Math.abs(hash) % MERCHANT_PALETTE.length]
}
```

BudgetView should import from this utility instead of defining its own copies.

---

## "vs Last Month" Calculation

The comparison needs transactions from the previous month for the same PFC code + category. These may or may not be loaded in `store.state.transactionsByMonth`.

**Approach:** Use `fetchTransactionsForMonth()` if the previous month isn't cached, but don't block rendering — show `—` while loading, update when data arrives. In practice, BudgetView loads current + 3 prior months on mount, so the previous month is almost always cached.

**Logic:**
```
prevMonth = dayjs(month).subtract(1, 'month').format('YYYY-MM')
prevTotal = sum of |amount| for transactions matching same category + pfc + prevMonth
change = ((currentTotal - prevTotal) / prevTotal) * 100
```

If `prevTotal === 0`, show `—` (no comparison possible, not "∞%").

---

## Styling

- All colors via `var(--basil-*)` tokens
- BEM naming: `basil-drilldown__*` (extends existing classes)
- Summary background: `var(--basil-surface-alt)`
- Stat card background: `var(--basil-surface)` with `1px solid var(--basil-border)`
- Stat card labels: uppercase, `0.625rem`, `var(--basil-text-muted)`
- Stat card values: `var(--basil-font-mono)`, `font-weight: 600`
- Trend color: increase = `var(--basil-negative)`, decrease = `var(--basil-positive)`
- Compact bar: same `var(--basil-surface-alt)` background
- Avatar: `width: 32px; height: 32px; border-radius: 50%` with white text
- Dark mode: handled automatically by Basil tokens. Stat card backgrounds use `var(--basil-surface)`.

---

## Empty State

No transactions: centered "No transactions" (existing behavior, unchanged).

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/utils/merchantDisplay.js` | Create | Extract `merchantInitials` + `merchantColor` |
| `frontend/src/views/TransactionDrillDown.vue` | Modify | Add summary header, stat cards, collapse behavior, merchant avatars, date on rows |
| `frontend/src/views/BudgetView.vue` | Modify | Import merchant utils from shared module instead of local methods |
