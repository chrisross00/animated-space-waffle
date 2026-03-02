<template>
  <div class="q-pa-md">
    <q-banner class="bg-blue-1 text-blue-9 q-mb-md" rounded>
      <template v-slot:avatar>
        <q-icon name="info" color="blue-7" />
      </template>
      Assigning or changing a merchant rule will re-categorize <strong>all existing transactions</strong> from that merchant, not just future ones.
    </q-banner>

    <q-table
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
          <div class="row no-wrap items-center q-gutter-sm">
            <q-select
              v-model="pendingAssignments[props.row.merchant_name]"
              :options="filteredCategories"
              dense
              outlined
              style="min-width: 160px"
              use-input
              input-debounce="0"
              @filter="filterFn"
            />
            <q-btn
              label="Apply"
              color="primary"
              size="sm"
              :loading="!!saving[props.row.merchant_name]"
              :disable="!canApply(props.row.merchant_name)"
              @click="onApply(props.row.merchant_name)"
            />
          </div>
        </q-td>
      </template>
    </q-table>
  </div>
</template>

<script>
import store from '../store';
import { fetchMerchantStats, saveRule } from '@/firebase';

const columns = [
  { name: 'merchant_name', label: 'Merchant', field: 'merchant_name', sortable: true, align: 'left' },
  { name: 'count', label: 'Txns', field: 'count', sortable: true, align: 'center' },
  { name: 'current', label: 'Current', field: 'merchant_name', sortable: false, align: 'left' },
  { name: 'assign', label: 'Assign', field: 'merchant_name', sortable: false, align: 'left' },
];

export default {
  name: 'MerchantBrowser',

  data() {
    return {
      columns,
      merchants: [],
      isLoading: false,
      filter: '',
      pendingAssignments: {},
      saving: {},
      filteredCategories: [],
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
    const data = await fetchMerchantStats();
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
