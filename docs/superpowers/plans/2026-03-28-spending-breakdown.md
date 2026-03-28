# Spending Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable spending breakdown donut chart inside the BudgetView hero card, showing spending by Basil category with drill-down into PFC detail codes and a budget setup CTA.

**Architecture:** A self-contained `SpendingBreakdown.vue` component owns the chart, legend chips, toggle, and drill-down state. BudgetView drops it into the hero card and handles the `edit-category` emit. Chart constants extracted from TrendsView into a shared `chartConstants.js`.

**Tech Stack:** Vue 3 Options API, ECharts (PieChart), Basil component library (BasilToggle, BasilIcon), existing `humanizeDetailedPfc()` utility.

**Spec:** `docs/superpowers/specs/2026-03-28-spending-breakdown-design.md`

---

### Task 1: Extract chart constants to shared module

**Files:**
- Create: `frontend/src/utils/chartConstants.js`
- Modify: `frontend/src/views/TrendsView.vue:193-199`

- [ ] **Step 1: Create the shared constants file**

```js
// frontend/src/utils/chartConstants.js

/** Warm/editorial chart palette — 15 distinct colours, cycled via index % length. */
export const CHART_PALETTE = [
  '#4a8b6c', '#c07a1a', '#2366a8', '#b05a3a', '#7a5ab5',
  '#5a8a4a', '#b54a6a', '#3a8b8b', '#b07040', '#5a6ab5',
  '#8b4a7a', '#3a6b8b', '#8a6a2a', '#3a7a3a', '#a84a4a',
]

/** Shared ECharts animation config. */
export const CHART_ANIMATION = {
  animation: true,
  animationDuration: 800,
  animationEasing: 'cubicOut',
}
```

- [ ] **Step 2: Update TrendsView to import from shared module**

In `frontend/src/views/TrendsView.vue`, replace lines 192-199:

```js
// Remove these lines:
// const CHART_PALETTE = [...]
// const ANIMATION = { ... }

// Add this import near the top with other imports:
import { CHART_PALETTE, CHART_ANIMATION } from '@/utils/chartConstants'
```

Then find-and-replace all references to `ANIMATION` → `CHART_ANIMATION` in TrendsView. There should be ~4 references (one per chart option computed: spending, cashFlow, cumulative, savings).

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build`
Expected: Clean build, no errors.

- [ ] **Step 4: Verify TrendsView still works**

Open TrendsView in browser, confirm all 4 chart types render correctly with animations.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/chartConstants.js frontend/src/views/TrendsView.vue
git commit -m "refactor: extract chart constants to shared module"
```

---

### Task 2: Create SpendingBreakdown component — category donut

**Files:**
- Create: `frontend/src/components/SpendingBreakdown.vue`

This task builds the component with the collapsed trigger, expanded category donut, and chip legend. No drill-down or toggle yet.

- [ ] **Step 1: Register PieChart and create the component**

