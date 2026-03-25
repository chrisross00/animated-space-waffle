<style scoped>
.basil-info-banner {
  background-color: var(--basil-info-bg) !important;
  color: var(--basil-info) !important;
}
</style>

<template>
  <div style="padding: var(--basil-space-4)">
    <div class="basil-banner basil-info-banner" style="margin-bottom: var(--basil-space-4)">
      <BasilIcon name="info" style="color: var(--basil-info)" />
      Assigning or changing a merchant rule will re-categorize <strong>all existing transactions</strong> from that merchant, not just future ones.
    </div>

    <!-- Desktop table (hidden on mobile) -->
    <BasilTable
      class="basil-desktop-only"
      title="Merchant Browser"
      :rows="merchants"
      :columns="columns"
      row-key="merchant_name"
      :loading="isLoading"
      :filter="filter"
      :pagination="{ rowsPerPage: 25 }"
    >
      <template #top-right>
        <BasilSearch dense v-model="filter" placeholder="Search merchants" />
      </template>

      <template #body-cell-current="{ row }">
        <span>{{ currentLabel(row) }}</span>
        <span
          v-if="ruleMap[row.merchant_name]"
          class="material-icons basil-merchant-rule-icon"
          style="font-size: 14px; margin-left: var(--basil-space-1); color: var(--basil-green)"
        >gavel
          <BasilTooltip>Rule: {{ ruleMap[row.merchant_name] }}</BasilTooltip>
        </span>
      </template>

      <template #body-cell-assign="{ row }">
        <div style="display: flex; flex-wrap: nowrap; align-items: center; gap: var(--basil-space-2); height: 40px">
          <BasilSelect
            v-model="pendingAssignments[row.merchant_name]"
            :options="categoryNames"
            dense
            filterable
            style="width: 200px"
          />
          <BasilButton
            label="Apply"
            style="height: 40px"
            :loading="!!saving[row.merchant_name]"
            :disabled="!canApply(row.merchant_name)"
            @click="onApply(row.merchant_name)"
          />
        </div>
      </template>
      <template #no-data>
        <EmptyState v-if="!isLoading"
          icon="store"
          heading="No merchants yet"
          body="Merchants will appear here once you have transactions imported."
        />
      </template>
    </BasilTable>

    <!-- Mobile card list (hidden on desktop) -->
    <div class="basil-mobile-only">
      <div style="display: flex; align-items: center; margin-bottom: var(--basil-space-2)">
        <div style="font-size: 1.25rem; font-weight: 500; flex: 1;">Merchant Browser</div>
      </div>

      <BasilSearch dense v-model="filter" placeholder="Search" style="margin-bottom: var(--basil-space-4)" />

      <BasilCard>
        <BasilList separator>
          <!-- skeleton while loading -->
          <template v-if="isLoading">
            <BasilListItem v-for="i in 6" :key="i">
              <BasilSkeleton type="text" width="60%" />
              <BasilSkeleton type="text" width="40%" />
            </BasilListItem>
          </template>

          <!-- empty state -->
          <BasilListItem v-else-if="filteredMerchants.length === 0">
            <div style="text-align: center; padding: var(--basil-space-6) 0; width: 100%;">
              <EmptyState icon="store" heading="No merchants yet"
                body="Merchants will appear here once you have transactions imported." />
            </div>
          </BasilListItem>

          <!-- merchant rows -->
          <BasilListItem v-for="row in filteredMerchants" :key="row.merchant_name"
            clickable @click="openEdit(row)">
            <template #label><span style="font-weight: 500;">{{ row.merchant_name }}</span></template>
            <template #caption>
              {{ row.count }} transaction{{ row.count !== 1 ? 's' : '' }}
              · {{ currentLabel(row) }}
            </template>
            <template #side>
              <div style="display: flex; align-items: center; gap: var(--basil-space-1)">
                <BasilIcon v-if="ruleMap[row.merchant_name]" name="gavel" size="sm" color="primary" />
                <BasilIcon name="chevron_right" color="var(--basil-text-muted)" />
              </div>
            </template>
          </BasilListItem>
        </BasilList>
      </BasilCard>
    </div>

    <!-- Bottom sheet dialog (mobile edit) -->
    <BasilTray v-model="editDialog.open">
      <BasilCard flat>
        <div class="basil-card__body" style="padding-bottom: var(--basil-space-2)">
          <div style="font-size: 1rem; font-weight: 500;">{{ editDialog.merchantName }}</div>
          <div style="font-size: 0.75rem; color: var(--basil-text-muted);">
            Currently: {{ editDialog.currentLabel }}
            <BasilIcon v-if="editDialog.hasRule" name="gavel" style="font-size: 14px; margin-left: var(--basil-space-1); color: var(--basil-green)" />
          </div>
        </div>

        <div class="basil-card__body" style="padding-top: 0">
          <BasilSelect
            v-model="editDialog.selectedCategory"
            :options="categoryNames"
            label="Assign to category"
            filterable
          />
        </div>

        <div class="basil-card__actions" style="padding: 0 var(--basil-space-4) var(--basil-space-4)">
          <BasilButton variant="flat" label="Cancel" @click="editDialog.open = false" style="flex: 1;" />
          <BasilButton label="Save" style="flex: 1;"
            :loading="!!saving[editDialog.merchantName]"
            :disabled="!editDialog.selectedCategory ||
                      editDialog.selectedCategory === ruleMap[editDialog.merchantName]"
            @click="saveEdit" />
        </div>
      </BasilCard>
    </BasilTray>
  </div>
