<template>
  <div class="basil-rel-pair">
    <div class="basil-rel-pair__header">
      <q-icon :name="relationship.type === 'split' ? 'call_split' : 'reply'" size="16px" />
      <span>{{ relationship.type === 'split' ? 'Possible payback' : 'Possible return' }}</span>
    </div>
    <div class="basil-rel-pair__row">
      <span class="basil-rel-pair__label">{{ relationship.type === 'split' ? 'Purchase' : 'Charge' }}</span>
      <span class="basil-rel-pair__name">{{ primaryTxn.merchant_name || primaryTxn.name }}</span>
      <span class="basil-rel-pair__amount basil-rel-pair__amount--negative basil-mono">-${{ fmtAmount(primaryTxn.amount) }}</span>
      <span class="basil-rel-pair__date">{{ fmtDate(primaryTxn.date) }}</span>
    </div>
    <div class="basil-rel-pair__divider"></div>
    <div class="basil-rel-pair__row">
      <span class="basil-rel-pair__label">{{ relationship.type === 'split' ? 'Payment' : 'Refund' }}</span>
      <span class="basil-rel-pair__name">{{ secondaryTxn.merchant_name || secondaryTxn.name }}</span>
      <span class="basil-rel-pair__amount basil-rel-pair__amount--positive basil-mono">+${{ fmtAmount(secondaryTxn.amount) }}</span>
      <span class="basil-rel-pair__date">{{ fmtDate(secondaryTxn.date) }}</span>
    </div>
    <div class="basil-rel-pair__actions">
      <q-btn flat dense size="sm" label="Not related" @click="$emit('dismiss', relationship)" :disable="disable" />
      <q-btn unelevated dense size="sm" color="primary" label="Confirm" @click="$emit('confirm', relationship)" :disable="disable" />
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

.basil-rel-pair__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--basil-space-2);
  margin-top: var(--basil-space-3);
}
</style>
