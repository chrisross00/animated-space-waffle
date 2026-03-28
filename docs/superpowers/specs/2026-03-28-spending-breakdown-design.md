# Spending Breakdown — Design Spec

## Problem

The hero card on BudgetView answers "how's my spending" (remaining budget, progress)
but not "where's my spending." Users who haven't set up budgets have no quick way to
see spending composition. Users with budgets can see category progress bars below, but
those don't show proportional breakdown at a glance.

## Solution

An expandable spending breakdown inside the hero card. A donut chart shows spending
by Basil category, with drill-down into PFC detail codes. A toggle switches between
category view and full-detail view. A contextual CTA nudges budget setup when drilling
into a category without a spending limit.

## Interaction Model

### Trigger

Below the existing hero card stats (remaining amount, progress bar, fixed/savings),
a divider and a collapsed trigger row:

```
─────────────────────────
🍩  Where's my spending?  ›
```

Mini donut icon + label + chevron. Tapping expands the breakdown inline (height
transition). Tapping again collapses. Shows for all users regardless of budget setup.

### Expanded State — Category View (default)

A centered donut chart with total spending in the center (`$X,XXX` / "spent").
Below the donut: a "Detailed view" BasilToggle (off by default).
Below the toggle: wrapped category chips — colored dot + name + dollar amount.

```
        ┌─────────────┐
        │   ╭─────╮   │
        │   │$3,260│   │
        │   │ spent│   │
        │   ╰─────╯   │
        │              │
        │  ○ Detailed  │
        │              │
        │ [Food $1,140] [Transport $715] │
        │ [Fun $555] [Shopping $390]     │
        │ [Other $460]                   │
        │                                │
        │  Tap a category for details    │
        └────────────────────────────────┘
```

**Data flow:**
1. Filter current month transactions: category `type === 'expense'`, `!excludeFromTotal`
2. Group by `mappedCategory`, sum absolute amounts
3. Sort descending by total
4. Slices under 2% of total collapse into "Other"
5. Colors assigned from `CHART_PALETTE` (15-color editorial palette)
6. ECharts `minAngle: 8` ensures thin slices remain visible

Tapping a chip → category drill-down (below).
Toggling "Detailed view" ON → all-PFC-detail view (below).

### Category Drill-Down (PFC detail for one category)

Tapping a category chip (e.g., "Food & Dining") transitions the donut in place to
show PFC detail codes within that category. Chips update to Coffee, Groceries,
Restaurants, etc. A "← All categories" link appears above the donut.

**Data flow:**
1. Same expense filter for current month
2. Further filter: `mappedCategory === tappedCategory`
3. Group by `plaidPfcDetail`, sum amounts
4. Labels from `humanizeDetailedPfc()` (existing in `pfcLabels.js`)
5. Null/undefined `plaidPfcDetail` → "Other"
6. Slices under 2% collapse into "Other"
7. Center label: category total + category name (e.g., `$1,140` / "Food & Dining")

**Budget setup CTA:** If the drilled-into category has no `monthly_limit`, a row
appears below the chips:

```
Set a limit for Food & Dining →
```

Tapping emits `edit-category` with the category name. The parent (BudgetView)
opens the Edit Category dialog pre-loaded with that category.

The "Detailed view" toggle is hidden during drill-down. It returns on back.

### All PFC Detail View (toggle ON)

Toggling "Detailed view" ON transitions the donut to show every PFC detail code
across all expense categories. Chips update to Coffee, Groceries, Gas, Rent, etc.

**Data flow:**
1. Same expense filter
2. Group by `plaidPfcDetail` (not `mappedCategory`)
3. Labels from `humanizeDetailedPfc()`
4. Null/undefined → "Other spending"
5. Slices under 2% collapse into "Other"
6. Center label: total spending (`$3,260` / "spent")
7. Likely 10-15 visible slices after collapse

Chips in this view are non-interactive legend items — tapping does nothing (no
further drill-down at this level). No budget CTA in this view (not scoped to a
single category).

Toggling OFF → returns to category donut.

## Animation & Transitions

- **Expand/collapse:** Height transition on the breakdown section. Collapse clears
  the chart to save memory.
- **Donut transitions:** ECharts built-in pie animation — slices morph between data
  sets. Uses existing `ANIMATION` constant (`duration: 800, easing: cubicOut`).
- **Chip legend:** Crossfade via CSS `transition: opacity` on keyed `v-for`.