```vue
<!-- frontend/src/components/SpendingBreakdown.vue -->
<template>
  <div class="basil-breakdown">
    <!-- Collapsed trigger -->
    <div class="basil-breakdown__trigger" @click="expanded = !expanded">
      <div class="basil-breakdown__trigger-left">
        <svg class="basil-breakdown__mini-donut" width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="6" fill="none" stroke-width="3"
            stroke="var(--basil-green)" stroke-dasharray="12 38" stroke-dashoffset="0"
            style="transform: rotate(-90deg); transform-origin: center;" />
          <circle cx="9" cy="9" r="6" fill="none" stroke-width="3"
            stroke="var(--basil-text-muted)" stroke-dasharray="8 38" stroke-dashoffset="-12"
            style="transform: rotate(-90deg); transform-origin: center;" />
          <circle cx="9" cy="9" r="6" fill="none" stroke-width="3"
            stroke="var(--basil-border)" stroke-dasharray="18 38" stroke-dashoffset="-20"
            style="transform: rotate(-90deg); transform-origin: center;" />
        </svg>
        <span class="basil-breakdown__trigger-label">Where's my spending?</span>
      </div>
      <BasilIcon :name="expanded ? 'expand_less' : 'chevron_right'" size="18px" class="basil-breakdown__chevron" />
    </div>

    <!-- Expanded breakdown -->
    <div v-if="expanded" class="basil-breakdown__body">
      <!-- Back link (drill-down only) -->
      <div v-if="mode === 'detail-single'" class="basil-breakdown__back" @click="backToCategories">
        ← All categories
      </div>

      <!-- Donut chart -->
      <v-chart
        ref="chart"
        class="basil-breakdown__chart"
        :option="chartOption"
        autoresize
      />

      <!-- Detailed view toggle (hidden during drill-down) -->
      <div v-if="mode !== 'detail-single'" class="basil-breakdown__toggle">
        <BasilToggle
          :model-value="mode === 'detail-all'"
          @update:model-value="mode = $event ? 'detail-all' : 'category'"
          label="Detailed view"
          dense
        />
      </div>

      <!-- Chip legend -->
      <div class="basil-breakdown__chips">
        <span
          v-for="chip in chips"
          :key="chip.label"
          class="basil-breakdown__chip"
          :class="{ 'basil-breakdown__chip--tappable': mode === 'category' }"
          @click="mode === 'category' ? drillInto(chip.categoryName) : null"
        >
          <span class="basil-breakdown__chip-dot" :style="{ background: chip.color }"></span>
          {{ chip.label }} ${{ Math.round(chip.total).toLocaleString() }}
        </span>
      </div>

      <!-- Hint -->
      <div v-if="mode === 'category'" class="basil-breakdown__hint">
        Tap a category for details
      </div>

      <!-- Budget CTA -->
      <div v-if="budgetCTA" class="basil-breakdown__cta" @click="$emit('edit-category', drillCategory)">
        Set a limit for {{ drillCategory }} →
      </div>
    </div>
  </div>
</template>

<script>
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, GraphicComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { CHART_PALETTE, CHART_ANIMATION } from '@/utils/chartConstants'
import { humanizeDetailedPfc } from '@/utils/pfcLabels'

use([PieChart, TooltipComponent, GraphicComponent, CanvasRenderer])

const OTHER_THRESHOLD = 0.02 // 2% collapse

export default {
  name: 'SpendingBreakdown',
  components: { VChart },
  props: {
    transactions: { type: Array, required: true },
    categories: { type: Array, required: true },
  },
  emits: ['edit-category'],

  data() {
    return {
      expanded: false,
      mode: 'category', // 'category' | 'detail-all' | 'detail-single'
      drillCategory: null,
    }
  },

  computed: {
    expenseNames() {
      return new Set(
        (this.categories || [])
          .filter(c => c.type === 'expense')
          .map(c => c.category)
      )
    },

    expenseTransactions() {
      return (this.transactions || []).filter(
        t => this.expenseNames.has(t.mappedCategory) && !t.excludeFromTotal
      )
    },

    totalSpent() {
      return this.expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
    },

    categoryBreakdown() {
      return this._buildBreakdown(this.expenseTransactions, t => t.mappedCategory, label => label)
    },

    detailBreakdown() {
      return this._buildBreakdown(this.expenseTransactions, t => t.plaidPfcDetail || '__other__', code =>
        code === '__other__' ? 'Other spending' : humanizeDetailedPfc(code)
      )
    },

    drillBreakdown() {
      if (!this.drillCategory) return []
      const filtered = this.expenseTransactions.filter(t => t.mappedCategory === this.drillCategory)
      return this._buildBreakdown(filtered, t => t.plaidPfcDetail || '__other__', code =>
        code === '__other__' ? 'Other' : humanizeDetailedPfc(code)
      )
    },

    activeBreakdown() {
      if (this.mode === 'detail-all') return this.detailBreakdown
      if (this.mode === 'detail-single') return this.drillBreakdown
      return this.categoryBreakdown
    },

    centerLabel() {
      if (this.mode === 'detail-single' && this.drillCategory) {
        const catTotal = this.expenseTransactions
          .filter(t => t.mappedCategory === this.drillCategory)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0)
        return { amount: `$${Math.round(catTotal).toLocaleString()}`, sub: this.drillCategory }
      }
      return { amount: `$${Math.round(this.totalSpent).toLocaleString()}`, sub: 'spent' }
    },

    chartOption() {
      const slices = this.activeBreakdown
      if (!slices.length) return {}

      return {
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
          top: '42%',
          style: {
            text: this.centerLabel.amount,
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 500,
            fill: 'var(--basil-text)',
          },
        }, {
          type: 'text',
          left: 'center',
          top: '54%',
          style: {
            text: this.centerLabel.sub,
            textAlign: 'center',
            fontSize: 11,
            fill: 'var(--basil-text-muted)',
          },
        }],
        tooltip: {
          trigger: 'item',
          formatter: p => `${p.name}: $${Math.round(p.value).toLocaleString()} (${p.percent}%)`,
        },
      }
    },

    chips() {
      return this.activeBreakdown.map((s, i) => ({
        label: s.label,
        total: s.total,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        categoryName: s.key, // original key before label mapping
      }))
    },

    budgetCTA() {
      if (this.mode !== 'detail-single' || !this.drillCategory) return false
      const cat = (this.categories || []).find(c => c.category === this.drillCategory)
      return cat && !cat.monthly_limit
    },
  },

  methods: {
    drillInto(categoryName) {
      if (!categoryName) return
      this.drillCategory = categoryName
      this.mode = 'detail-single'
    },

    backToCategories() {
      this.drillCategory = null
      this.mode = 'category'
    },

    _buildBreakdown(txns, keyFn, labelFn) {
      const groups = {}
      for (const t of txns) {
        const key = keyFn(t)
        if (!groups[key]) groups[key] = { key, total: 0 }
        groups[key].total += Math.abs(t.amount)
      }

      const sorted = Object.values(groups).sort((a, b) => b.total - a.total)
      const total = sorted.reduce((s, g) => s + g.total, 0)
      if (total === 0) return []

      const result = []
      let otherTotal = 0
      for (const g of sorted) {
        if (g.total / total < OTHER_THRESHOLD) {
          otherTotal += g.total
        } else {
          result.push({ key: g.key, label: labelFn(g.key), total: g.total })
        }
      }
      if (otherTotal > 0) {
        result.push({ key: '__other__', label: 'Other', total: otherTotal })
      }
      return result
    },
  },
}
</script>

<style scoped>
.basil-breakdown__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding-top: var(--basil-space-2);
  -webkit-tap-highlight-color: transparent;
}

.basil-breakdown__trigger-left {
  display: flex;
  align-items: center;
  gap: var(--basil-space-2);
}

.basil-breakdown__trigger-label {
  font-size: 0.875rem;
  color: var(--basil-text-secondary);
}

.basil-breakdown__chevron {
  color: var(--basil-text-muted);
}

.basil-breakdown__body {
  padding-top: var(--basil-space-3);
}

.basil-breakdown__back {
  font-size: 0.8125rem;
  color: var(--basil-green);
  cursor: pointer;
  margin-bottom: var(--basil-space-2);
  -webkit-tap-highlight-color: transparent;
}

.basil-breakdown__chart {
  width: 100%;
  height: 200px;
}

.basil-breakdown__toggle {
  display: flex;
  justify-content: center;
  margin: var(--basil-space-2) 0;
}

.basil-breakdown__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.basil-breakdown__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--basil-text-secondary);
  padding: 4px 10px;
  background: var(--basil-surface-alt);
  border-radius: var(--basil-radius-pill);
  -webkit-tap-highlight-color: transparent;
}

.basil-breakdown__chip--tappable {
  cursor: pointer;
}

.basil-breakdown__chip--tappable:active {
  background: var(--basil-border);
}

.basil-breakdown__chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.basil-breakdown__hint {
  text-align: center;
  font-size: 0.6875rem;
  color: var(--basil-text-muted);
  margin-top: var(--basil-space-2);
}

.basil-breakdown__cta {
  text-align: center;
  font-size: 0.8125rem;
  color: var(--basil-green);
  font-weight: 500;
  cursor: pointer;
  margin-top: var(--basil-space-3);
  padding: var(--basil-space-2);
  -webkit-tap-highlight-color: transparent;
}
</style>
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx vite build`
Expected: Clean build. Component isn't rendered yet (no consumer), but it compiles.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SpendingBreakdown.vue
git commit -m "feat: SpendingBreakdown component with category donut, drill-down, and toggle"
```

---

### Task 3: Integrate into BudgetView hero card

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`

