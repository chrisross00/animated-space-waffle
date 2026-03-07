<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
    @hide="reset" @show="populate">
    <q-card class="basil-dialog-card basil-re__card">

      <!-- Header -->
      <div class="basil-dialog-header">
        <div class="basil-dialog-title">
          <div v-if="isEdit" class="basil-dialog-title__sub">Edit Rule</div>
          <div class="basil-dialog-title__main basil-display">{{ isEdit ? rule.label : 'New Rule' }}</div>
        </div>
        <q-btn flat round dense icon="close" v-close-popup class="basil-dialog-close" />
      </div>

      <!-- Scrollable middle: body + matched transactions -->
      <div class="basil-re__scroll">

      <!-- Body -->
      <div class="basil-re__body">

        <!-- Left: Conditions -->
        <div class="basil-re__panel">
          <!-- Rule Name -->
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Rule Name</span>
            </div>
            <q-input
              v-model="form.label"
              outlined dense
              placeholder="e.g. Venmo food"
              class="basil-re__condition-input"
              @update:model-value="onLabelInput"
            />
          </div>

          <div class="basil-re__panel-heading">If transaction matches…</div>

          <!-- Merchant name -->
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Merchant name</span>
              <q-toggle v-model="form.merchantName.active" color="primary" dense size="sm" />
            </div>
            <div v-if="form.merchantName.active" class="basil-re__condition-row">
              <q-select
                v-model="form.merchantName.op"
                :options="textOpOptions"
                option-value="value" option-label="label"
                emit-value map-options outlined dense
                class="basil-re__text-op"
              />
              <q-select
                v-model="form.merchantName.value"
                :options="filteredMerchants"
                use-input new-value-mode="add-unique"
                input-debounce="0"
                @filter="filterMerchants"
                outlined dense
                placeholder="e.g. Zelle"
                class="basil-re__condition-input"
              />
            </div>
          </div>

          <!-- Transaction name -->
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Transaction name</span>
              <q-toggle v-model="form.name.active" color="primary" dense size="sm" />
            </div>
            <div v-if="form.name.active" class="basil-re__condition-row">
              <q-select
                v-model="form.name.op"
                :options="textOpOptions"
                option-value="value" option-label="label"
                emit-value map-options outlined dense
                class="basil-re__text-op"
              />
              <q-input
                v-model="form.name.value"
                outlined dense
                placeholder="e.g. Venmo"
                class="basil-re__condition-input"
              />
            </div>
          </div>

          <!-- Amount -->
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Amount</span>
              <q-toggle v-model="form.amount.active" color="primary" dense size="sm" />
            </div>
            <div v-if="form.amount.active" class="basil-re__condition-row">
              <q-select
                v-model="form.amount.op"
                :options="amountOpOptions"
                option-value="value"
                option-label="label"
                emit-value map-options
                outlined dense
                class="basil-re__amount-op"
              />
              <q-input
                v-if="['eq', 'gt', 'lt'].includes(form.amount.op)"
                v-model.number="form.amount.value"
                outlined dense type="number" min="0"
                prefix="$"
                placeholder="0.00"
                class="basil-re__amount-val"
              />
              <template v-else>
                <q-input
                  v-model.number="form.amount.min"
                  outlined dense type="number" min="0"
                  prefix="$"
                  placeholder="min"
                  class="basil-re__amount-val"
                />
                <span class="basil-re__amount-sep">–</span>
                <q-input
                  v-model.number="form.amount.max"
                  outlined dense type="number" min="0"
                  prefix="$"
                  placeholder="max"
                  class="basil-re__amount-val"
                />
              </template>
            </div>
          </div>

          <!-- Institution -->
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Institution</span>
              <q-toggle v-model="form.institution.active" color="primary" dense size="sm" />
            </div>
            <q-select
              v-if="form.institution.active"
              v-model="form.institution.value"
              :options="institutionOptions"
              outlined dense
              placeholder="Select institution…"
              class="basil-re__condition-input"
            />
          </div>
        </div>

        <!-- Right: Action -->
        <div class="basil-re__panel basil-re__panel--action">
          <div class="basil-re__panel-heading">Then apply…</div>
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Update category</span>
            </div>
            <q-select
              v-model="form.categoryName"
              :options="categoryOptions"
              outlined dense
              placeholder="Choose category…"
              class="basil-re__condition-input"
            />
          </div>

          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Add note</span>
              <span class="basil-re__condition-optional">optional</span>
            </div>
            <q-input
              v-model="form.note"
              outlined dense
              placeholder="e.g. auto-categorized by rule"
              class="basil-re__condition-input"
            />
          </div>

          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Add tags</span>
              <span class="basil-re__condition-badge">Coming soon</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Matched Transactions -->
      <div v-if="conditions.length > 0" class="basil-re__matches">
        <div class="basil-re__matches-toggle" @click="showMatches = !showMatches">
          <span class="basil-re__match-count" :class="{ 'basil-re__match-count--none': matchCount === 0 }">
            Matched transactions &middot; {{ matchCount }}
          </span>
          <q-icon
            name="chevron_right"
            size="18px"
            class="basil-re__matches-chevron"
            :class="{ 'basil-re__matches-chevron--open': showMatches }"
          />
        </div>
        <q-slide-transition>
          <div v-show="showMatches">
            <div v-if="matchedTransactions.length === 0" class="basil-re__matches-empty">
              No transactions match these conditions
            </div>
            <div v-else class="basil-re__matches-list">
              <div
                v-for="t in matchedTransactions"
                :key="t._id"
                class="basil-re__matches-row"
              >
                <div class="basil-re__matches-left">
                  <div class="basil-re__matches-name">{{ t.merchant_name || t.name }}</div>
                  <div class="basil-re__matches-detail">
                    {{ formatDate(t.date) }}<template v-if="t.account"> &middot; {{ t.account }}</template>
                  </div>
                </div>
                <div class="basil-re__matches-right">
                  <span class="basil-re__matches-amount basil-mono">${{ Math.abs(t.amount).toFixed(2) }}</span>
                  <span v-if="t.category" class="basil-re__matches-cat">{{ t.category }}</span>
                </div>
              </div>
            </div>
          </div>
        </q-slide-transition>
      </div>

      </div><!-- /basil-re__scroll -->

      <!-- Footer -->
      <div class="basil-re__footer">
        <span v-if="conditions.length === 0" class="basil-re__match-count basil-re__match-count--none">
          No conditions set
        </span>
        <span v-else />
        <div class="basil-re__footer-actions">
          <q-checkbox
            v-if="isEdit"
            v-model="reapply"
            label="Apply to existing transactions"
            dense size="sm"
            class="basil-re__reapply"
          />
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn unelevated label="Save" color="primary"
            :loading="saving"
            :disable="!isValid"
            @click="save"
          />
        </div>
      </div>

    </q-card>
  </q-dialog>
