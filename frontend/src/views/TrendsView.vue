<style>
.basil-trends-wrap {
  max-width: 900px;
  margin: 0 auto;
  padding: 1rem;
}

/* ---- Controls toolbar ---- */
.basil-trends-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

/* ---- Delta badge ---- */
.basil-chart-delta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 0.5rem;
}

.basil-chart-delta__value {
  font-family: var(--basil-font-mono);
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.basil-chart-delta__value--up   { color: var(--basil-positive); }
.basil-chart-delta__value--down { color: var(--basil-negative); }

.basil-chart-delta__context {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
}

/* ---- Chart card ---- */
.basil-chart-card {
  background: var(--basil-surface);
  border-radius: var(--basil-radius-lg);
  box-shadow: var(--basil-shadow-sm);
  padding: var(--basil-space-5);
}

/* ---- Custom HTML legend ---- */
.basil-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: var(--basil-space-4);
  padding-top: var(--basil-space-3);
  border-top: 1px solid var(--basil-border);
}

.basil-chart-legend__item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--basil-text-secondary);
  cursor: default;
}

.basil-chart-legend__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ---- Loading state ---- */
.basil-trends__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}
</style>

<template>
  <div class="basil-trends-wrap">

    <!-- Controls -->
    <div class="basil-trends-controls">
      <q-btn-toggle
        v-model="activeChart"
        :options="[
          { label: 'Spending', value: 'spending' },
          { label: 'Cash Flow', value: 'cashflow' },
          { label: 'Cumulative', value: 'cumulative' },
          { label: 'Savings', value: 'savings' },
        ]"
        dense
        unelevated
        toggle-color="primary"
      />

      <span class="text-body2" style="color: var(--basil-text-muted)">Months:</span>
      <q-btn-toggle
        v-model="monthCount"
        :options="[{ label: '3', value: 3 }, { label: '6', value: 6 }, { label: '12', value: 12 }]"
        dense
        unelevated
        toggle-color="primary"
      />
      <template v-if="activeChart === 'spending'">
        <q-toggle v-model="showIncome" label="Income" dense />
        <q-toggle v-model="showPayments" label="Payments" dense />
      </template>
    </div>

    <div v-if="$store.state.bootstrapping" class="basil-trends__loading">
      <q-spinner-dots size="2rem" color="primary" />
    </div>

    <template v-else-if="activeChartHasData">
      <!-- Delta badge -->
      <div v-if="deltaLabel" class="basil-chart-delta">
        <span
          class="basil-chart-delta__value"
          :class="deltaPositive ? 'basil-chart-delta__value--up' : 'basil-chart-delta__value--down'"
        >{{ deltaLabel }}</span>
        <span class="basil-chart-delta__context">vs {{ previousMonthLabel }}</span>
      </div>

      <!-- Chart -->
      <div class="basil-chart-card">
        <v-chart :key="activeChart" :option="activeChartOption" autoresize style="height: 400px" />

        <!-- Custom HTML legend -->
        <div v-if="htmlLegendItems.length" class="basil-chart-legend">
          <div
            v-for="item in htmlLegendItems"
            :key="item.name"
            class="basil-chart-legend__item"
          >
            <span class="basil-chart-legend__dot" :style="{ background: item.color }"></span>
            {{ item.name }}
          </div>
        </div>
      </div>
    </template>

    <EmptyState
      v-else-if="activeChart === 'savings'"
      icon="savings"
      heading="No savings data yet"
      body="Create a category with type Savings and assign transactions to it."
    />
    <EmptyState
      v-else
      icon="bar_chart"
      heading="No data for this range"
      body="Try a longer time range, or sync more transactions."
    />
  </div>
</template>

<script>
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import dayjs from 'dayjs'
import store from '../store'
import { ensureAppData } from '@/firebase'
import EmptyState from '../components/EmptyState.vue'

use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent, CanvasRenderer])

// Warm/editorial chart palette — 15 distinct colours
const CHART_PALETTE = [
  '#4a8b6c', '#c07a1a', '#2366a8', '#b05a3a', '#7a5ab5',
  '#5a8a4a', '#b54a6a', '#3a8b8b', '#b07040', '#5a6ab5',
  '#8b4a7a', '#3a6b8b', '#8a6a2a', '#3a7a3a', '#a84a4a',
];

const ANIMATION = { animation: true, animationDuration: 800, animationEasing: 'cubicOut' };

