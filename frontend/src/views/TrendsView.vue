<template>
  <div class="q-pa-md">
    <div class="row items-center q-gutter-md q-mb-md">
      <span class="text-body2 text-grey-7">Months:</span>
      <q-btn-toggle
        v-model="monthCount"
        :options="[{ label: '3', value: 3 }, { label: '6', value: 6 }, { label: '12', value: 12 }]"
        dense
        unelevated
        toggle-color="primary"
      />
      <q-toggle v-model="showIncome" label="Income" dense />
      <q-toggle v-model="showPayments" label="Payments" dense />
    </div>

    <div v-if="hasData">
      <v-chart :option="chartOption" autoresize style="height: 420px" />
    </div>
    <div v-else class="text-grey-6 text-center q-mt-xl">
      No transaction data available for this range.
    </div>
  </div>
</template>

<script>
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import dayjs from 'dayjs'
import store from '../store'

use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export default {
  name: 'TrendsView',
  components: { VChart },

  data() {
    return {
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

    chartOption() {
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
        yAxis: {
          type: 'value',
          axisLabel: { formatter: val => '$' + val },
        },
        series,
      };
    },

    hasData() {
      return this.chartOption.series.length > 0;
    },
  },
};
</script>
