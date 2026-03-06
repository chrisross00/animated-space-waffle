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
    <q-banner class="basil-info-banner q-mb-md" rounded>
      <template v-slot:avatar>
        <q-icon name="info" color="info" />
      </template>
      Assigning or changing a merchant rule will re-categorize <strong>all existing transactions</strong> from that merchant, not just future ones.
    </q-banner>

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
        <q-input dense debounce="300" v-model="filter" placeholder="Search merchants">
          <template v-slot:append>
            <q-icon name="search" />
          </template>
        </q-input>
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
            <q-tooltip>Rule: {{ ruleMap[props.row.merchant_name] }}</q-tooltip>
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
            <q-btn
              label="Apply"
              color="primary"
              unelevated
              style="height: 40px"
              :loading="!!saving[props.row.merchant_name]"
              :disable="!canApply(props.row.merchant_name)"
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

      <q-input dense outlined debounce="300" v-model="filter"
        placeholder="Search merchants" class="q-mb-md">
        <template v-slot:append><q-icon name="search" /></template>
      </q-input>

      <q-card flat bordered>
        <q-list separator>
          <!-- skeleton while loading -->
          <template v-if="isLoading">
            <q-item v-for="i in 6" :key="i">
              <q-item-section>
                <q-skeleton type="text" width="60%" />
                <q-skeleton type="text" width="40%" />
              </q-item-section>
            </q-item>
          </template>

          <!-- empty state -->
          <q-item v-else-if="filteredMerchants.length === 0">
            <q-item-section class="text-center q-py-lg">
              <EmptyState icon="store" heading="No merchants yet"
                body="Merchants will appear here once you have transactions imported." />
            </q-item-section>
          </q-item>

          <!-- merchant rows -->
          <q-item v-for="row in filteredMerchants" :key="row.merchant_name"
            clickable v-ripple @click="openEdit(row)">
            <q-item-section>
              <q-item-label class="text-weight-medium">{{ row.merchant_name }}</q-item-label>
              <q-item-label caption>
                {{ row.count }} transaction{{ row.count !== 1 ? 's' : '' }}
                · {{ currentLabel(row) }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <div class="row items-center q-gutter-xs">
                <q-icon v-if="ruleMap[row.merchant_name]" name="gavel" size="xs" color="primary" />
                <q-icon name="chevron_right" color="grey-5" />
              </div>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </div>

    <!-- Bottom sheet dialog (mobile edit) -->
    <q-dialog v-model="editDialog.open" position="bottom">
      <q-card style="width: 100%; border-radius: 16px 16px 0 0 !important;
                     background-color: var(--basil-surface);
                     padding-bottom: env(safe-area-inset-bottom)">

        <!-- drag handle -->
        <div class="q-pt-md q-pb-xs" style="display:flex; justify-content:center">
          <div style="width:40px; height:4px; border-radius:2px;
                      background-color: var(--basil-border-strong)" />
        </div>

        <q-card-section class="q-pb-sm">
          <div class="text-subtitle1 text-weight-medium">{{ editDialog.merchantName }}</div>
          <div class="text-caption" style="color: var(--basil-text-muted)">
            Currently: {{ editDialog.currentLabel }}
            <q-icon v-if="editDialog.hasRule" name="gavel" size="xs" class="q-ml-xs text-primary" />
          </div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-select
            v-model="editDialog.selectedCategory"
            :options="filteredCategories"
            label="Assign to category"
            outlined use-input input-debounce="0"
            @filter="filterFn"
          />
        </q-card-section>

        <q-card-actions class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" @click="editDialog.open = false" class="col" />
          <q-btn label="Save" color="primary" unelevated class="col"
            :loading="!!saving[editDialog.merchantName]"
            :disable="!editDialog.selectedCategory ||
                      editDialog.selectedCategory === ruleMap[editDialog.merchantName]"
            @click="saveEdit" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script>
import store from '../store';
import { ensureAppData, fetchMerchantStats, saveRule } from '@/firebase';
import EmptyState from '../components/EmptyState.vue';

const columns = [
  { name: 'merchant_name', label: 'Merchant', field: 'merchant_name', sortable: true, align: 'left' },
  { name: 'count', label: 'Txns', field: 'count', sortable: true, align: 'center' },
  { name: 'current', label: 'Current', field: 'merchant_name', sortable: false, align: 'left' },
  { name: 'assign', label: 'Assign', field: 'merchant_name', sortable: false, align: 'left' },
];

export default {
  name: 'MerchantBrowser',
  components: { EmptyState },

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
