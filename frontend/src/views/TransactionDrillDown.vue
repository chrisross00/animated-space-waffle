<template>
  <div class="basil-drilldown">
    <div class="basil-drilldown__header">
      <button class="basil-drilldown__back" @click="$router.back()" aria-label="Back">
        <BasilIcon name="arrow_back" size="20px" />
      </button>
      <div class="basil-drilldown__title">
        <span class="basil-drilldown__label">{{ merchantLabel }}</span>
        <span class="basil-drilldown__separator">·</span>
        <span class="basil-drilldown__amount">${{ formatDollar(total) }}</span>
      </div>
    </div>

    <div v-if="filteredTransactions.length === 0" class="basil-drilldown__empty">
      No transactions
    </div>

    <div v-else ref="list" class="basil-drilldown__list" @scroll.passive="_onScroll">
      <!-- Stat cards — scroll naturally, fade as they leave -->
      <div ref="stats" class="basil-drilldown__stats">
        <div class="basil-drilldown__stat-row">
          <span class="basil-drilldown__stat-meta">{{ monthLabel.toUpperCase() }}</span>
          <span class="basil-drilldown__stat-meta">{{ count }} transactions</span>
        </div>
        <div class="basil-drilldown__stat-cards">
          <div class="basil-drilldown__stat-card">
            <div class="basil-drilldown__stat-label">Avg</div>
            <div class="basil-drilldown__stat-value">${{ formatDollar(avgAmount) }}</div>
          </div>
          <div class="basil-drilldown__stat-card">
            <div class="basil-drilldown__stat-label">Largest</div>
            <div class="basil-drilldown__stat-value">${{ formatDollar(largestAmount) }}</div>
          </div>
          <div class="basil-drilldown__stat-card">
            <div class="basil-drilldown__stat-label">vs {{ prevMonthLabel }}</div>
            <div class="basil-drilldown__stat-value" :class="trendDelta > 0 ? 'basil-drilldown__stat-value--up' : trendDelta < 0 ? 'basil-drilldown__stat-value--down' : ''">
              {{ trendDelta === null ? '—' : formatSignedDollar(trendDelta).text }}
            </div>
          </div>
        </div>
      </div>

      <!-- Compact bar — sticks to top when stats scroll away -->
      <div class="basil-drilldown__compact">
        <span class="basil-drilldown__compact-left">{{ count }} transactions · {{ monthLabel }}</span>
        <span v-if="trendDisplay" class="basil-drilldown__compact-trend" :class="trendDisplay.isIncrease ? 'basil-drilldown__compact-trend--up' : 'basil-drilldown__compact-trend--down'">
          {{ trendDisplay.text }}
        </span>
      </div>
      <div
        v-for="txn in filteredTransactions"
        :key="txn.transaction_id"
        class="basil-drilldown__row"
      >
        <!-- Brand logo avatar -->
        <div v-if="merchantLogo(txn)" class="basil-drilldown__avatar basil-drilldown__avatar--logo" :style="{ background: merchantLogo(txn).color }">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff" v-html="merchantLogo(txn).paths"></svg>
        </div>
        <!-- Standard initials avatar -->
        <div v-else class="basil-drilldown__avatar" :style="{ background: merchantColor(txn) }">
          {{ merchantInitials(txn) }}
        </div>
        <div class="basil-drilldown__row-left">
          <div class="basil-drilldown__merchant">{{ txn.merchant_name || txn.name }}</div>
          <div class="basil-drilldown__date">{{ formatDate(txnDate(txn)) }}</div>
        </div>
        <div
          class="basil-drilldown__row-amount"
          :class="{ 'basil-drilldown__row-amount--credit': txn.amount >= 0 }"
        >
          {{ txn.amount < 0 ? `-$${Math.abs(txn.amount).toFixed(2)}` : `$${Number(txn.amount).toFixed(2)}` }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import dayjs from 'dayjs';
import { fetchTransactionsForMonth } from '@/api';
import { merchantInitials as getMerchantInitials, merchantColor as getMerchantColor, merchantLogo as getMerchantLogo } from '@/utils/merchantDisplay';
import { formatDollar, formatSignedDollar } from '@/utils/formatDollar';
import { txnDate, txnDayjs, txnMonth } from '@/utils/transactionDate';

export default {
  name: 'TransactionDrillDown',

  data() {
    return {};
  },

  computed: {
    merchant() {
      return this.$route.query.merchant || null;
    },
    month() {
      return this.$route.query.month || null;
    },
    category() {
      return this.$route.query.category || null;
    },

    merchantLabel() {
      if (!this.merchant || this.merchant === '__other__') return 'Other';
      return this.merchant;
    },

    filteredTransactions() {
      const { merchant, month, category } = this;
      if (!month) return [];

      const m = dayjs(month);

      return this.$store.state.transactions
        .filter(txn => {
          if (txn.excludeFromTotal) return false;

          // Month match
          const d = txnDayjs(txn);
          if (d.year() !== m.year() || d.month() !== m.month()) return false;

          // Category match (skip for __other__ — synthetic bucket spanning multiple categories)
          if (category && category !== '__other__' && txn.mappedCategory !== category) return false;

          // Merchant match
          if (merchant === '__other__') {
            // "Other" bucket: null/undefined merchant_name
            if (txn.merchant_name) return false;
          } else if (merchant) {
            if (txn.merchant_name !== merchant) return false;
          }

          return true;
        })
        .sort((a, b) => {
          const da = txnDate(a);
          const db = txnDate(b);
          return da < db ? 1 : da > db ? -1 : 0;
        });
    },

    total() {
      return this.filteredTransactions.reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
    },

    count() {
      return this.filteredTransactions.length;
    },

    monthLabel() {
      if (!this.month) return '';
      return dayjs(this.month).format('MMMM YYYY');
    },

    prevMonthLabel() {
      if (!this.month) return '';
      return dayjs(this.month).subtract(1, 'month').format('MMM');
    },

    avgAmount() {
      if (this.count === 0) return 0;
      return this.total / this.count;
    },

    largestAmount() {
      if (this.count === 0) return 0;
      return Math.max(...this.filteredTransactions.map(t => Math.abs(t.amount)));
    },

    prevMonthTotal() {
      if (!this.month || !this.category) return null;
      const prevMonth = dayjs(this.month).subtract(1, 'month').format('YYYY-MM');
      const prevTxns = this.$store.state.transactionsByMonth[prevMonth];
      if (!prevTxns) return null;
      const merchant = this.merchant;
      return prevTxns
        .filter(t => {
          if (t.excludeFromTotal) return false;
          if (this.category && this.category !== '__other__' && t.mappedCategory !== this.category) return false;
          if (merchant === '__other__') return !t.merchant_name;
          return t.merchant_name === merchant;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    },

    trendDelta() {
      if (this.prevMonthTotal === null) return null;
      return this.total - this.prevMonthTotal;
    },

    trendPercent() {
      if (this.prevMonthTotal === null || this.prevMonthTotal === 0) return null;
      return Math.round(((this.total - this.prevMonthTotal) / this.prevMonthTotal) * 100);
    },

    trendDisplay() {
      if (this.prevMonthTotal === null) return null;
      if (this.prevMonthTotal === 0) {
        return { text: `New vs ${this.prevMonthLabel}`, isIncrease: true };
      }
      const pct = this.trendPercent;
      if (pct === null || pct === 0) return null;
      const arrow = pct > 0 ? '↑' : '↓';
      return {
        text: `${arrow} ${Math.abs(pct)}% vs ${this.prevMonthLabel}`,
        isIncrease: pct > 0,
      };
    },

  },

  methods: {
    formatDollar,
    formatSignedDollar,
    txnDate,
    formatDate(date) {
      return dayjs(date).format('MMM D');
    },
    merchantInitials(row) {
      return getMerchantInitials(row);
    },
    merchantColor(row) {
      return getMerchantColor(row);
    },
    merchantLogo(row) {
      return getMerchantLogo(row);
    },
    _onScroll() {
      const stats = this.$refs.stats
      if (!stats) return
      const scrollTop = this.$refs.list.scrollTop
      const h = stats.offsetHeight
      const progress = Math.min(scrollTop / h, 1)
      stats.style.opacity = 1 - progress
      stats.style.transform = `scale(${1 - 0.04 * progress})`
    },
  },

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

};
</script>

<style scoped>
.basil-drilldown {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--basil-header-height) - var(--basil-bottom-nav-height) - env(safe-area-inset-bottom));
  overflow: hidden;
  background: var(--basil-surface);
}

@media (min-width: 600px) {
  .basil-drilldown {
    /* Desktop: no bottom nav */
    height: calc(100dvh - var(--basil-header-height));
  }
}

/* Header */
.basil-drilldown__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--basil-space-3);
  padding: var(--basil-space-3) var(--basil-space-4);
  background: var(--basil-surface);
  border-bottom: 1px solid var(--basil-border);
}

