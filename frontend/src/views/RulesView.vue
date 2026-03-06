<template>
  <div class="q-pa-md">

    <!-- Compound rules section -->
    <div class="basil-card-head q-mb-sm">
      <span class="basil-card-label">Compound Rules</span>
      <q-btn flat dense icon="add" size="sm" @click="openCreateRule" />
    </div>

    <div v-if="compoundRules.length === 0" class="basil-rules__empty q-mb-lg">
      No compound rules yet.
      <span class="basil-rules__empty-link" @click="openCreateRule">Create one</span>
      or use the Sort Transactions flow.
    </div>

    <q-list v-else bordered separator rounded class="q-mb-lg">
      <q-item v-for="rule in compoundRules" :key="String(rule._id)" class="basil-rules__item">
        <q-item-section>
          <q-item-label class="basil-rules__label">{{ rule.label }}</q-item-label>
          <q-item-label caption class="basil-rules__conditions">
            {{ formatConditions(rule.conditions) }}
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="basil-rules__side">
            <span class="basil-rules__cat-badge" :class="`basil-rules__cat-badge--${categoryType(rule.action.categoryName)}`">
              {{ rule.action.categoryName }}
            </span>
            <q-btn flat round dense icon="edit" size="sm"
              @click="openEditCompound(rule)" />
            <q-btn flat round dense icon="delete" size="sm" color="negative"
              @click="confirmDeleteCompound(rule)" />
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <!-- Simple rules section -->
    <div class="basil-card-head q-mb-sm">
      <span class="basil-card-label">Merchant & Name Rules</span>
    </div>

    <div v-if="simpleRules.length === 0" class="basil-rules__empty q-mb-lg">
      No merchant or name rules yet.
    </div>

    <q-list v-else bordered separator rounded class="q-mb-lg">
      <q-item v-for="rule in simpleRules" :key="rule.key" class="basil-rules__item">
        <q-item-section>
          <q-item-label class="basil-rules__label">{{ rule.value }}</q-item-label>
          <q-item-label caption>{{ rule.type === 'merchant_name' ? 'Merchant rule' : 'Name rule' }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="basil-rules__side">
            <span class="basil-rules__cat-badge" :class="`basil-rules__cat-badge--${categoryType(rule.category)}`">
              {{ rule.category }}
            </span>
            <q-btn flat round dense icon="delete" size="sm" color="negative"
              @click="confirmDeleteSimple(rule)" />
          </div>
        </q-item-section>
      </q-item>
    </q-list>

    <!-- Plaid auto-categorization rules section -->
    <div class="basil-card-head q-mb-xs">
      <span class="basil-card-label">Plaid Auto-Categorization</span>
      <q-icon name="info_outline" size="14px" class="q-ml-xs" style="color: var(--basil-text-muted)">
        <q-tooltip max-width="240px">
          Plaid classifies transactions into categories automatically. These rules map
          Plaid's categories to your budget categories. Edit them via a category's settings.
        </q-tooltip>
      </q-icon>
    </div>
    <p class="basil-rules__pfc-note q-mb-sm">
      These run after merchant &amp; compound rules. Edit them by opening a category's settings.
    </p>

    <div v-if="pfcRules.length === 0" class="basil-rules__empty q-mb-lg">
      No Plaid category mappings set.
    </div>

    <q-list v-else bordered separator rounded class="q-mb-lg">
      <q-item v-for="rule in pfcRules" :key="rule.key" class="basil-rules__item">
        <q-item-section>
          <q-item-label class="basil-rules__label">{{ pfcLabel(rule.pfc) }}</q-item-label>
          <q-item-label caption>Plaid: {{ rule.pfc }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <span class="basil-rules__cat-badge" :class="`basil-rules__cat-badge--${categoryType(rule.category)}`">
            {{ rule.category }}
          </span>
        </q-item-section>
      </q-item>
    </q-list>

    <!-- Rule editor (create + edit) -->
    <RuleEditorDialog
      v-model="ruleEditorOpen"
      :rule="editingRule"
      @saved="onRuleSaved"
    />

    <!-- Delete confirmation dialog -->
    <q-dialog v-model="deleteDialog">
      <q-card style="min-width: 280px">
        <q-card-section>
          <div class="text-subtitle1">Delete rule?</div>
          <div class="text-body2 q-mt-xs" style="color: var(--basil-text-secondary)">
            "{{ pendingDelete?.label || pendingDelete?.value }}" will no longer apply to new transactions.
            Existing categorizations are not affected.
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn flat label="Delete" color="negative" :loading="deleting" @click="executeDelete" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </div>
</template>

<style scoped>
.basil-rules__empty {
  color: var(--basil-text-muted);
  font-size: 0.875rem;
  padding: var(--basil-space-3) 0;
}

.basil-rules__item {
  padding: var(--basil-space-3) var(--basil-space-4);
}

.basil-rules__label {
  font-weight: 500;
}

.basil-rules__conditions {
  margin-top: 2px;
}

.basil-rules__side {
  display: flex;
  align-items: center;
  gap: var(--basil-space-2);
}

.basil-rules__pfc-note {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
  margin: 0 0 var(--basil-space-3) 0;
}

.basil-rules__empty-link {
  color: var(--basil-brand);
  cursor: pointer;
  text-decoration: underline;
}

.basil-rules__cat-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--basil-radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid;
  white-space: nowrap;
  line-height: 1.4;
}

.basil-rules__cat-badge--expense {
  background: var(--basil-expense-bg);
  color: var(--basil-expense);
  border-color: var(--basil-expense);
}

.basil-rules__cat-badge--income {
  background: var(--basil-income-bg);
  color: var(--basil-income);
  border-color: var(--basil-income);
}

.basil-rules__cat-badge--savings {
  background: var(--basil-savings-bg);
  color: var(--basil-savings);
  border-color: var(--basil-savings);
}

.basil-rules__cat-badge--payment {
  background: var(--basil-payment-bg);
  color: var(--basil-payment);
  border-color: var(--basil-payment);
}
</style>

<script>
import store from '../store';
import { fetchRules, deleteCompoundRule, deleteRule } from '@/firebase';
import RuleEditorDialog from '../components/RuleEditorDialog.vue';

const PFC_NAMES = {
  INCOME:                   'Income',
  TRANSFER_IN:              'Transfer In',
  TRANSFER_OUT:             'Transfer Out',
  LOAN_PAYMENTS:            'Loan Payments',
  BANK_FEES:                'Bank Fees',
  ENTERTAINMENT:            'Entertainment',
  FOOD_AND_DRINK:           'Food & Drink',
  GENERAL_MERCHANDISE:      'General Merchandise',
  HOME_IMPROVEMENT:         'Home Improvement',
  MEDICAL:                  'Medical',
  PERSONAL_CARE:            'Personal Care',
  GENERAL_SERVICES:         'General Services',
  GOVERNMENT_AND_NON_PROFIT:'Government & Non-Profit',
  TRANSPORTATION:           'Transportation',
  TRAVEL:                   'Travel',
  RENT_AND_UTILITIES:       'Rent & Utilities',
};

const BUCKET_LABELS = {
  amount_range: (min, max) => max >= 9999 ? `$${min}+` : `$${min}–$${max}`,
};

const FIELD_LABELS = {
  name: 'name',
  merchant_name: 'merchant',
  personal_finance_category_primary: 'transfer type',
  day_of_month: 'day of month',
};

export default {
  name: 'RulesView',
  components: { RuleEditorDialog },

  data() {
    return {
      isLoading: false,
      deleteDialog: false,
      deleting: false,
      pendingDelete: null,
      pendingDeleteType: null, // 'compound' | 'simple'
      ruleEditorOpen: false,
      editingRule: null,  // null = create, object = edit
    };
  },

  computed: {
    compoundRules() {
      return store.state.rules || [];
    },
    simpleRules() {
      const rules = [];
      for (const cat of (store.state.categories || [])) {
        for (const type of ['merchant_name', 'name']) {
          for (const value of (cat.rules?.[type] || [])) {
            rules.push({ key: `${cat._id}-${type}-${value}`, categoryId: cat._id, category: cat.category, type, value });
          }
        }
      }
      return rules.sort((a, b) => a.value.localeCompare(b.value));
    },
    pfcRules() {
      const rules = [];
      for (const cat of (store.state.categories || [])) {
        for (const pfc of (cat.plaid_pfc || [])) {
          rules.push({ key: `${cat._id}-${pfc}`, category: cat.category, pfc });
        }
      }
      return rules.sort((a, b) => a.pfc.localeCompare(b.pfc));
    },
  },

  async mounted() {
    if (!store.state.rules?.length) {
      this.isLoading = true;
      const rules = await fetchRules();
      if (rules) store.commit('setRules', rules);
      this.isLoading = false;
    }
  },

  methods: {
    categoryType(name) {
      return (store.state.categories || []).find(c => c.category === name)?.type || 'expense';
    },
    pfcLabel(pfc) {
      return PFC_NAMES[pfc] || pfc;
    },

    formatConditions(conditions) {
      return conditions.map(c => {
        const fieldLabel = FIELD_LABELS[c.field] || c.field;
        if (c.op === 'eq') return `${fieldLabel} = ${c.value}`;
        if (c.field === 'amount' && c.op === 'eq') return `amount = $${c.value % 1 === 0 ? c.value : c.value.toFixed(2)}`;
        if (c.op === 'range' && c.field === 'amount') return `amount ${BUCKET_LABELS.amount_range(c.min, c.max)}`;
        if (c.op === 'range') return `${fieldLabel} ${c.min}–${c.max}`;
        return `${fieldLabel} ${c.op} ${c.value}`;
      }).join(' · ');
    },

    openCreateRule() {
      this.editingRule = null;
      this.ruleEditorOpen = true;
    },

    openEditCompound(rule) {
      this.editingRule = rule;
      this.ruleEditorOpen = true;
    },

    onRuleSaved() {
      // store already updated inside RuleEditorDialog; nothing extra needed here
    },

    confirmDeleteCompound(rule) {
      this.pendingDelete = rule;
      this.pendingDeleteType = 'compound';
      this.deleteDialog = true;
    },

    confirmDeleteSimple(rule) {
      this.pendingDelete = rule;
      this.pendingDeleteType = 'simple';
      this.deleteDialog = true;
    },

    async executeDelete() {
      this.deleting = true;
      try {
        if (this.pendingDeleteType === 'compound') {
          await deleteCompoundRule(String(this.pendingDelete._id));
          store.commit('removeRule', this.pendingDelete._id);
        } else {
          await deleteRule(this.pendingDelete.categoryId, this.pendingDelete.type, this.pendingDelete.value);
          store.commit('updateCategoryRules', {
            categoryId: this.pendingDelete.categoryId,
            ruleType: this.pendingDelete.type,
            ruleValue: this.pendingDelete.value,
          });
        }
        this.deleteDialog = false;
      } finally {
        this.deleting = false;
      }
    },
  },
};
</script>