</template>

<style scoped>
.basil-re__card {
  width: 100%;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

/* Scrollable middle section (body + matched transactions) */
.basil-re__scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  border-top: 1px solid var(--basil-border);
}

/* Body: side-by-side on md+, stacked on mobile */
.basil-re__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}


@media (max-width: 599px) {
  .basil-re__body {
    grid-template-columns: 1fr;
  }
}

.basil-re__panel {
  padding: var(--basil-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-4);
}

.basil-re__panel--action {
  border-left: 1px solid var(--basil-border);
}

@media (max-width: 599px) {
  .basil-re__panel--action {
    border-left: none;
    border-top: 1px solid var(--basil-border);
  }
}

.basil-re__panel-heading {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--basil-text-muted);
}

/* Condition blocks */
.basil-re__condition {
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-2);
}

.basil-re__condition-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.basil-re__condition-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--basil-text);
}

.basil-re__condition-input {
  width: 100%;
}

/* Amount row */
.basil-re__condition-row {
  display: flex;
  align-items: center;
  gap: var(--basil-space-2);
}

.basil-re__text-op {
  flex: 0 0 100px;
}

.basil-re__amount-op {
  flex: 0 0 130px;
}

.basil-re__amount-val {
  flex: 1;
  min-width: 0;
}

.basil-re__amount-sep {
  color: var(--basil-text-muted);
  font-size: 0.875rem;
}

/* Footer */
.basil-re__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--basil-space-3) var(--basil-space-5);
  flex-shrink: 0;
  border-top: 1px solid var(--basil-border);
}

.basil-re__footer-actions {
  display: flex;
  align-items: center;
  gap: var(--basil-space-3);
}

.basil-re__reapply {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
}

.basil-re__match-count {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
}

.basil-re__match-count--none {
  color: var(--basil-text-muted);
  opacity: 0.6;
}

.basil-re__condition-optional {
  font-size: 0.6875rem;
  color: var(--basil-text-muted);
}

.basil-re__condition-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--basil-text-muted);
  background: var(--basil-surface-raised);
  border: 1px solid var(--basil-border);
  border-radius: var(--basil-radius-sm);
  padding: 1px 6px;
}