- [ ] **Step 1: Import the component**

In BudgetView.vue, add to the imports section (around line 930):

```js
import SpendingBreakdown from '@/components/SpendingBreakdown.vue'
```

Add to the `components` registration (around line 950):

```js
components: { ..., SpendingBreakdown },
```

- [ ] **Step 2: Add to the hero card template**

In BudgetView.vue, find the closing `</template>` tag of the hero card (line 96: `</template>`) just before the `</div>` and `</BasilCard>` at lines 97-98. Add the breakdown component before the card closes:

```html
            <!-- Spending breakdown (inside hero card, after all stat rows) -->
            <div v-if="expenseTransactions.length > 0" class="basil-card-rule"></div>
            <SpendingBreakdown
              v-if="expenseTransactions.length > 0"
              :transactions="expenseTransactions"
              :categories="store.state.categories || []"
              @edit-category="openEditCategoryFromBreakdown"
            />
```

Insert this just before the closing `</div>` of `.basil-card__body` (line 97), after BOTH the `incomeState === 'none'` template and the `v-else` template. It needs to be outside those conditional blocks but inside the card body.

- [ ] **Step 3: Add the expenseTransactions computed and handler method**

In BudgetView's `computed` section, add:

```js
    expenseTransactions() {
      const expenseNames = new Set(
        (store.state.categories || [])
          .filter(c => c.type === 'expense')
          .map(c => c.category)
      )
      return (this.transactions || []).filter(
        t => expenseNames.has(t.mappedCategory) && !t.excludeFromTotal
      )
    },
```

