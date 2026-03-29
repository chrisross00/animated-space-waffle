# Transaction Drill-Down — Spec + Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a user taps a PFC detail chip in the spending breakdown's category drill-down view, route to a focused transaction list showing the individual transactions for that PFC code.

**Branch:** `hero-spending-breakdown` (already exists, spending breakdown feature is on it but merged to main — continue on main)

## Design

### User Flow
1. Budget page → hero card → "Spending breakdown" trigger → donut expands
2. Tap a category chip (e.g., "Food & Dining") → donut drills into PFC detail
3. Tap a PFC detail chip (e.g., "Coffee $85") → **routes to transaction list view**
4. Back arrow or swipe-back → returns to Budget page (donut stays in drill-down state)

### Only PFC detail chips in `detail-single` mode are links
- Category-level chips → drill-down (stays on page, existing behavior)
- PFC detail chips in `detail-all` mode → non-interactive (existing behavior)
- PFC detail chips in `detail-single` mode → route to this new view ← **NEW**

### Route
```
/budget/transactions?pfc=FOOD_AND_DRINK_COFFEE&month=2026-03&category=Food+%26+Dining
```
- `pfc` — the PFC detail code to filter by (or `__other__` for the Other bucket)
- `month` — YYYY-MM format, from the selected budget month
- `category` — the parent Basil category name (for the header context)

Not added to the nav bar. Only accessible via the spending breakdown chips.

### New View: `TransactionDrillDown.vue`
- **Header:** back arrow + PFC label + total ("← Coffee · $85"). Label from `humanizeDetailedPfc()`.
- **Body:** flat list of transactions matching the filter. Each row: date (left), merchant name (middle), amount (right). Sorted newest first.
- **Read-only:** no tap-to-edit, no search, no bulk actions. (Edit can be added later by wiring DialogComponent.)
- **Empty state:** "No transactions" if filter returns nothing.
- **Data source:** `store.state.transactions` filtered by month + PFC code. No new API calls.

### Transition
- **Enter:** slide-left (new view slides in from right, budget slides out left)
- **Leave:** slide-right (reverse). Back arrow + swipe-back gesture on mobile.
- Vue Router transition based on route meta or navigation direction.

### Styling
- Basil design tokens throughout
- `.basil-drilldown__*` BEM classes, scoped styles
- Transaction rows use existing patterns from BudgetView's category row transactions
- Safe area padding at bottom for mobile

---

## Implementation Plan

### Task 1: Create TransactionDrillDown view

**Files:**
- Create: `frontend/src/views/TransactionDrillDown.vue`

```vue
<template>
  <div class="basil-drilldown">
    <div class="basil-drilldown__header">
      <button class="basil-drilldown__back" @click="$router.back()">
        <BasilIcon name="arrow_back" size="20px" />
      </button>
      <div class="basil-drilldown__title">
        <span class="basil-drilldown__label">{{ pfcLabel }}</span>
        <span class="basil-drilldown__amount">${{ Math.round(total).toLocaleString() }}</span>
      </div>
    </div>

    <div v-if="filteredTransactions.length === 0" class="basil-drilldown__empty">
      No transactions
    </div>

    <div v-else class="basil-drilldown__list">
      <div
        v-for="txn in filteredTransactions"
        :key="txn.transaction_id"
        class="basil-drilldown__row"
      >
        <div class="basil-drilldown__row-left">
          <div class="basil-drilldown__merchant">{{ txn.merchant_name || txn.name }}</div>
          <div class="basil-drilldown__date">{{ formatDate(txn.effectiveDate || txn.date) }}</div>
        </div>
        <div class="basil-drilldown__row-amount" :class="{ 'basil-drilldown__row-amount--credit': txn.amount >= 0 }">
          {{ txn.amount < 0 ? `-$${Math.abs(txn.amount).toFixed(2)}` : `$${Number(txn.amount).toFixed(2)}` }}
        </div>
      </div>
    </div>
  </div>
</template>
```

**Script:**
- Read `pfc`, `month`, `category` from `$route.query`
- Compute `pfcLabel` from `humanizeDetailedPfc(pfc)` (handle `__other__` → "Other")
- Compute `filteredTransactions` from `store.state.transactions` filtered by:
  - Month matches (using dayjs, same pattern as BudgetView)
  - `mappedCategory === category` (from query)
  - `plaidPfcDetail === pfc` (or null/undefined for `__other__`)
  - `!excludeFromTotal`
