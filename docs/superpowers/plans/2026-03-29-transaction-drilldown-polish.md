# Transaction Drill-Down Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the TransactionDrillDown view with merchant avatars, a collapsing summary header (stat cards → compact bar), and flat transaction list with dates.

**Architecture:** Extract merchant display utilities from BudgetView into a shared module. Rewrite TransactionDrillDown template with summary header (two visual states driven by scroll position) and enriched transaction rows. Previous-month comparison reads from Vuex store's `transactionsByMonth` cache, falling back to async fetch.

**Tech Stack:** Vue 3 (Options API) + Vuex 4 + dayjs

---

## Files

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/utils/merchantDisplay.js` | Create | Shared `merchantInitials` + `merchantColor` |
| `frontend/src/views/BudgetView.vue` | Modify | Import merchant utils from shared module |
| `frontend/src/views/TransactionDrillDown.vue` | Modify | Summary header, collapse, avatars, dates |

---

### Task 1: Extract merchant display utilities

**Files:**
- Create: `frontend/src/utils/merchantDisplay.js`
- Modify: `frontend/src/views/BudgetView.vue:2410-2429`

- [ ] Create `frontend/src/utils/merchantDisplay.js`:

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

- [ ] In `BudgetView.vue`, add import at top of `<script>` block:

```js
import { merchantInitials, merchantColor } from '@/utils/merchantDisplay'
```

- [ ] Replace the local `merchantInitials` method body (~line 2410-2414) with:

```js
merchantInitials(row) {
  return merchantInitials(row)
},
```

Wait — that creates a name collision. Instead, import with different names and delegate:

```js
import { merchantInitials as _merchantInitials, merchantColor as _merchantColor } from '@/utils/merchantDisplay'
```

Then replace method bodies:

```js
merchantInitials(row) {
  return _merchantInitials(row)
},
merchantColor(row) {
  return _merchantColor(row)
},
```

- [ ] Verify build: `cd frontend && npx vite build`
- [ ] Verify the BudgetView category card rows still render merchant avatars correctly (visual check)
- [ ] Commit: `git commit -m "refactor: extract merchantInitials and merchantColor to shared utility"`

---

### Task 2: Add merchant avatars and dates to transaction rows

**Files:**
- Modify: `frontend/src/views/TransactionDrillDown.vue`

- [ ] Add import at top of `<script>`:

```js
import { merchantInitials, merchantColor } from '@/utils/merchantDisplay'
```

- [ ] Replace the current row template (the `v-for` block) with:

```vue
<div
  v-for="txn in filteredTransactions"
  :key="txn.transaction_id"
  class="basil-drilldown__row"
>
  <div
    class="basil-drilldown__avatar"
    :style="{ background: merchantColor(txn) }"
  >{{ merchantInitials(txn) }}</div>
  <div class="basil-drilldown__row-left">
    <div class="basil-drilldown__merchant">{{ txn.merchant_name || txn.name }}</div>
    <div class="basil-drilldown__date">{{ formatDate(txn.effectiveDate || txn.date) }}</div>
  </div>
  <div
    class="basil-drilldown__row-amount"
    :class="{ 'basil-drilldown__row-amount--credit': txn.amount >= 0 }"
  >
    {{ txn.amount < 0 ? `-$${Math.abs(txn.amount).toFixed(2)}` : `$${Number(txn.amount).toFixed(2)}` }}
  </div>
</div>
```

- [ ] Add `merchantInitials` and `merchantColor` to the `methods` block:

```js
merchantInitials(row) {
  return merchantInitials(row)
},
merchantColor(row) {
  return merchantColor(row)
},
```

Same aliased import pattern as BudgetView — import as `_merchantInitials`/`_merchantColor`, expose as methods so the template can call them. Alternatively, since this is Options API, just use the imports directly in methods:

```js
import { merchantInitials as getMerchantInitials, merchantColor as getMerchantColor } from '@/utils/merchantDisplay'

// In methods:
merchantInitials(row) {
  return getMerchantInitials(row)
},
merchantColor(row) {
  return getMerchantColor(row)
},
```

- [ ] Update `formatDate` to use short format (no year — the month is already in the header):

```js
formatDate(date) {
  return dayjs(date).format('MMM D')
},
```

- [ ] Add avatar CSS to the scoped styles:

```css
.basil-drilldown__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  flex-shrink: 0;
}
```

- [ ] Update the `.basil-drilldown__row` CSS to include avatar gap:

```css
.basil-drilldown__row {
  display: flex;
  align-items: center;
  gap: var(--basil-space-3);
  padding: var(--basil-space-3) var(--basil-space-4);
  border-bottom: 1px solid var(--basil-border);
}
```

(This should already be close to what exists — just verify `gap` is present.)

- [ ] Verify build: `cd frontend && npx vite build`
- [ ] Commit: `git commit -m "feat: merchant avatars and short dates on drill-down rows"`

---

### Task 3: Add collapsing summary header

**Files:**
- Modify: `frontend/src/views/TransactionDrillDown.vue`

This is the main task. The summary header has two visual states:
- **Expanded:** month label, transaction count, three stat cards (Avg, Largest, vs prev month)
- **Collapsed:** single-line compact bar with count + trend

- [ ] Add computed properties for the summary stats:

```js
count() {
  return this.filteredTransactions.length
},