## Architecture

### New file: `frontend/src/components/SpendingBreakdown.vue`

Self-contained component owning its chart, state, and legend.

**Props:**
- `transactions` (Array) — current month's transactions
- `categories` (Array) — store.state.categories
- `month` (String) — selected month display label (for future use)

**Emits:**
- `edit-category` (String: categoryName) — when budget CTA is tapped

**Internal state:**
- `expanded` (Boolean) — collapsed/expanded
- `mode` ('category' | 'detail-all' | 'detail-single') — current donut view
- `drillCategory` (String | null) — which category is drilled into

**Computeds:**
- `categoryBreakdown` — grouped by mappedCategory, sorted, with Other bucket
- `detailBreakdown` — grouped by plaidPfcDetail (all categories), sorted, with Other
- `drillBreakdown` — grouped by plaidPfcDetail within `drillCategory`, sorted, with Other
- `chartOption` — ECharts pie option, switches on `mode`
- `chips` — legend items derived from active breakdown
- `showBudgetCTA` — true when `mode === 'detail-single'` and category has no limit

**ECharts:** Registers `PieChart`. Uses `<v-chart>` with `:option="chartOption"` and `autoresize`.

### New file: `frontend/src/utils/chartConstants.js`

Extracts shared chart constants from TrendsView (currently inline):

```js
export const CHART_PALETTE = [
  '#4a8b6c', '#c07a1a', '#2366a8', '#b05a3a', '#7a5ab5',
  '#5a8a4a', '#b54a6a', '#3a8b8b', '#b07040', '#5a6ab5',
  '#8b4a7a', '#3a6b8b', '#8a6a2a', '#3a7a3a', '#a84a4a',
]

export const CHART_ANIMATION = {
  animation: true,
  animationDuration: 800,
  animationEasing: 'cubicOut',
}
```

TrendsView updated to import from here instead of defining inline.

### Modified file: `frontend/src/views/BudgetView.vue`

Minimal changes:
- Import `SpendingBreakdown`
- Add `<SpendingBreakdown>` in template below hero card stats, inside the card
- Pass `transactions`, `categories` props
- Handle `@edit-category` event (opens Edit Category dialog)

~5-10 lines of template, no new computeds or data properties in BudgetView.

### Existing utilities reused

| Utility | Location | Purpose |
|---------|----------|---------|
| `humanizeDetailedPfc()` | `utils/pfcLabels.js` | PFC code → friendly label |
| `BasilToggle` | `components/basil/BasilToggle.vue` | Detailed view toggle |
| `CHART_PALETTE` | `utils/chartConstants.js` (new, extracted) | Donut slice colors |
| `CHART_ANIMATION` | `utils/chartConstants.js` (new, extracted) | ECharts animation config |
| `store.state.categories[].type` | Store | Filter expense categories |
| `store.state.categories[].monthly_limit` | Store | Budget CTA condition |

## ECharts Config

```js
{
  ...CHART_ANIMATION,
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    center: ['50%', '50%'],
    minAngle: 8,
    label: { show: false },
    emphasis: { scale: true, scaleSize: 4 },
    data: slices.map((s, i) => ({
      name: s.label,
      value: s.total,
      itemStyle: { color: CHART_PALETTE[i % CHART_PALETTE.length] },
    })),
  }],
  graphic: [{
    type: 'text',
    left: 'center',
    top: 'center',
    style: {
      text: `$${totalSpent.toLocaleString()}\nspent`,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: 500,
    },
  }],
}
```

## Scope Exclusions

- No transaction list drill-down (tap slice → see charges). Follow-up feature.
- No multi-month comparison. Single month only (matches hero card's month).
- No new API calls. All data already in `store.state.transactions`.
- No store changes. Component reads existing state.
- No backend changes.
- Desktop: same behavior (inline expand), no layout adaptation needed since the
  hero card is already max-width constrained.

## Testing

- Expand/collapse toggles breakdown visibility
- Category donut shows correct totals matching the "spent" number in the hero
- Drill-down into a category shows correct PFC items
- "Other" bucket aggregates slices under 2%
- Toggle switches between category and all-detail view
- Budget CTA appears only for categories without `monthly_limit`
- Budget CTA opens Edit Category dialog with correct category
- Dark mode: chart colors, center label, chips all use Basil tokens
- Empty state: if no expense transactions, collapse trigger hides or shows "No spending data"