export default {
  name: 'TrendsView',
  components: { VChart, EmptyState },

  data() {
    return {
      activeChart: 'spending',
      monthCount: 6,
      showIncome: false,
      showPayments: false,
    };
  },

  computed: {
    monthList() {
      const list = [];
      let d = dayjs().startOf('month');
      for (let i = 0; i < this.monthCount; i++) {
        list.unshift(d.format('MMM YYYY'));
        d = d.subtract(1, 'month');
      }
      return list;
    },

    visibleCategories() {
      return (store.state.categories || []).filter(cat => {
        if (cat.type === 'income' && !this.showIncome) return false;
        if (cat.type === 'payment' && !this.showPayments) return false;
        return true;
      });
    },

    monthlyNet() {
      const transactions = store.state.transactions || [];
      const months = this.monthList;
      const categories = store.state.categories || [];
      const incomeNames = new Set(categories.filter(c => c.type === 'income').map(c => c.category));
      const expenseNames = new Set(categories.filter(c => c.type === 'expense').map(c => c.category));

      return months.map(m => {
        let income = 0, expenses = 0;
        for (const txn of transactions) {
          if (txn.excludeFromTotal) continue;
          if (dayjs(txn.date).format('MMM YYYY') !== m) continue;
          if (incomeNames.has(txn.mappedCategory)) income += Math.abs(txn.amount);
          else if (expenseNames.has(txn.mappedCategory)) expenses += Math.abs(txn.amount);
        }
        return Math.round((income - expenses) * 100) / 100;
      });
    },

    // Spending series with pre-assigned palette colours (shared by chart + legend)
    coloredSpendingSeries() {
      const transactions = store.state.transactions || [];
      const months = this.monthList;

      const bucket = {};
      for (const txn of transactions) {
        if (txn.excludeFromTotal) continue;
        const monthLabel = dayjs(txn.date).format('MMM YYYY');
        if (!months.includes(monthLabel)) continue;
        const key = `${txn.mappedCategory}|${monthLabel}`;
        bucket[key] = (bucket[key] || 0) + Math.abs(txn.amount);
      }

      return this.visibleCategories
        .map((cat, i) => ({
          color: CHART_PALETTE[i % CHART_PALETTE.length],
          name: cat.category,
          type: 'bar',
          stack: 'total',
          emphasis: { focus: 'series' },
          itemStyle: { color: CHART_PALETTE[i % CHART_PALETTE.length] },
          data: months.map(m => Math.round((bucket[`${cat.category}|${m}`] || 0) * 100) / 100),
        }))
        .filter(s => s.data.some(v => v > 0));
    },

    spendingChartOption() {
      return {
        ...ANIMATION,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            let total = 0;
            let html = `<strong>${params[0].axisValue}</strong><br/>`;
            params.forEach(p => {
              if (p.value > 0) {
                html += `${p.marker}${p.seriesName}: $${p.value.toFixed(2)}<br/>`;
                total += p.value;
              }
            });
            html += `<strong>Total: $${total.toFixed(2)}</strong>`;
            return html;
          },
        },
        legend: { show: false },
        grid: { left: '3%', right: '4%', top: '3%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: this.monthList },
        yAxis: { type: 'value', axisLabel: { formatter: val => '$' + val } },
        series: this.coloredSpendingSeries,
      };
    },

    cashFlowChartOption() {
      const months = this.monthList;
      const netValues = this.monthlyNet;

      return {
        ...ANIMATION,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const val = params[0].value;
            const sign = val >= 0 ? '+' : '';
            return `<strong>${params[0].axisValue}</strong><br/>Net: ${sign}$${val.toFixed(2)}`;
          },
        },
        grid: { left: '3%', right: '4%', top: '3%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: months },
        yAxis: { type: 'value', axisLabel: { formatter: val => '$' + val } },
        series: [{
          type: 'bar',
          data: netValues,
          itemStyle: { color: (params) => params.value >= 0 ? '#2d7a4f' : '#b83c2b' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#c8c0b0', type: 'dashed' },
            data: [{ yAxis: 0 }],
            label: { show: false },
          },
        }],
      };
    },

    cumulativeChartOption() {
      const months = this.monthList;
      const netValues = this.monthlyNet;
      let running = 0;
      const cumulativeValues = netValues.map(v => {
        running += v;
        return Math.round(running * 100) / 100;
      });
      const min = Math.min(...cumulativeValues, 0);
      const max = Math.max(...cumulativeValues, 0);

      return {
        ...ANIMATION,
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const val = params[0].value;
            const sign = val >= 0 ? '+' : '';
            return `<strong>${params[0].axisValue}</strong><br/>Cumulative: ${sign}$${val.toFixed(2)}`;
          },
        },
        visualMap: [{
          show: false,
          type: 'continuous',
          seriesIndex: 0,
          min,
          max,
          inRange: { color: min < 0 ? ['#b83c2b', '#c8c0b0', '#2d7a4f'] : ['#2d7a4f'] },
        }],
        grid: { left: '3%', right: '4%', top: '3%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: months },
        yAxis: { type: 'value', axisLabel: { formatter: val => '$' + val } },
        series: [{
          type: 'line',
          data: cumulativeValues,
          smooth: true,
          areaStyle: { opacity: 0.15 },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#c8c0b0', type: 'dashed' },
            data: [{ yAxis: 0 }],
            label: { show: false },
          },
        }],
      };
    },

    savingsChartOption() {
      const transactions = store.state.transactions || [];
      const months = this.monthList;
      const categories = store.state.categories || [];
      const savingsNames = new Set(categories.filter(c => c.type === 'savings').map(c => c.category));
      const incomeNames = new Set(categories.filter(c => c.type === 'income').map(c => c.category));

      const savingsData = [];
      const rateData = [];

      for (const m of months) {
        let savings = 0, income = 0;
        for (const txn of transactions) {
          if (txn.excludeFromTotal) continue;
          if (dayjs(txn.date).format('MMM YYYY') !== m) continue;
          if (savingsNames.has(txn.mappedCategory)) savings += Math.abs(txn.amount);
          if (incomeNames.has(txn.mappedCategory)) income += Math.abs(txn.amount);
        }
        savingsData.push(Math.round(savings * 100) / 100);
        rateData.push(income > 0 ? Math.round((savings / income) * 1000) / 10 : 0);
      }

      return {
        ...ANIMATION,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter: (params) => {
            let html = `<strong>${params[0].axisValue}</strong><br/>`;
            params.forEach(p => {
              if (p.seriesName === 'Saved') html += `${p.marker}Saved: $${Number(p.value).toFixed(2)}<br/>`;
              else html += `${p.marker}Rate: ${p.value}%<br/>`;
            });
            return html;
          },
        },
        legend: { show: false, data: ['Saved', 'Rate'] },
        grid: { left: '3%', right: '8%', top: '5%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: months },
        yAxis: [
          { type: 'value', axisLabel: { formatter: val => '$' + val } },
          { type: 'value', min: 0, max: 100, axisLabel: { formatter: val => val + '%' } },
        ],
        series: [
          {
            name: 'Saved',
            type: 'bar',
            yAxisIndex: 0,
            data: savingsData,
            itemStyle: { color: '#2d7a4f' },
          },
          {
            name: 'Rate',
            type: 'line',
            yAxisIndex: 1,
            data: rateData,
            smooth: true,
            lineStyle: { color: '#2366a8' },
            itemStyle: { color: '#2366a8' },
          },
        ],
      };
    },

    activeChartOption() {
      if (this.activeChart === 'cashflow') return this.cashFlowChartOption;
      if (this.activeChart === 'cumulative') return this.cumulativeChartOption;
      if (this.activeChart === 'savings') return this.savingsChartOption;
      return this.spendingChartOption;
    },

    activeChartHasData() {
      if (this.activeChart === 'spending') return this.coloredSpendingSeries.length > 0;
      if (this.activeChart === 'savings') return this.savingsChartOption.series[0].data.some(v => v > 0);
      return this.monthlyNet.some(v => v !== 0);
    },

    // HTML legend items (spending and savings only)
    htmlLegendItems() {
      if (this.activeChart === 'spending') {
        return this.coloredSpendingSeries.map(s => ({ name: s.name, color: s.color }));
      }
      if (this.activeChart === 'savings') {
        return [
          { name: 'Saved', color: '#2d7a4f' },
          { name: 'Rate', color: '#2366a8' },
        ];
      }
      return [];
    },

    // Period-over-period delta
    monthDelta() {
      const months = this.monthList;
      if (months.length < 2) return null;
      const cur = months[months.length - 1];
      const prev = months[months.length - 2];

      if (this.activeChart === 'spending') {
        const txns = store.state.transactions || [];
        const catSet = new Set(this.visibleCategories.map(c => c.category));
        const sum = m => txns
          .filter(t => !t.excludeFromTotal && dayjs(t.date).format('MMM YYYY') === m && catSet.has(t.mappedCategory))
          .reduce((acc, t) => acc + Math.abs(t.amount), 0);
        return { current: sum(cur), prev: sum(prev) };
      }
      if (this.activeChart === 'cashflow' || this.activeChart === 'cumulative') {
        const nets = this.monthlyNet;
        return { current: nets[nets.length - 1], prev: nets[nets.length - 2] };
      }
      if (this.activeChart === 'savings') {
        const s = this.savingsChartOption.series[0].data;
        return { current: s[s.length - 1], prev: s[s.length - 2] };
      }
      return null;
    },

    deltaLabel() {
      const d = this.monthDelta;
      if (!d || d.prev === 0) return null;
      const pct = Math.round(((d.current - d.prev) / Math.abs(d.prev)) * 100);
      return `${pct >= 0 ? '+' : ''}${pct}%`;
    },

    // True = green (good), False = red (bad)
    deltaPositive() {
      const d = this.monthDelta;
      if (!d) return true;
      // Spending: lower is better; everything else: higher is better
      return this.activeChart === 'spending' ? d.current <= d.prev : d.current >= d.prev;
    },

    previousMonthLabel() {
      const months = this.monthList;
      return months.length >= 2 ? months[months.length - 2] : '';
    },
  },

  async mounted() {
    await ensureAppData(store);
  },
};
</script>
