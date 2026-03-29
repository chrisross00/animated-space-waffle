<template>
  <div class="basil-drilldown">
    <div class="basil-drilldown__header">
      <button class="basil-drilldown__back" @click="$router.back()" aria-label="Back">
        <BasilIcon name="arrow_back" size="20px" />
      </button>
      <div class="basil-drilldown__title">
        <span class="basil-drilldown__label">{{ pfcLabel }}</span>
        <span class="basil-drilldown__separator">·</span>
        <span class="basil-drilldown__amount">${{ Math.round(total).toLocaleString() }}</span>
      </div>
    </div>

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

    <div v-if="filteredTransactions.length === 0" class="basil-drilldown__empty">
      No transactions
    </div>

    <div v-else class="basil-drilldown__list" @scroll="onListScroll">
      <div
        v-for="txn in filteredTransactions"
        :key="txn.transaction_id"
        class="basil-drilldown__row"
      >
        <!-- Venmo logo avatar -->
        <div v-if="isVenmo(txn)" class="basil-drilldown__avatar basil-drilldown__avatar--venmo">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff">
            <path d="M19.5 1.6c.8 1.3 1.1 2.6 1.1 4.3 0 5.3-4.5 12.2-8.2 17.1H5.2L2.4 2.1l6.3-.6 1.6 12.9c1.5-2.4 3.3-6.2 3.3-8.8 0-1.6-.3-2.7-.7-3.6l6.6-0.4z"/>
          </svg>
        </div>
        <!-- Standard initials avatar -->
        <div v-else class="basil-drilldown__avatar" :style="{ background: merchantColor(txn) }">
          {{ merchantInitials(txn) }}
        </div>
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
    </div>
  </div>
</template>

<script>
import dayjs from 'dayjs';
import { humanizeDetailedPfc } from '@/utils/pfcLabels';
import { merchantInitials as getMerchantInitials, merchantColor as getMerchantColor, isVenmo as getIsVenmo } from '@/utils/merchantDisplay';

export default {
  name: 'TransactionDrillDown',

  data() {
    return {
      collapsed: false,
    };
  },

  computed: {
    pfc() {
      return this.$route.query.pfc || null;
    },
    month() {
      return this.$route.query.month || null;
    },
    category() {
      return this.$route.query.category || null;
    },

    pfcLabel() {
      if (!this.pfc || this.pfc === '__other__') return 'Other';
      return humanizeDetailedPfc(this.pfc);
    },

    filteredTransactions() {
      const { pfc, month, category } = this;
      if (!month) return [];

      const m = dayjs(month);

      return this.$store.state.transactions
        .filter(txn => {
          if (txn.excludeFromTotal) return false;

          // Month match
          const d = dayjs(txn.effectiveDate || txn.date);
          if (d.year() !== m.year() || d.month() !== m.month()) return false;

          // Category match
          if (category && txn.mappedCategory !== category) return false;

          // PFC detail match
          if (pfc === '__other__') {
            // "Other" bucket: null/undefined plaidPfcDetail
            if (txn.plaidPfcDetail) return false;
          } else if (pfc) {
            if (txn.plaidPfcDetail !== pfc) return false;
          }

          return true;
        })
        .sort((a, b) => {
          const da = a.effectiveDate || a.date;
          const db = b.effectiveDate || b.date;
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
      const pfc = this.pfc;
      return prevTxns
        .filter(t => {
          if (t.excludeFromTotal) return false;
          if (t.mappedCategory !== this.category) return false;
          if (pfc === '__other__') return !t.plaidPfcDetail;
          return t.plaidPfcDetail === pfc;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    },

    trendPercent() {
      if (this.prevMonthTotal === null || this.prevMonthTotal === 0) return null;
      return Math.round(((this.total - this.prevMonthTotal) / this.prevMonthTotal) * 100);
    },

    trendDisplay() {
      if (this.trendPercent === null) return null;
      const arrow = this.trendPercent > 0 ? '↑' : '↓';
      return {
        text: `${arrow} ${Math.abs(this.trendPercent)}% vs ${this.prevMonthLabel}`,
        isIncrease: this.trendPercent > 0,
      };
    },
  },

  methods: {
    formatDate(date) {
      return dayjs(date).format('MMM D');
    },
    merchantInitials(row) {
      return getMerchantInitials(row);
    },
    merchantColor(row) {
      return getMerchantColor(row);
    },
    isVenmo(row) {
      return getIsVenmo(row);
    },
    onListScroll(e) {
      this.collapsed = e.target.scrollTop > 0;
    },
  },
};
</script>

<style scoped>
.basil-drilldown {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--basil-surface);
}

/* Header */
.basil-drilldown__header {
  position: sticky;
  top: 0;
  z-index: 10;
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
  font-family: var(--basil-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
  font-weight: 600;
  color: var(--basil-text-secondary);
  flex-shrink: 0;
}

/* Summary header */
.basil-drilldown__summary {
  position: sticky;
  top: 53px;
  z-index: 5;
  background: var(--basil-surface-alt);
  border-bottom: 1px solid var(--basil-border);
  overflow: hidden;
}

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
  font-family: var(--basil-font-mono);
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

.basil-drilldown__avatar--venmo {
  background: #008CFF;
}
</style>
