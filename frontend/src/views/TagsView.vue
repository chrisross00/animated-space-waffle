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
      <template v-for="tag in tags" :key="tag.id">
          <q-item clickable v-ripple @click="toggleExpand(tag)">
            <q-item-section>
              <q-item-label class="basil-tags__name">{{ tag.name }}</q-item-label>
              <q-item-label caption v-if="summaries[tag.id]">
                {{ summaries[tag.id].transactionCount }} transaction{{ summaries[tag.id].transactionCount !== 1 ? 's' : '' }}
                <template v-if="summaries[tag.id].dateRange?.earliest">
                  &middot; {{ formatDate(summaries[tag.id].dateRange.earliest) }} – {{ formatDate(summaries[tag.id].dateRange.latest) }}
                </template>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center no-wrap q-gutter-xs">
                <span v-if="summaries[tag.id]" class="basil-tags__total basil-mono">
                  {{ formatCurrency(summaries[tag.id].totalSpend) }}
                </span>
                <q-icon :name="expanded === tag.id ? 'expand_less' : 'expand_more'" color="grey-6" size="xs" />
              </div>
            </q-item-section>
          </q-item>

        <!-- Expanded detail (inline after this tag) -->
        <div v-if="expanded === tag.id && expandedData" class="basil-tags__detail q-pa-md">
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

          <div class="basil-card-head q-mb-xs q-mt-md">
            <span class="basil-card-label">Tagged Transactions</span>
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

          <q-btn
            flat no-caps color="negative" icon="delete" label="Delete tag"
            class="q-mt-md basil-tags__delete-btn"
            @click="confirmDelete(expandedTag)"
          />
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
import BasilConfirmTray from '../components/BasilConfirmTray.vue';
import dayjs from 'dayjs';

export default {
  name: 'TagsView',
  components: { EmptyState, BasilConfirmTray },

  data() {
    return {
      expanded: null,
      expandedData: null,
      expandedTransactions: [],
      summaries: {},
      showDeleteConfirm: false,
      deleteTarget: null,
    };
  },

  computed: {
    tags() {
      return this.$store.state.tags || [];
    },
    expandedTag() {
      if (!this.expanded) return null;
      return this.tags.find(t => t.id === this.expanded) || null;
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

:deep(.basil-tags__name) {
  font-weight: 500 !important;
  font-family: var(--basil-font-ui);
  font-size: 0.9375rem;
}

.basil-tags__cat-row {
  display: flex;
  justify-content: space-between;
  padding: var(--basil-space-1) 0;
  font-size: 0.875rem;
  font-family: var(--basil-font-ui);
  color: var(--basil-text);
}

.basil-tags__total {
  font-size: 1rem;
  font-weight: 500;
  color: var(--basil-text);
}

.basil-tags__delete-btn {
  padding-left: 0 !important;
}

.basil-tags__detail {
  background: var(--basil-surface-alt);
}

.basil-tags__detail :deep(.q-item__label) {
  font-weight: 400;
  font-family: var(--basil-font-ui);
}
</style>