- Compute `total` as sum of absolute amounts
- `formatDate` method: use dayjs to format as "Mar 3, 2026"
- Sort: newest first by `effectiveDate || date`

**Styles:** Scoped, BEM, Basil tokens. Header is fixed/sticky at top. List scrolls.
Simple row layout — merchant name + date on left, amount on right.

- [ ] Create the component with template, script, and scoped styles
- [ ] Verify build: `cd frontend && npx vite build`
- [ ] Commit: `git commit -m "feat: TransactionDrillDown view for PFC detail transactions"`

### Task 2: Add route with slide transition

**Files:**
- Modify: `frontend/src/router.js` (or wherever routes are defined)
- Modify: `frontend/src/App.vue` (transition wrapper)

- [ ] Add route:
```js
{
  path: '/budget/transactions',
  name: 'TransactionDrillDown',
  component: () => import('@/views/TransactionDrillDown.vue'),
  meta: { transition: 'slide-left' },
}
```

- [ ] Add slide transition CSS in App.vue (or global styles):
```css
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s ease;
}
.slide-left-enter-from {
  transform: translateX(100%);
}
.slide-left-leave-to {
  transform: translateX(-30%);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease;
}
.slide-right-enter-from {
  transform: translateX(-30%);
}
.slide-right-leave-to {
  transform: translateX(100%);
}
```

- [ ] Update `<router-view>` transition in App.vue to use route meta for transition name. Track navigation direction (forward = slide-left, back = slide-right).

- [ ] Verify: navigate to `/budget/transactions?pfc=FOOD_AND_DRINK_COFFEE&month=2026-03&category=Food+%26+Dining` directly — should render.
- [ ] Commit: `git commit -m "feat: route and slide transition for transaction drill-down"`

### Task 3: Wire SpendingBreakdown chips to route

**Files:**
- Modify: `frontend/src/components/SpendingBreakdown.vue`

- [ ] In `detail-single` mode, make PFC detail chips into router-links:
  - When `mode === 'detail-single'`, tapping a chip calls `$router.push` with the PFC code, month, and category as query params
  - The month comes from a new prop (passed from BudgetView's `selectedDate`)
  - The category is `drillCategory`

- [ ] Add `month` prop to SpendingBreakdown:
```js
month: { type: String, default: '' }, // 'YYYY-MM' format
```

- [ ] Update BudgetView to pass the month prop:
```html
<SpendingBreakdown
  :transactions="expenseTransactions"
  :categories="$store.state.categories || []"
  :month="selectedDate.actual.format('YYYY-MM')"
  @edit-category="openEditCategoryFromBreakdown"
/>
```

- [ ] Update chip click handler in SpendingBreakdown for `detail-single` mode:
```js
@click="onChipClick(chip)"
```
```js
onChipClick(chip) {
  if (this.mode === 'category') {
    this.drillInto(chip.categoryName)
  } else if (this.mode === 'detail-single') {
    this.$router.push({
      path: '/budget/transactions',
      query: {
        pfc: chip.categoryName,  // this is the PFC code (key from breakdown)
        month: this.month,
        category: this.drillCategory,
      },
    })
  }
  // detail-all: do nothing
}
```

- [ ] Verify: expand breakdown → drill into category → tap PFC chip → navigates to drill-down view → back arrow returns
- [ ] Commit: `git commit -m "feat: wire PFC detail chips to transaction drill-down route"`

### Task 4: Polish and test

- [ ] Test slide transition (forward and back)
- [ ] Test swipe-back gesture on mobile (if supported by the router transition)
- [ ] Test dark mode on the drill-down view
- [ ] Test empty state (PFC code with no transactions)
- [ ] Test that back navigation preserves the donut drill-down state
- [ ] Test desktop layout
- [ ] Commit any fixes

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/views/TransactionDrillDown.vue` | Create | Transaction list view |
| `frontend/src/router.js` | Modify | Add route |
| `frontend/src/App.vue` | Modify | Slide transition CSS + direction logic |
| `frontend/src/components/SpendingBreakdown.vue` | Modify | Wire chips to router, add month prop |
| `frontend/src/views/BudgetView.vue` | Modify | Pass month prop to SpendingBreakdown |
