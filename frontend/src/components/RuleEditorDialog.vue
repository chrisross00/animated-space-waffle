<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
    @hide="reset" @show="populate">
    <q-card class="basil-dialog-card basil-re__card">

      <!-- Header -->
      <div class="basil-dialog-header">
        <div class="basil-dialog-title">
          <div class="basil-dialog-title__sub">{{ isEdit ? 'Edit Rule' : 'New Rule' }}</div>
          <input
            v-model="form.label"
            type="text"
            placeholder="Rule label…"
            class="basil-re__label-input basil-display"
            @input="onLabelInput"
          />
        </div>
        <q-btn flat round dense icon="close" v-close-popup class="basil-dialog-close" />
      </div>

      <!-- Body -->
      <div class="basil-re__body">

        <!-- Left: Conditions -->
        <div class="basil-re__panel">
          <div class="basil-re__panel-heading">If transaction matches…</div>

          <!-- Merchant name -->
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Merchant name</span>
              <q-toggle v-model="form.merchantName.active" color="primary" dense size="sm" />
            </div>
            <q-input
              v-if="form.merchantName.active"
              v-model="form.merchantName.value"
              outlined dense
              placeholder="e.g. Zelle"
              class="basil-re__condition-input"
            />
          </div>

          <!-- Transaction name -->
          <div class="basil-re__condition">
            <div class="basil-re__condition-head">
              <span class="basil-re__condition-label">Transaction name</span>
              <q-toggle v-model="form.name.active" color="primary" dense size="sm" />
            </div>
            <q-input
              v-if="form.name.active"
              v-model="form.name.value"
              outlined dense
              placeholder="e.g. Venmo"
              class="basil-re__condition-input"
            />
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
                v-if="form.amount.op === 'eq'"
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

      <!-- Footer -->
      <div class="basil-re__footer">
        <span class="basil-re__match-count" :class="{ 'basil-re__match-count--none': matchCount === 0 }">
          {{ matchCountLabel }}
        </span>
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
}

/* Body: side-by-side on md+, stacked on mobile */
.basil-re__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  flex: 1;
  overflow-y: auto;
  border-top: 1px solid var(--basil-border);
  border-bottom: 1px solid var(--basil-border);
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

.basil-re__amount-op {
  flex: 0 0 110px;
}

.basil-re__amount-val {
  flex: 1;
  min-width: 0;
}

.basil-re__amount-sep {
  color: var(--basil-text-muted);
  font-size: 0.875rem;
}

/* Title takes all available header space left of the close button */
.basil-re__card .basil-dialog-title {
  flex: 1;
  min-width: 0;
  padding-right: var(--basil-space-3);
}

/* Label input in header — matches basil-dialog-title__main */
.basil-re__label-input {
  font-size: 1.25rem;
  color: var(--basil-text);
  line-height: 1.1;
  letter-spacing: -0.01em;
  background: transparent;
  border: none;
  outline: none;
  width: 100%;
  min-width: 0;
  padding: 0;
}

.basil-re__label-input::placeholder {
  color: var(--basil-text-muted);
}

/* Footer */
.basil-re__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--basil-space-3) var(--basil-space-5);
  flex-shrink: 0;
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
</style>

<script>
import store from '../store';
import { saveCompoundRule, updateCompoundRule } from '@/firebase';
import { matchesCondition, sweepStore } from '@/utils/ruleUtils';

const AMOUNT_OP_OPTIONS = [
  { label: 'Exactly',  value: 'eq' },
  { label: 'Between',  value: 'range' },
];

const EMPTY_FORM = () => ({
  label: '',
  merchantName: { active: false, value: '' },
  name:         { active: false, value: '' },
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
      amountOpOptions: AMOUNT_OP_OPTIONS,
      userEditedLabel: false,
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
    conditions() {
      const out = [];
      if (this.form.merchantName.active && this.form.merchantName.value.trim())
        out.push({ field: 'merchant_name', op: 'eq', value: this.form.merchantName.value.trim() });
      if (this.form.name.active && this.form.name.value.trim())
        out.push({ field: 'name', op: 'eq', value: this.form.name.value.trim() });
      if (this.form.amount.active) {
        if (this.form.amount.op === 'eq' && this.form.amount.value != null)
          out.push({ field: 'amount', op: 'eq', value: Number(this.form.amount.value) });
        else if (this.form.amount.op === 'range' && this.form.amount.min != null && this.form.amount.max != null)
          out.push({ field: 'amount', op: 'range', min: Number(this.form.amount.min), max: Number(this.form.amount.max) });
      }
      if (this.form.institution.active && this.form.institution.value)
        out.push({ field: 'account', op: 'eq', value: this.form.institution.value });
      return out;
    },
    isValid() {
      return this.conditions.length > 0 && !!this.form.categoryName && !!this.form.label.trim();
    },
    matchCount() {
      if (this.conditions.length === 0) return 0;
      return (store.state.transactions || []).filter(t =>
        this.conditions.every(c => matchesCondition(t, c))
      ).length;
    },
    matchCountLabel() {
      if (this.conditions.length === 0) return 'No conditions set';
      return this.matchCount === 1 ? 'Matches 1 transaction' : `Matches ${this.matchCount} transactions`;
    },
    autoLabel() {
      const parts = [];
      if (this.form.merchantName.active && this.form.merchantName.value.trim())
        parts.push(this.form.merchantName.value.trim());
      else if (this.form.name.active && this.form.name.value.trim())
        parts.push(this.form.name.value.trim());
      if (this.form.amount.active) {
        if (this.form.amount.op === 'eq' && this.form.amount.value != null)
          parts.push(`$${this.form.amount.value}`);
        else if (this.form.amount.op === 'range' && this.form.amount.min != null && this.form.amount.max != null)
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
            this.form.merchantName = { active: true, value: c.value };
          } else if (c.field === 'name') {
            this.form.name = { active: true, value: c.value };
          } else if (c.field === 'amount') {
            if (c.op === 'eq')
              this.form.amount = { active: true, op: 'eq', value: c.value, min: null, max: null };
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
    },
    onLabelInput() {
      this.userEditedLabel = true;
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