/* Matched transactions section */
.basil-re__matches {
  border-top: 1px solid var(--basil-border);
}

.basil-re__matches-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--basil-space-3) var(--basil-space-5);
  cursor: pointer;
  user-select: none;
}

.basil-re__matches-toggle:hover {
  background: var(--basil-surface-raised);
}

.basil-re__matches-chevron {
  color: var(--basil-text-muted);
  transition: transform 0.2s ease;
}

.basil-re__matches-chevron--open {
  transform: rotate(90deg);
}

.basil-re__matches-list {
  border-top: 1px solid var(--basil-border);
}

.basil-re__matches-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--basil-space-2) var(--basil-space-5);
  gap: var(--basil-space-3);
}

.basil-re__matches-row:not(:last-child) {
  border-bottom: 1px solid var(--basil-border);
}

.basil-re__matches-left {
  min-width: 0;
  flex: 1;
}

.basil-re__matches-name {
  font-size: 0.875rem;
  color: var(--basil-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.basil-re__matches-detail {
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.basil-re__matches-right {
  display: flex;
  align-items: center;
  gap: var(--basil-space-2);
  flex-shrink: 0;
}

.basil-re__matches-amount {
  font-size: 0.8125rem;
  color: var(--basil-text);
}

.basil-re__matches-cat {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--basil-text-muted);
  background: var(--basil-surface-raised);
  border: 1px solid var(--basil-border);
  border-radius: var(--basil-radius-sm);
  padding: 1px 6px;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.basil-re__matches-empty {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
  padding: var(--basil-space-4) var(--basil-space-5);
  text-align: center;
  border-top: 1px solid var(--basil-border);
}
</style>

<script>
import store from '../store';
import { saveCompoundRule, updateCompoundRule } from '@/firebase';
import { matchesCondition, sweepStore } from '@/utils/ruleUtils';
import dayjs from 'dayjs';

const TEXT_OP_OPTIONS = [
  { label: 'Is',       value: 'eq' },
  { label: 'Contains', value: 'contains' },
];

const AMOUNT_OP_OPTIONS = [
  { label: 'Exactly',      value: 'eq' },
  { label: 'Greater than', value: 'gt' },
  { label: 'Less than',    value: 'lt' },
  { label: 'Between',      value: 'range' },
];

const EMPTY_FORM = () => ({
  label: '',
  merchantName: { active: false, op: 'eq', value: '' },
  name:         { active: false, op: 'eq', value: '' },
  amount:       { active: false, op: 'eq', value: null, min: null, max: null },
  institution:  { active: false, value: '' },
  categoryName: '',
  note: '',
});


export default {
  name: 'RuleEditorDialog',

  props: {
    modelValue:  { type: Boolean, default: false },
    rule:        { type: Object, default: null },  // null = create mode
  },

  emits: ['update:modelValue', 'saved'],

  data() {
    return {
      form: EMPTY_FORM(),
      saving: false,
      reapply: true,
      showMatches: false,
      textOpOptions: TEXT_OP_OPTIONS,
      amountOpOptions: AMOUNT_OP_OPTIONS,
      userEditedLabel: false,
      filteredMerchants: [],
    };
  },

  computed: {
    isEdit() {
      return !!this.rule;
    },
    categoryOptions() {
      return (store.state.categories || []).map(c => c.category).sort();
    },
    institutionOptions() {
      return (store.state.user?.accounts || []).slice().sort();
    },
    merchantOptions() {
      const names = new Set();
      for (const t of (store.state.transactions || [])) {
        if (t.merchant_name) names.add(t.merchant_name);
      }
      return [...names].sort();
    },
    conditions() {
      const out = [];
      if (this.form.merchantName.active && this.form.merchantName.value.trim())
        out.push({ field: 'merchant_name', op: this.form.merchantName.op, value: this.form.merchantName.value.trim() });
      if (this.form.name.active && this.form.name.value.trim())
        out.push({ field: 'name', op: this.form.name.op, value: this.form.name.value.trim() });
      if (this.form.amount.active) {
        const amtOp = this.form.amount.op;
        if ((amtOp === 'eq' || amtOp === 'gt' || amtOp === 'lt') && this.form.amount.value != null)
          out.push({ field: 'amount', op: amtOp, value: Number(this.form.amount.value) });
        else if (amtOp === 'range' && this.form.amount.min != null && this.form.amount.max != null)
          out.push({ field: 'amount', op: 'range', min: Number(this.form.amount.min), max: Number(this.form.amount.max) });
      }
      if (this.form.institution.active && this.form.institution.value)
        out.push({ field: 'account', op: 'eq', value: this.form.institution.value });
      return out;
    },
    isValid() {
      return this.conditions.length > 0 && !!this.form.categoryName && !!this.form.label.trim();
    },
    matchedTransactions() {
      if (this.conditions.length === 0) return [];
      return (store.state.transactions || [])
        .filter(t => this.conditions.every(c => matchesCondition(t, c)))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    },
    matchCount() {
      return this.matchedTransactions.length;
    },
    autoLabel() {
      const parts = [];
      if (this.form.merchantName.active && this.form.merchantName.value.trim())
        parts.push(this.form.merchantName.value.trim());
      else if (this.form.name.active && this.form.name.value.trim())
        parts.push(this.form.name.value.trim());
      if (this.form.amount.active) {
        const amtOp = this.form.amount.op;
        if (amtOp === 'eq' && this.form.amount.value != null)
          parts.push(`$${this.form.amount.value}`);
        else if (amtOp === 'gt' && this.form.amount.value != null)
          parts.push(`> $${this.form.amount.value}`);
        else if (amtOp === 'lt' && this.form.amount.value != null)
          parts.push(`< $${this.form.amount.value}`);
        else if (amtOp === 'range' && this.form.amount.min != null && this.form.amount.max != null)
          parts.push(`$${this.form.amount.min}–$${this.form.amount.max}`);
      }
      if (this.form.institution.active && this.form.institution.value)
        parts.push(this.form.institution.value);
      return parts.join(' · ');
    },
  },

  watch: {
    autoLabel(val) {
      if (!this.userEditedLabel) this.form.label = val;
    },
    'form.label'(val) {
      // If user clears the label back to auto, re-enable auto
      if (val === this.autoLabel) this.userEditedLabel = false;
    },
  },

  methods: {
    populate() {
      if (this.rule) {
        this.userEditedLabel = true;
        this.form.label = this.rule.label || '';
        this.form.categoryName = this.rule.action?.categoryName || '';
        this.form.note = this.rule.action?.note || '';
        for (const c of (this.rule.conditions || [])) {
          if (c.field === 'merchant_name') {
            this.form.merchantName = { active: true, op: c.op || 'eq', value: c.value };
          } else if (c.field === 'name') {
            this.form.name = { active: true, op: c.op || 'eq', value: c.value };
          } else if (c.field === 'amount') {
            if (c.op === 'eq' || c.op === 'gt' || c.op === 'lt')
              this.form.amount = { active: true, op: c.op, value: c.value, min: null, max: null };
            else if (c.op === 'range')
              this.form.amount = { active: true, op: 'range', value: null, min: c.min, max: c.max };
          } else if (c.field === 'account') {
            this.form.institution = { active: true, value: c.value };
          }
        }
      }
    },
    reset() {
      this.form = EMPTY_FORM();
      this.userEditedLabel = false;
      this.reapply = true;
      this.showMatches = false;
    },
    formatDate(date) {
      return dayjs(date).format('MMM D, YYYY');
    },
    onLabelInput() {
      this.userEditedLabel = true;
    },
    filterMerchants(val, update) {
      update(() => {
        const needle = (val || '').toLowerCase();
        this.filteredMerchants = needle
          ? this.merchantOptions.filter(m => m.toLowerCase().includes(needle))
          : this.merchantOptions;
      });
    },
    async save() {
      if (!this.isValid) return;
      this.saving = true;
      try {
        const action = { type: 'categorize', categoryName: this.form.categoryName };
        if (this.form.note.trim()) action.note = this.form.note.trim();
        const payload = {
          label: this.form.label.trim(),
          conditions: this.conditions,
          action,
        };
        let saved;
        if (this.isEdit) {
          saved = await updateCompoundRule(String(this.rule._id), payload.label, payload.conditions, payload.action, this.reapply);
          if (saved) {
            store.commit('updateRule', { ruleId: this.rule._id, label: payload.label, conditions: payload.conditions, action: payload.action });
            if (this.reapply) {
              sweepStore(store, payload.conditions, payload.action.categoryName, payload.action.note || null);
            }
          }
        } else {
          saved = await saveCompoundRule({ ...payload, createdFrom: 'manual' });
          if (saved) {
            store.commit('addRule', saved);
            sweepStore(store, payload.conditions, payload.action.categoryName, payload.action.note || null);
          }
        }
        if (saved) {
          this.$emit('saved', saved);
          this.$emit('update:modelValue', false);
        }
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>