</template>

<script>
import store from '../store';
import { ensureAppData, fetchMerchantStats, saveRule } from '@/api';
import EmptyState from '../components/EmptyState.vue';
import BasilTray from '../components/BasilTray.vue';
import BasilSearch from '@/components/BasilSearch';

const columns = [
  { name: 'merchant_name', label: 'Merchant', field: 'merchant_name', sortable: true, align: 'left' },
  { name: 'count', label: 'Txns', field: 'count', sortable: true, align: 'center' },
  { name: 'current', label: 'Current', field: 'merchant_name', sortable: false, align: 'left' },
  { name: 'assign', label: 'Assign', field: 'merchant_name', sortable: false, align: 'left' },
];

export default {
  name: 'MerchantBrowser',
  components: { EmptyState, BasilTray, BasilSearch },

  data() {
    return {
      columns,
      merchants: [],
      isLoading: false,
      filter: '',
      pendingAssignments: {},
      saving: {},
      filteredCategories: [],
      editDialog: {
        open: false,
        merchantName: null,
        currentLabel: '',
        hasRule: false,
        selectedCategory: null,
      },
    };
  },

  computed: {
    categoryNames() {
      return (store.state.categories || []).map(c => c.category).sort();
    },
    ruleMap() {
      const map = {};
      for (const cat of store.state.categories || []) {
        for (const merchant of (cat.rules?.merchant_name || [])) {
          map[merchant] = cat.category;
        }
      }
      return map;
    },
    filteredMerchants() {
      if (!this.filter) return this.merchants;
      const needle = this.filter.toLowerCase();
      return this.merchants.filter(m =>
        m.merchant_name.toLowerCase().includes(needle)
      );
    },
  },

  methods: {
    currentLabel(row) {
      const cats = row.categories;
      if (cats.length === 0) return '—';
      if (cats.length === 1) return cats[0];
      return 'Mixed';
    },

    canApply(merchantName) {
      const selected = this.pendingAssignments[merchantName];
      if (!selected) return false;
      return selected !== this.ruleMap[merchantName];
    },

    filterFn(val, update) {
      update(() => {
        if (val === '') {
          this.filteredCategories = this.categoryNames;
        } else {
          const needle = val.toLowerCase();
          this.filteredCategories = this.categoryNames.filter(n => n.toLowerCase().includes(needle));
        }
      });
    },

    openEdit(row) {
      this.filteredCategories = this.categoryNames;
      this.editDialog = {
        open: true,
        merchantName: row.merchant_name,
        currentLabel: this.currentLabel(row),
        hasRule: !!this.ruleMap[row.merchant_name],
        selectedCategory: this.ruleMap[row.merchant_name] || null,
      };
    },

    async saveEdit() {
      const { merchantName, selectedCategory } = this.editDialog;
      this.pendingAssignments[merchantName] = selectedCategory;
      await this.onApply(merchantName);
      this.editDialog.open = false;
    },

    async onApply(merchantName) {
      const categoryName = this.pendingAssignments[merchantName];
      if (!categoryName) return;
      const cat = store.state.categories.find(c => c.category === categoryName);
      if (!cat) return;

      this.saving[merchantName] = true;

      const result = await saveRule(cat._id, cat.category, 'merchant_name', merchantName);
      if (result) {
        // Remove rule from previous category in the store (if any)
        const prevCategoryName = this.ruleMap[merchantName];
        if (prevCategoryName && prevCategoryName !== categoryName) {
          const prevCat = store.state.categories.find(c => c.category === prevCategoryName);
          if (prevCat) {
            store.commit('updateCategoryRules', { categoryId: prevCat._id, ruleType: 'merchant_name', ruleValue: merchantName });
          }
        }
        // Add rule to target category in store
        store.commit('addCategoryRule', { categoryId: cat._id, ruleType: 'merchant_name', ruleValue: merchantName });

        // Update the local row so the Current column reflects the new category
        const row = this.merchants.find(m => m.merchant_name === merchantName);
        if (row) row.categories = [categoryName];

        // Keep the select showing the applied value (Apply button will disable since it matches ruleMap)
        this.pendingAssignments[merchantName] = categoryName;
      }

      this.saving[merchantName] = false;
    },
  },

  async mounted() {
    this.filteredCategories = this.categoryNames;
    this.isLoading = true;
    const [data] = await Promise.all([fetchMerchantStats(), ensureAppData(store)]);
    this.isLoading = false;
    if (data) {
      this.merchants = data;
      // Pre-populate selects with existing rules
      for (const row of data) {
        if (this.ruleMap[row.merchant_name]) {
          this.pendingAssignments[row.merchant_name] = this.ruleMap[row.merchant_name];
        }
      }
    }
  },
};
</script>
