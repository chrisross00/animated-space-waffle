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

export default {
  name: 'TransactionDrillDown',

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
  },

  methods: {
    formatDate(date) {
      return dayjs(date).format('MMM D, YYYY');
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
</style>
