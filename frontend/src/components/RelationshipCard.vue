<template>
  <div class="basil-rel-pair">
    <div class="basil-rel-pair__header">
      <BasilIcon :name="relationship.type === 'split' ? 'call_split' : 'reply'" style="font-size: 16px;" />
      <span>{{ relationship.type === 'split' ? 'Possible payback' : 'Possible return' }}</span>
    </div>
    <div class="basil-rel-pair__row">
      <span class="basil-rel-pair__label">{{ relationship.type === 'split' ? 'Purchase' : 'Charge' }}</span>
      <span class="basil-rel-pair__name">{{ primaryTxn.merchant_name || primaryTxn.name }}</span>
      <span :class="['basil-rel-pair__amount', primaryTxn.amount > 0 ? 'basil-rel-pair__amount--negative' : 'basil-rel-pair__amount--positive', 'basil-mono']">{{ primaryTxn.amount > 0 ? '-' : '+' }}${{ fmtAmount(primaryTxn.amount) }}</span>
      <span class="basil-rel-pair__date">{{ fmtDate(primaryTxn.date) }}</span>
    </div>
    <div class="basil-rel-pair__divider"></div>
    <div class="basil-rel-pair__row">
      <span class="basil-rel-pair__label">{{ relationship.type === 'split' ? 'Payment' : 'Refund' }}</span>
      <span class="basil-rel-pair__name">{{ secondaryName }}</span>
      <span :class="['basil-rel-pair__amount', secondaryTxn.amount > 0 ? 'basil-rel-pair__amount--negative' : 'basil-rel-pair__amount--positive', 'basil-mono']">{{ secondaryTxn.amount > 0 ? '-' : '+' }}${{ fmtAmount(secondaryTxn.amount) }}</span>
      <span class="basil-rel-pair__date">{{ fmtDate(secondaryTxn.date) }}</span>
    </div>
    <div v-if="enrichmentContext" class="basil-rel-pair__enrichment">
      <BasilIcon name="person" style="font-size: 12px;" />
      <span>{{ enrichmentContext }}</span>
    </div>
    <div class="basil-rel-pair__actions">
      <BasilButton variant="flat" label="Not related" @click="$emit('dismiss', relationship)" :disabled="disable" />
      <BasilButton label="Confirm" @click="$emit('confirm', relationship)" :disabled="disable" />
    </div>
  </div>
</template>

<script>
import dayjs from 'dayjs';

export default {
  name: 'RelationshipCard',

  props: {
    relationship: { type: Object, required: true },
    disable: { type: Boolean, default: false },
  },

  emits: ['confirm', 'dismiss'],

  computed: {
    primaryTxn() {
      return this.relationship.type === 'split'
        ? this.relationship.purchaseTxn
        : this.relationship.chargeTxn;
    },
    secondaryTxn() {
      return this.relationship.type === 'split'
        ? this.relationship.p2pTxn
        : this.relationship.refundTxn;
    },
    secondaryName() {
      const txn = this.secondaryTxn;
      const name = txn.merchant_name || txn.name;
      if (txn.venmo_counterparty) return `${txn.venmo_counterparty} via ${name}`;
      return name;
    },
    enrichmentContext() {
      const txn = this.secondaryTxn;
      // Counterparty is shown in the name line; only show note here
      return txn.venmo_note ? `"${txn.venmo_note}"` : null;
    },
  },

  methods: {
    fmtAmount(amount) {
      return Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    fmtDate(date) {
      return dayjs(date).format('MMM D, YYYY');
    },
  },
};
</script>

<style>
.basil-rel-pair {
  background: var(--basil-surface-alt);
  border-radius: var(--basil-radius-md);
  padding: var(--basil-space-3);
}

.basil-rel-pair__header {
  display: flex;
  align-items: center;
  gap: var(--basil-space-1);
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--basil-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--basil-space-2);
}

.basil-rel-pair__row {
  display: flex;
  align-items: baseline;
  gap: var(--basil-space-2);
}

.basil-rel-pair__label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--basil-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
  width: 5.5em;
}

.basil-rel-pair__name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--basil-text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.basil-rel-pair__amount {
  font-size: 0.875rem;
  flex-shrink: 0;
}

.basil-rel-pair__amount--negative {
  color: var(--basil-text-primary);
}

.basil-rel-pair__amount--positive {
  color: var(--basil-positive);
}

.basil-rel-pair__date {
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  flex-shrink: 0;
}

.basil-rel-pair__divider {
  border-top: 1px dashed var(--basil-border);
  margin: var(--basil-space-2) 0;
}

.basil-rel-pair__enrichment {
  display: flex;
  align-items: center;
  gap: var(--basil-space-1);
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  margin-top: var(--basil-space-1);
  padding-left: calc(5.5em + var(--basil-space-2));
}

.basil-rel-pair__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--basil-space-2);
  margin-top: var(--basil-space-3);
}

.basil-rel-pair__actions .basil-btn {
  min-height: 44px;
  min-width: 44px;
}

@media (max-width: 600px) {
  .basil-rel-pair__actions {
    flex-direction: column;
  }

  .basil-rel-pair__actions .basil-btn {
    width: 100%;
  }
}
</style>
