<style scoped>
.basil-info-banner {
  background-color: var(--basil-info-bg) !important;
  color: var(--basil-info) !important;
}

:deep(.q-dialog__inner--bottom) {
  padding: 0 !important;
}
</style>

<template>
  <div class="q-pa-md">
    <div class="basil-banner basil-info-banner q-mb-md">
      <q-icon name="info" color="info" />
      Assigning or changing a merchant rule will re-categorize <strong>all existing transactions</strong> from that merchant, not just future ones.
    </div>

    <!-- Desktop table (hidden on mobile) -->
    <q-table
      class="gt-xs"
      title="Merchant Browser"
      :rows="merchants"
      :columns="columns"
      row-key="merchant_name"
      :loading="isLoading"
      :filter="filter"
      :pagination="{ rowsPerPage: 25 }"
    >
      <template v-slot:top-right>
        <BasilSearch dense v-model="filter" placeholder="Search merchants" />
      </template>

      <template v-slot:body-cell-current="props">
        <q-td :props="props">
          <span>{{ currentLabel(props.row) }}</span>
          <q-icon
            v-if="ruleMap[props.row.merchant_name]"
            name="gavel"
            size="xs"
            class="q-ml-xs text-primary"
          >
            <BasilTooltip>Rule: {{ ruleMap[props.row.merchant_name] }}</BasilTooltip>
          </q-icon>
        </q-td>
      </template>

      <template v-slot:body-cell-assign="props">
        <q-td :props="props">
          <div class="row no-wrap items-center q-gutter-sm" style="height: 40px">
            <q-select
              v-model="pendingAssignments[props.row.merchant_name]"
              :options="filteredCategories"
              dense
              outlined
              style="width: 200px"
              use-input
              input-debounce="0"
              @filter="filterFn"
            />
            <BasilButton
              label="Apply"
              style="height: 40px"
              :loading="!!saving[props.row.merchant_name]"
              :disabled="!canApply(props.row.merchant_name)"
              @click="onApply(props.row.merchant_name)"
            />
          </div>
        </q-td>
      </template>
      <template v-slot:no-data>
        <EmptyState v-if="!isLoading"
          icon="store"
          heading="No merchants yet"
          body="Merchants will appear here once you have transactions imported."
        />
      </template>
    </q-table>

    <!-- Mobile card list (hidden on desktop) -->
    <div class="lt-sm">
      <div class="row items-center q-mb-sm">
        <div class="text-h6 col">Merchant Browser</div>
      </div>

      <BasilSearch dense v-model="filter" placeholder="Search" class="q-mb-md" />

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
            <div class="text-center q-py-lg" style="width: 100%;">
              <EmptyState icon="store" heading="No merchants yet"
                body="Merchants will appear here once you have transactions imported." />
            </div>
          </BasilListItem>

          <!-- merchant rows -->
          <BasilListItem v-for="row in filteredMerchants" :key="row.merchant_name"
            clickable @click="openEdit(row)">
            <template #label><span class="text-weight-medium">{{ row.merchant_name }}</span></template>
            <template #caption>
              {{ row.count }} transaction{{ row.count !== 1 ? 's' : '' }}
              · {{ currentLabel(row) }}
            </template>
            <template #side>
              <div class="row items-center q-gutter-xs">
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
        <div class="basil-card__body q-pb-sm">
          <div class="text-subtitle1 text-weight-medium">{{ editDialog.merchantName }}</div>
          <div class="text-caption" style="color: var(--basil-text-muted)">
            Currently: {{ editDialog.currentLabel }}
            <q-icon v-if="editDialog.hasRule" name="gavel" size="xs" class="q-ml-xs text-primary" />
          </div>
        </div>

        <div class="basil-card__body q-pt-none">
          <q-select
            v-model="editDialog.selectedCategory"
            :options="filteredCategories"
            label="Assign to category"
            outlined use-input input-debounce="0"
            @filter="filterFn"
          />
        </div>

        <div class="basil-card__actions q-px-md q-pb-md">
          <BasilButton variant="flat" label="Cancel" @click="editDialog.open = false" class="col" />
          <BasilButton label="Save" class="col"
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
