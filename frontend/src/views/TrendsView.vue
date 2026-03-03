<template>
  <div class="q-pa-md">
    <div class="row items-center q-gutter-md q-mb-md wrap">
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

      <span class="text-body2 text-grey-7">Months:</span>
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

    <div v-if="activeChartHasData">
      <v-chart :option="activeChartOption" autoresize style="height: 420px" />
    </div>
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
import EmptyState from '../components/EmptyState.vue'

use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent, CanvasRenderer])

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

    spendingChartOption() {
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

      const series = this.visibleCategories
        .map(cat => ({
          name: cat.category,
          type: 'bar',
          stack: 'total',
          emphasis: { focus: 'series' },
          data: months.map(m =>
            Math.round((bucket[`${cat.category}|${m}`] || 0) * 100) / 100
          ),
        }))
        .filter(s => s.data.some(v => v > 0));

      return {
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
        legend: { type: 'scroll', bottom: 0 },
        grid: { left: '3%', right: '4%', top: '3%', bottom: '60px', containLabel: true },
        xAxis: { type: 'category', data: months },
        yAxis: { type: 'value', axisLabel: { formatter: val => '$' + val } },
        series,
      };
    },

    cashFlowChartOption() {
      const months = this.monthList;
      const netValues = this.monthlyNet;

      return {
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
          itemStyle: { color: (params) => params.value >= 0 ? '#3ba272' : '#ee6666' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#aaa', type: 'dashed' },
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
          inRange: { color: min < 0 ? ['#ee6666', '#aaaaaa', '#3ba272'] : ['#3ba272'] },
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
            lineStyle: { color: '#aaa', type: 'dashed' },
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
        legend: { data: ['Saved', 'Rate'], bottom: 0 },
        grid: { left: '3%', right: '8%', top: '5%', bottom: '50px', containLabel: true },
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
            itemStyle: { color: '#3ba272' },
          },
          {
            name: 'Rate',
            type: 'line',
            yAxisIndex: 1,
            data: rateData,
            smooth: true,
            lineStyle: { color: '#5470c6' },
            itemStyle: { color: '#5470c6' },
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
      if (this.activeChart === 'spending') return this.spendingChartOption.series.length > 0;
      if (this.activeChart === 'savings') return this.savingsChartOption.series[0].data.some(v => v > 0);
      return this.monthlyNet.some(v => v !== 0);
    },
  },
};
</script>
