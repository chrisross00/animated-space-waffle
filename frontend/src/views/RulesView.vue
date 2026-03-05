<template>
  <div class="q-pa-md">

    <!-- Compound rules section -->
    <div class="basil-card-head q-mb-sm">
      <span class="basil-card-label">Compound Rules</span>
    </div>

    <div v-if="compoundRules.length === 0" class="basil-rules__empty q-mb-lg">
      No compound rules yet. Create one from the Sort Transactions flow.
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
            <q-chip dense color="primary" text-color="white" size="sm">
              {{ rule.action.categoryName }}
            </q-chip>
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
            <q-chip dense color="primary" text-color="white" size="sm">
              {{ rule.category }}
            </q-chip>
            <q-btn flat round dense icon="delete" size="sm" color="negative"
              @click="confirmDeleteSimple(rule)" />
          </div>
        </q-item-section>
      </q-item>
    </q-list>

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
</style>

<script>
import store from '../store';
import { fetchRules, deleteCompoundRule, deleteRule } from '@/firebase';

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

  data() {
    return {
      isLoading: false,
      deleteDialog: false,
      deleting: false,
      pendingDelete: null,
      pendingDeleteType: null, // 'compound' | 'simple'
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
    formatConditions(conditions) {
      return conditions.map(c => {
        const fieldLabel = FIELD_LABELS[c.field] || c.field;
        if (c.op === 'eq') return `${fieldLabel} = ${c.value}`;
        if (c.op === 'range' && c.field === 'amount') return `amount ${BUCKET_LABELS.amount_range(c.min, c.max)}`;
        if (c.op === 'range') return `${fieldLabel} ${c.min}–${c.max}`;
        return `${fieldLabel} ${c.op} ${c.value}`;
      }).join(' · ');
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
