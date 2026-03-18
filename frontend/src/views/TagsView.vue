<template>
  <div class="q-pa-md">
    <div class="basil-card-head q-mb-sm">
      <span class="basil-card-label">Tags</span>
    </div>

    <!-- Loading skeleton -->
    <template v-if="$store.state.bootstrapping">
      <q-item v-for="i in 4" :key="i">
        <q-item-section>
          <q-skeleton type="text" width="55%" />
          <q-skeleton type="text" width="35%" />
        </q-item-section>
      </q-item>
    </template>

    <!-- Empty state -->
    <EmptyState
      v-else-if="tags.length === 0"
      icon="sell"
      heading="No tags yet"
      body="Tag transactions to track spending on trips, projects, or anything else."
    />

    <!-- Tag list -->
    <q-list v-else bordered rounded>
      <SwipeReveal
        v-for="tag in tags" :key="tag.id"
        :ref="el => setSwipeRef(tag.id, el)"
        @action="confirmDelete(tag)"
        @click="toggleExpand(tag)"
      >
        <q-item clickable v-ripple>
          <q-item-section>
            <q-item-label>{{ tag.name }}</q-item-label>
            <q-item-label caption v-if="summaries[tag.id]">
              {{ formatCurrency(summaries[tag.id].totalSpend) }} &middot;
              {{ summaries[tag.id].transactionCount }} transaction{{ summaries[tag.id].transactionCount !== 1 ? 's' : '' }}
              <template v-if="summaries[tag.id].dateRange?.earliest">
                &middot; {{ formatDate(summaries[tag.id].dateRange.earliest) }} – {{ formatDate(summaries[tag.id].dateRange.latest) }}
              </template>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-icon :name="expanded === tag.id ? 'expand_less' : 'expand_more'" color="grey-6" />
          </q-item-section>
        </q-item>
      </SwipeReveal>

      <!-- Expanded detail -->
      <template v-if="expanded && expandedData">
        <q-separator />
        <div class="basil-tags__detail q-pa-md">
          <!-- Category breakdown -->
          <div class="basil-card-head q-mb-xs">
            <span class="basil-card-label">By Category</span>
          </div>
          <div v-if="expandedData.categoryBreakdown?.length">
            <div
              v-for="cat in expandedData.categoryBreakdown" :key="cat.category"
              class="basil-tags__cat-row"
            >
              <span>{{ cat.category || 'Uncategorized' }}</span>
              <span class="basil-mono">{{ formatCurrency(cat.amount) }}</span>
            </div>
          </div>
          <div v-else style="color: var(--basil-text-muted); font-size: 0.8125rem;">No transactions yet</div>

          <!-- Transactions -->
          <div class="basil-card-head q-mb-xs q-mt-md">
            <span class="basil-card-label">Transactions</span>
          </div>
          <q-list v-if="expandedTransactions.length" dense separator>
            <q-item v-for="txn in expandedTransactions" :key="txn.transaction_id" dense>
              <q-item-section>
                <q-item-label>{{ txn.merchant_name || txn.name }}</q-item-label>
                <q-item-label caption>{{ formatDate(txn.date) }} &middot; {{ txn.mappedCategory }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <span class="basil-mono" :style="{ color: txn.amount > 0 ? 'var(--basil-negative)' : 'var(--basil-positive)' }">
                  {{ txn.amount > 0 ? '-' : '' }}{{ formatCurrency(Math.abs(txn.amount)) }}
                </span>
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </template>
    </q-list>

    <!-- Delete confirmation -->
    <BasilConfirmTray
      v-model="showDeleteConfirm"
      title="Delete tag?"
      :message="`Remove '${deleteTarget?.name}' from all transactions? This cannot be undone.`"
      ok-label="Delete"
      ok-color="negative"
      @confirm="executeDelete"
    />
  </div>
</template>

<script>
import { ensureAppData, fetchTagSummary, fetchTagTransactions, deleteTagApi } from '@/api';
import store from '../store';
import EmptyState from '../components/EmptyState.vue';
import SwipeReveal from '../components/SwipeReveal.vue';
import BasilConfirmTray from '../components/BasilConfirmTray.vue';
import dayjs from 'dayjs';

export default {
  name: 'TagsView',
  components: { EmptyState, SwipeReveal, BasilConfirmTray },

  data() {
    return {
      expanded: null,
      expandedData: null,
      expandedTransactions: [],
      summaries: {},
      swipeRefs: {},
      showDeleteConfirm: false,
      deleteTarget: null,
    };
  },

  computed: {
    tags() {
      return this.$store.state.tags || [];
    },
  },

  methods: {
    formatCurrency(val) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(val);
    },

    formatDate(d) {
      return dayjs(d).format('MMM D, YYYY');
    },

    setSwipeRef(key, el) {
      if (el) this.swipeRefs[key] = el;
      else delete this.swipeRefs[key];
    },

    async toggleExpand(tag) {
      if (this.expanded === tag.id) {
        this.expanded = null;
        this.expandedData = null;
        this.expandedTransactions = [];
        return;
      }
      this.expanded = tag.id;
      this.expandedData = null;
      this.expandedTransactions = [];
      const [summary, txnResult] = await Promise.all([
        fetchTagSummary(tag.id),
        fetchTagTransactions(tag.id),
      ]);
      if (summary) {
        this.expandedData = summary;
        this.summaries[tag.id] = summary;
      }
      if (txnResult?.transactions) {
        this.expandedTransactions = txnResult.transactions;
      }
    },

    confirmDelete(tag) {
      for (const ref of Object.values(this.swipeRefs)) {
        if (ref?.reset) ref.reset();
      }
      this.deleteTarget = tag;
      this.showDeleteConfirm = true;
    },

    async executeDelete() {
      if (!this.deleteTarget) return;
      const result = await deleteTagApi(this.deleteTarget.id);
      if (result) {
        store.commit('removeTag', this.deleteTarget.id);
        if (this.expanded === this.deleteTarget.id) {
          this.expanded = null;
          this.expandedData = null;
          this.expandedTransactions = [];
        }
      }
      this.deleteTarget = null;
      this.showDeleteConfirm = false;
    },
  },

  async mounted() {
    await ensureAppData(this.$store);
    // Load summaries for all tags
    for (const tag of this.tags) {
      fetchTagSummary(tag.id).then(s => {
        if (s) this.summaries[tag.id] = s;
      });
    }
  },
};
</script>

<style scoped>
@import '../styles/tags.css';

.basil-tags__cat-row {
  display: flex;
  justify-content: space-between;
  padding: var(--basil-space-1) 0;
  font-size: 0.875rem;
}

.basil-tags__detail {
  background: var(--basil-surface-alt);
}
</style>