In BudgetView's `methods` section, add:

```js
    openEditCategoryFromBreakdown(categoryName) {
      if (this.groupedTransactions[categoryName]) {
        this.buildEditCategoryDialog(categoryName)
      }
    },
```

- [ ] **Step 4: Verify build and test**

Run: `cd frontend && npx vite build`
Expected: Clean build.

Open BudgetView in browser. The hero card should now show "Where's my spending?" trigger row below the budget stats. Tap to expand — donut chart with category breakdown. Tap a chip to drill down. Toggle "Detailed view" for all PFC codes.

- [ ] **Step 5: Test drill-down budget CTA**

Drill into a category that has no `monthly_limit`. The "Set a limit for X →" CTA should appear. Tap it — should open the Edit Category dialog for that category.

- [ ] **Step 6: Test empty state**

If `expenseTransactions` is empty (e.g., future month with no data), the breakdown section should not appear at all (controlled by the `v-if`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat: integrate SpendingBreakdown into BudgetView hero card"
```

---

### Task 4: Dark mode and visual polish

**Files:**
- Modify: `frontend/src/components/SpendingBreakdown.vue`

- [ ] **Step 1: Verify dark mode**

Toggle dark mode in the app. Check:
- Chart center label text uses `--basil-text` (should adapt automatically via the `fill` property)
- Chip backgrounds use `--basil-surface-alt` (adapts)
- Trigger text uses `--basil-text-secondary` (adapts)
- Donut slice colors from `CHART_PALETTE` are visible against dark background

If the ECharts `graphic` text elements don't pick up CSS variables (ECharts renders to canvas, not DOM), replace the `fill` values with resolved colors:

```js
// In the chartOption computed, detect dark mode and use explicit colors:
const isDark = document.documentElement.classList.contains('basil-dark')
// Then use isDark ? '#e5e0d8' : '#333' for text fills
```

- [ ] **Step 2: Test expand/collapse animation**

Verify the breakdown section expands and collapses smoothly. If it pops in/out without animation, add a CSS transition. Wrap the body in a `<Transition>` or use `max-height` transition:

```css
.basil-breakdown__body {
  overflow: hidden;
  animation: breakdownExpand 300ms ease-out;
}

@keyframes breakdownExpand {
  from { opacity: 0; max-height: 0; }
  to { opacity: 1; max-height: 500px; }
}
```

- [ ] **Step 3: Test chip crossfade on mode switch**

When switching between category → detail-all → detail-single, chips should transition. Add:

```css
.basil-breakdown__chips {
  transition: opacity 200ms ease;
}
```

And use a `:key` on the chip container tied to the mode:

```html
<div class="basil-breakdown__chips" :key="mode + (drillCategory || '')">
```

Vue's `<TransitionGroup>` or a simple key swap triggers the re-render with opacity transition.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SpendingBreakdown.vue
git commit -m "fix: dark mode support and expand/collapse animation for breakdown"
```

---

### Task 5: Final testing and cleanup

**Files:**
- Possibly modify: `frontend/src/components/SpendingBreakdown.vue`, `frontend/src/views/BudgetView.vue`

- [ ] **Step 1: Full regression test**

Test all of these:
- [ ] Expand/collapse toggles breakdown visibility
- [ ] Category donut totals match the hero "spent" number
- [ ] Drill-down into a category shows correct PFC items
- [ ] "Other" bucket aggregates slices under 2%
- [ ] Toggle switches between category and all-detail view
- [ ] Budget CTA appears only for categories without `monthly_limit`
- [ ] Budget CTA opens Edit Category dialog with correct category
- [ ] Dark mode: chart, chips, labels all render correctly
- [ ] Empty state: no breakdown row when no expense transactions
- [ ] Desktop: breakdown works (inline expand, no layout issues)
- [ ] Mobile: breakdown works, chips are tappable, donut fits

- [ ] **Step 2: Verify TrendsView not regressed**

Open TrendsView, confirm all 4 chart types still work after the `CHART_ANIMATION` rename.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: spending breakdown polish and regression fixes"
```

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/utils/chartConstants.js` | Create | Shared `CHART_PALETTE` + `CHART_ANIMATION` |
| `frontend/src/views/TrendsView.vue` | Modify | Import from `chartConstants.js` instead of inline |
| `frontend/src/components/SpendingBreakdown.vue` | Create | Donut chart, chips, toggle, drill-down, CTA |
| `frontend/src/views/BudgetView.vue` | Modify | Drop in `<SpendingBreakdown>`, add computed + handler |
