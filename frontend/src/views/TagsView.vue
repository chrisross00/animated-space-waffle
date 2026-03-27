<template>
  <div class="basil-container basil-pa-4">
    <div class="basil-card-head basil-mb-2">
      <span class="basil-card-label">Tags</span>
    </div>

    <!-- Loading skeleton -->
    <template v-if="$store.state.bootstrapping">
      <BasilListItem v-for="i in 4" :key="i">
        <BasilSkeleton type="text" width="55%" />
        <BasilSkeleton type="text" width="35%" />
      </BasilListItem>
    </template>

    <!-- Empty state -->
    <EmptyState
      v-else-if="tags.length === 0"
      icon="sell"
      heading="No tags yet"
      body="Tag transactions to track spending on trips, projects, or anything else."
    />

    <!-- Tag list -->
    <BasilList v-else style="background: var(--basil-surface); border: 1px solid var(--basil-border); border-radius: var(--basil-radius-md); overflow: hidden;">
      <template v-for="tag in tags" :key="tag.id">
          <BasilListItem clickable @click="toggleExpand(tag)">
            <template #label><span class="basil-tags__name">{{ tag.name }}</span></template>
            <template #caption>
              <template v-if="summaries[tag.id]">
                {{ summaries[tag.id].transactionCount }} transaction{{ summaries[tag.id].transactionCount !== 1 ? 's' : '' }}
                <template v-if="summaries[tag.id].dateRange?.earliest">
                  &middot; {{ formatDate(summaries[tag.id].dateRange.earliest) }} – {{ formatDate(summaries[tag.id].dateRange.latest) }}
                </template>
              </template>
            </template>
            <template #side>
              <div style="display: flex; align-items: center; flex-wrap: nowrap; gap: var(--basil-space-1);">
                <span v-if="summaries[tag.id]" class="basil-tags__total basil-mono">
                  {{ formatCurrency(summaries[tag.id].totalSpend) }}
                </span>
                <BasilIcon :name="expanded === tag.id ? 'expand_less' : 'expand_more'" color="var(--basil-text-muted)" size="sm" />
              </div>
            </template>
          </BasilListItem>

        <!-- Expanded detail (inline after this tag) -->
        <div v-if="expanded === tag.id && expandedData" class="basil-tags__detail basil-pa-4">
          <div class="basil-card-head basil-mb-1">
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

          <div class="basil-card-head basil-mb-1 basil-mt-4">
            <span class="basil-card-label">Tagged Transactions</span>
          </div>
          <BasilList v-if="expandedTransactions.length" separator>
            <BasilListItem v-for="txn in expandedTransactions" :key="txn.transaction_id" dense>
              <template #label>{{ txn.merchant_name || txn.name }}</template>
              <template #caption>{{ formatDate(txn.date) }} &middot; {{ txn.mappedCategory }}</template>
              <template #side>
                <span class="basil-mono" :style="{ color: txn.amount > 0 ? 'var(--basil-negative)' : 'var(--basil-positive)' }">
                  {{ txn.amount > 0 ? '-' : '' }}{{ formatCurrency(Math.abs(txn.amount)) }}
                </span>
              </template>
            </BasilListItem>
          </BasilList>

          <BasilButton
            variant="flat" color="negative" icon="delete" label="Delete tag"
            class="basil-mt-4 basil-tags__delete-btn"
            @click="confirmDelete(expandedTag)"
          />
        </div>
      </template>
    </BasilList>

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
  background: var(--basil-surface);
}

.basil-tags__detail :deep(.basil-list-item__label) {
  font-weight: 400;
  font-family: var(--basil-font-ui);
}
</style>
