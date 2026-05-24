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
        <span class="basil-breakdown__trigger-label">Spending breakdown</span>
      </div>
      <BasilIcon :name="expanded ? 'expand_less' : 'chevron_right'" size="18px" class="basil-breakdown__chevron" />
    </div>

    <!-- Expanded breakdown -->
    <Transition name="basil-breakdown">
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
        @click="onChartClick"
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
      <div class="basil-breakdown__chips" :key="mode + (drillCategory || '')">
        <span
          v-for="chip in chips"
          :key="chip.label"
          class="basil-breakdown__chip"
          :class="{ 'basil-breakdown__chip--tappable': true }"
          @click="onChipClick(chip)"
        >
          <span class="basil-breakdown__chip-dot" :style="{ background: chip.color }"></span>
          {{ chip.label }} ${{ formatDollar(chip.total) }}
          <span class="basil-breakdown__chip-chevron">›</span>
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
    </Transition>
  </div>
</template>

<script>
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, GraphicComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { CHART_PALETTE, CHART_ANIMATION } from '@/utils/chartConstants'
import { CATEGORY_TYPES } from '../../../shared/categoryTypes'
import { formatDollar } from '@/utils/formatDollar'

use([PieChart, TooltipComponent, GraphicComponent, CanvasRenderer])

const OTHER_THRESHOLD = 0.02 // 2% collapse

export default {
  name: 'SpendingBreakdown',
  components: { VChart },
  props: {
    transactions: { type: Array, required: true },
    categories: { type: Array, required: true },
    month: { type: String, default: '' },
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
          .filter(c => c.type === CATEGORY_TYPES.EXPENSE)
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
      return this._buildBreakdown(this.expenseTransactions, t => t.mappedCategory, label => label, false)
    },

    detailBreakdown() {
      return this._buildBreakdown(this.expenseTransactions, t => t.merchant_name || '__other__', key =>
        key === '__other__' ? 'Other spending' : key
      )
    },

    otherCategories() {
      // Categories that were collapsed into the "Other" bucket
      const total = this.totalSpent
      if (total === 0) return []
      const groups = {}
      for (const t of this.expenseTransactions) {
        const key = t.mappedCategory
        if (!groups[key]) groups[key] = 0
        groups[key] += Math.abs(t.amount)
      }
      return Object.entries(groups)
        .filter(([, amt]) => amt / total < 0.02)
        .map(([key]) => key)
    },

    drillBreakdown() {
      if (!this.drillCategory) return []
      let filtered
      if (this.drillCategory === '__other__') {
        const otherSet = new Set(this.otherCategories)
        filtered = this.expenseTransactions.filter(t => otherSet.has(t.mappedCategory))
      } else {
        filtered = this.expenseTransactions.filter(t => t.mappedCategory === this.drillCategory)
      }
      return this._buildBreakdown(filtered, t => t.merchant_name || '__other__', key =>
        key === '__other__' ? 'Other' : key
      )
    },

    activeBreakdown() {
      if (this.mode === 'detail-all') return this.detailBreakdown
      if (this.mode === 'detail-single') return this.drillBreakdown
      return this.categoryBreakdown
    },

    centerLabel() {
      if (this.mode === 'detail-single' && this.drillCategory) {
        let filtered
        if (this.drillCategory === '__other__') {
          const otherSet = new Set(this.otherCategories)
          filtered = this.expenseTransactions.filter(t => otherSet.has(t.mappedCategory))
        } else {
          filtered = this.expenseTransactions.filter(t => t.mappedCategory === this.drillCategory)
        }
        const catTotal = filtered.reduce((sum, t) => sum + Math.abs(t.amount), 0)
        const label = this.drillCategory === '__other__' ? 'Other' : this.drillCategory
        return { amount: `$${formatDollar(catTotal)}`, sub: label }
      }
      return { amount: `$${formatDollar(this.totalSpent)}`, sub: 'spent' }
    },

    chartOption() {
      const slices = this.activeBreakdown
      if (!slices.length) return {}

      const isDark = this.$store.state.theme === 'dark'
      const surfaceColor = isDark ? '#181c24' : '#ffffff'
      const textColor = isDark ? '#f0ece6' : '#2a2a2a'
      const textMutedColor = isDark ? '#9a9590' : '#888888'

      return {
        ...CHART_ANIMATION,
        series: [{
          type: 'pie',
          radius: ['54%', '72%'],
          center: ['50%', '50%'],
          minAngle: 8,
          padAngle: 3,
          itemStyle: { borderColor: surfaceColor, borderWidth: 3 },
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
            fill: textColor,
          },
        }, {
          type: 'text',
          left: 'center',
          top: '54%',
          style: {
            text: this.centerLabel.sub,
            textAlign: 'center',
            fontSize: 11,
            fill: textMutedColor,
          },
        }],
        tooltip: {
          trigger: 'item',
          confine: true,
          formatter: p => {
            if (!p.name || isNaN(p.value)) return ''
            return `${p.name}: $${Math.round(p.value).toLocaleString()} (${p.percent}%)`
          },
        },
      }
    },

    chips() {
      return this.activeBreakdown.map((s, i) => ({
        label: s.label,
        total: s.total,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        categoryName: s.key,
      }))
    },

    budgetCTA() {
      if (this.mode !== 'detail-single' || !this.drillCategory) return false
      const cat = (this.categories || []).find(c => c.category === this.drillCategory)
      return cat && !cat.monthly_limit
    },
  },

  methods: {
    formatDollar,
    onChipClick(chip) {
      if (this.mode === 'category') {
        this.drillInto(chip.categoryName)
      } else if (this.mode === 'detail-single') {
        this.$router.push({
          path: '/budget/transactions',
          query: {
            merchant: chip.categoryName,
            month: this.month,
            category: this.drillCategory,
          },
        })
      } else if (this.mode === 'detail-all') {
        this.$router.push({
          path: '/budget/transactions',
          query: {
            merchant: chip.categoryName,
            month: this.month,
          },
        })
      }
    },

    drillInto(categoryName) {
      if (!categoryName) return
      this.drillCategory = categoryName
      this.mode = 'detail-single'
    },

    backToCategories() {
      this.drillCategory = null
      this.mode = 'category'
    },

    onChartClick(params) {
      if (!params.name) return
      if ('ontouchstart' in window) return // touch devices use chips for navigation
      const chip = this.chips.find(c => c.label === params.name)
      if (chip) this.onChipClick(chip)
    },

    _buildBreakdown(txns, keyFn, labelFn, collapseSmall = true) {
      const groups = {}
      for (const t of txns) {
        const key = keyFn(t)
        if (!groups[key]) groups[key] = { key, total: 0 }
        groups[key].total += Math.abs(t.amount)
      }

      const sorted = Object.values(groups).sort((a, b) => b.total - a.total)
      const total = sorted.reduce((s, g) => s + g.total, 0)
      if (total === 0) return []

      if (!collapseSmall) {
        return sorted.map(g => ({ key: g.key, label: labelFn(g.key), total: g.total }))
      }

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
  height: 280px;
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

.basil-breakdown__chip-chevron {
  color: var(--basil-text-muted);
  font-size: 0.8125rem;
  margin-left: 1px;
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

.basil-breakdown-enter-active {
  animation: breakdownExpand 300ms ease-out;
}

.basil-breakdown-leave-active {
  animation: breakdownExpand 200ms ease-in reverse;
}

@keyframes breakdownExpand {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