.basil-drilldown__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  color: var(--basil-text);
  cursor: pointer;
  border-radius: var(--basil-radius-sm);
  flex-shrink: 0;
  padding: 0;
}

.basil-drilldown__back:active {
  background: var(--basil-hover);
}

.basil-drilldown__title {
  display: flex;
  align-items: baseline;
  gap: var(--basil-space-2);
  flex: 1;
  min-width: 0;
}

.basil-drilldown__label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--basil-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.basil-drilldown__separator {
  color: var(--basil-text-muted);
  font-size: 1rem;
  flex-shrink: 0;
}

.basil-drilldown__amount {
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 600;
  color: var(--basil-text-secondary);
  flex-shrink: 0;
}

/* Compact bar — sticky within list */
.basil-drilldown__compact {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--basil-space-2) var(--basil-space-4);
  background: var(--basil-surface-alt);
  border-bottom: 1px solid var(--basil-border);
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

/* Stat cards — scroll with list content, fade on scroll */
.basil-drilldown__stats {
  padding: var(--basil-space-3) var(--basil-space-4);
  background: var(--basil-surface-alt);
  transform-origin: top center;
  will-change: opacity, transform;
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

/* Empty state */
.basil-drilldown__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--basil-space-8);
  color: var(--basil-text-muted);
  font-size: 0.9375rem;
}

/* List */
.basil-drilldown__list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}

.basil-drilldown__row {
  display: flex;
  align-items: center;
  gap: var(--basil-space-3);
  padding: var(--basil-space-3) var(--basil-space-4);
  border-bottom: 1px solid var(--basil-border);
}

.basil-drilldown__row-left {
  flex: 1;
  min-width: 0;
}

.basil-drilldown__merchant {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--basil-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.basil-drilldown__date {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
  margin-top: var(--basil-space-1);
}

.basil-drilldown__row-amount {
  font-variant-numeric: tabular-nums;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--basil-text);
  flex-shrink: 0;
}

.basil-drilldown__row-amount--credit {
  color: var(--basil-positive);
}

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

</style>