monthLabel() {
  if (!this.month) return ''
  return dayjs(this.month).format('MMMM YYYY')
},

prevMonthLabel() {
  if (!this.month) return ''
  return dayjs(this.month).subtract(1, 'month').format('MMM')
},

avgAmount() {
  if (this.count === 0) return 0
  return this.total / this.count
},

largestAmount() {
  if (this.count === 0) return 0
  return Math.max(...this.filteredTransactions.map(t => Math.abs(t.amount)))
},

prevMonthTotal() {
  if (!this.month || !this.category) return null
  const prevMonth = dayjs(this.month).subtract(1, 'month').format('YYYY-MM')
  const prevTxns = this.$store.state.transactionsByMonth[prevMonth]
  if (!prevTxns) return null

  const pfc = this.pfc
  return prevTxns
    .filter(t => {
      if (t.excludeFromTotal) return false
      if (t.mappedCategory !== this.category) return false
      if (pfc === '__other__') return !t.plaidPfcDetail
      return t.plaidPfcDetail === pfc
    })
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)
},

trendPercent() {
  if (this.prevMonthTotal === null || this.prevMonthTotal === 0) return null
  return Math.round(((this.total - this.prevMonthTotal) / this.prevMonthTotal) * 100)
},

trendDisplay() {
  if (this.trendPercent === null) return null
  const arrow = this.trendPercent > 0 ? '↑' : '↓'
  return {
    text: `${arrow} ${Math.abs(this.trendPercent)}% vs ${this.prevMonthLabel}`,
    isIncrease: this.trendPercent > 0,
  }
},
```

- [ ] Add `collapsed` to `data()`:

```js
data() {
  return {
    collapsed: false,
  }
},
```

- [ ] Add `onListScroll` method and lifecycle hooks:

```js
// In methods:
onListScroll(e) {
  this.collapsed = e.target.scrollTop > 0
},

// In mounted:
mounted() {
  const list = this.$refs.list
  if (list) list.addEventListener('scroll', this.onListScroll, { passive: true })
},

beforeUnmount() {
  const list = this.$refs.list
  if (list) list.removeEventListener('scroll', this.onListScroll)
},
```

- [ ] Add `ref="list"` to the list container in the template. Replace the existing list div:

```vue
<div v-else ref="list" class="basil-drilldown__list" @scroll="onListScroll">
```

(Remove the separate `mounted`/`beforeUnmount` approach — use `@scroll` directly in the template instead, which is simpler.)

- [ ] Add the summary header template between the existing header and the list/empty block. Insert after the `basil-drilldown__header` div:

```vue
<div v-if="filteredTransactions.length > 0" class="basil-drilldown__summary" :class="{ 'basil-drilldown__summary--collapsed': collapsed }">
  <!-- Compact bar (always rendered, visible when collapsed) -->
  <div class="basil-drilldown__compact">
    <span class="basil-drilldown__compact-left">{{ count }} transactions · {{ monthLabel }}</span>
    <span v-if="trendDisplay" class="basil-drilldown__compact-trend" :class="trendDisplay.isIncrease ? 'basil-drilldown__compact-trend--up' : 'basil-drilldown__compact-trend--down'">
      {{ trendDisplay.text }}
    </span>
  </div>
  <!-- Stat cards (collapse on scroll) -->
  <div class="basil-drilldown__stats">
    <div class="basil-drilldown__stat-row">
      <span class="basil-drilldown__stat-meta">{{ monthLabel.toUpperCase() }}</span>
      <span class="basil-drilldown__stat-meta">{{ count }} transactions</span>
    </div>
    <div class="basil-drilldown__stat-cards">
      <div class="basil-drilldown__stat-card">
        <div class="basil-drilldown__stat-label">Avg</div>
        <div class="basil-drilldown__stat-value">${{ Math.round(avgAmount).toLocaleString() }}</div>
      </div>
      <div class="basil-drilldown__stat-card">
        <div class="basil-drilldown__stat-label">Largest</div>
        <div class="basil-drilldown__stat-value">${{ Math.round(largestAmount).toLocaleString() }}</div>
      </div>
      <div class="basil-drilldown__stat-card">
        <div class="basil-drilldown__stat-label">vs {{ prevMonthLabel }}</div>
        <div class="basil-drilldown__stat-value" :class="trendPercent > 0 ? 'basil-drilldown__stat-value--up' : trendPercent < 0 ? 'basil-drilldown__stat-value--down' : ''">
          {{ trendPercent === null ? '—' : `${trendPercent > 0 ? '+' : ''}${trendPercent}%` }}
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] Add the summary CSS:

```css
/* Summary header */
.basil-drilldown__summary {
  position: sticky;
  top: 53px; /* below the header */
  z-index: 5;
  background: var(--basil-surface-alt);
  border-bottom: 1px solid var(--basil-border);
  overflow: hidden;
}

/* Compact bar — always present */
.basil-drilldown__compact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--basil-space-2) var(--basil-space-4);
}

.basil-drilldown__compact-left {
  font-size: 0.6875rem;
  color: var(--basil-text-muted);
}

.basil-drilldown__compact-trend {
  font-size: 0.6875rem;
  font-weight: 500;
}

.basil-drilldown__compact-trend--up {
  color: var(--basil-negative);
}

.basil-drilldown__compact-trend--down {
  color: var(--basil-positive);
}

/* Stat cards — collapsible */
.basil-drilldown__stats {
  padding: 0 var(--basil-space-4) var(--basil-space-3);
  max-height: 120px;
  opacity: 1;
  transition: max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease;
}

.basil-drilldown__summary--collapsed .basil-drilldown__stats {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.basil-drilldown__stat-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--basil-space-2);
}

.basil-drilldown__stat-meta {
  font-size: 0.6875rem;
  color: var(--basil-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.basil-drilldown__stat-cards {
  display: flex;
  gap: var(--basil-space-3);
}

.basil-drilldown__stat-card {
  flex: 1;
  background: var(--basil-surface);
  border-radius: var(--basil-radius-sm);
  padding: var(--basil-space-2) var(--basil-space-3);
  border: 1px solid var(--basil-border);
}

.basil-drilldown__stat-label {
  font-size: 0.625rem;
  color: var(--basil-text-muted);
  text-transform: uppercase;
}

.basil-drilldown__stat-value {
  font-family: var(--basil-font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.875rem;
  margin-top: var(--basil-space-1);
  color: var(--basil-text);
}

.basil-drilldown__stat-value--up {
  color: var(--basil-negative);
}

.basil-drilldown__stat-value--down {
  color: var(--basil-positive);
}
```

- [ ] Verify build: `cd frontend && npx vite build`
- [ ] Commit: `git commit -m "feat: collapsing summary header with stat cards and trend comparison"`

---

### Task 4: Fetch previous month data if not cached

**Files:**
- Modify: `frontend/src/views/TransactionDrillDown.vue`

The `prevMonthTotal` computed returns `null` if the previous month isn't in the store cache. In practice BudgetView preloads 3+ months, but if the user navigated directly, we need a fallback.

- [ ] Add a `mounted` hook (or extend it) that checks and fetches:

```js
import { fetchTransactionsForMonth } from '@/api'

// In mounted():
mounted() {
  if (this.month) {
    const prevMonth = dayjs(this.month).subtract(1, 'month').format('YYYY-MM')
    if (!this.$store.state.transactionsByMonth[prevMonth]) {
      fetchTransactionsForMonth(prevMonth).then(result => {
        if (result?.transactions) {
          this.$store.commit('setMonthTransactions', { month: prevMonth, transactions: result.transactions })
        }
      })
    }
  }
},
```

This is fire-and-forget. The `prevMonthTotal` computed will reactively update when the store is populated. Until then, the stat card shows `—`.

- [ ] Verify build: `cd frontend && npx vite build`
- [ ] Commit: `git commit -m "feat: lazy-fetch previous month for trend comparison"`

---

### Task 5: Visual polish and verify

**Files:**
- Modify: `frontend/src/views/TransactionDrillDown.vue` (if needed)

- [ ] Test the full flow: budget → breakdown → drill category → tap PFC chip → verify:
  - Merchant avatars render with correct initials and colors
  - Summary header shows stats (avg, largest, vs prev month)
  - Scrolling down collapses stat cards smoothly into compact bar
  - Scrolling back to top expands stat cards
  - Back button preserves donut state (KeepAlive)
  - Dark mode: all tokens resolve correctly, stat cards readable

- [ ] Test edge cases:
  - PFC code with only 1 transaction (avg = total, largest = total)
  - `__other__` bucket (label shows "Other")
  - No previous month data (trend shows "—")
  - Empty state still works ("No transactions")

- [ ] Measure the sticky `top` value for the summary — it must match the header height. If the header height is different from 53px, adjust `.basil-drilldown__summary { top: Xpx }`. Check by inspecting the rendered `.basil-drilldown__header` element height.

- [ ] Commit any fixes: `git commit -m "fix: drill-down polish adjustments"`
