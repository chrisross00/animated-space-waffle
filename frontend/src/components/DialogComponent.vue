<template>
  <BasilCard class="basil-dialog-card">

    <!-- ── Header ─────────────────────────────────────── -->
    <div class="basil-dialog-header">
      <div class="basil-dialog-title">
        <div v-if="dialogSubtitle" class="basil-dialog-title__sub">{{ dialogSubtitle }}</div>
        <div class="basil-dialog-title__main basil-display">{{ dialogMainTitle }}</div>
      </div>
      <BasilButton variant="icon" icon="close" @click="closeTray" class="basil-dialog-close" aria-label="Close" />
    </div>

    <!-- ── TRANSACTION form ───────────────────────────── -->
    <div v-if="dialogType === 'transaction'" class="basil-dialog-body">

      <!-- Amount hero -->
      <div class="basil-dialog-txn-hero">
        <div
          class="basil-dialog-txn-amount basil-display"
          :class="item.amount >= 0 ? 'basil-dialog-txn-amount--credit' : ''"
        >
          {{ item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${Number(item.amount).toFixed(2)}` }}
        </div>
        <div class="basil-dialog-txn-name">{{ item.venmo_note ? item.venmo_note + ' · Venmo' : (dialogBody.merchantName || dialogBody.name) }}</div>
        <div
          v-if="item.venmo_counterparty"
          class="basil-dialog-txn-subname"
        >To {{ item.venmo_counterparty }}</div>
        <div
          v-else-if="dialogBody.merchantName && dialogBody.merchantName !== dialogBody.name"
          class="basil-dialog-txn-subname"
        >{{ dialogBody.name }}</div>
        <div
          v-else-if="!dialogBody.merchantName && item?.account && item.account !== '?'"
          class="basil-dialog-txn-subname"
        >{{ item.account }}</div>
        <div
          v-if="attribution"
          class="basil-dialog-txn-attribution"
          :class="{ 'basil-dialog-txn-attribution--link': attribution.linkable }"
          @click="attribution.linkable && $emit('view-rule', attribution)"
        >
          <BasilIcon :name="attribution.icon" style="font-size: 14px;" />
          <span>{{ attribution.label }}</span>
          <BasilIcon v-if="attribution.linkable" name="chevron_right" style="font-size: 14px;" />
        </div>
        <div v-if="isSplitChild" class="basil-dialog-txn-attribution">
          <BasilIcon name="call_split" style="font-size: 14px;" />
          <span>Split from ${{ parentAmount != null ? Math.abs(parentAmount).toFixed(2) : '?' }} {{ item.merchant_name || item.name }}</span>
        </div>
      </div>

      <template v-if="!splitMode">
        <div class="basil-dialog-fields">
          <BasilDatePicker v-model="dialogBody.date" label="Date" @update:model-value="isFormSubmittable()" />
          <BasilSelect
            v-model="dialogBody.mappedCategory"
            label="Category"
            :options="dropDownOptions"
            filterable
          />
          <BasilNote v-model="dialogBody.note" label="Note" @blur="isFormSubmittable()" />
        </div>

        <div v-if="dialogType === 'transaction'" style="padding: 0 var(--basil-space-4); margin-bottom: var(--basil-space-2)">
          <TagPicker v-model="selectedTags" @update:modelValue="isFormSubmittable()" />
        </div>

        <div class="basil-dialog-toggles">
          <BasilToggle
            label="Exclude from total"
            v-model="dialogBody.excludeFromTotal"
            @update:model-value="isFormSubmittable()"
          />
          <div v-if="dialogType === 'transaction' && similarityData?.allCount > 0" class="basil-dialog-similar">
            <BasilToggle v-model="dialogBody.createRule" variant="checkbox" dense>
              <span v-if="actionableCount > 0">
                Also categorize {{ actionableCount }} similar
              </span>
              <span v-else>Remember for future "{{ similarityData.label }}" ({{ similarityData.allCount }} similar)</span>
            </BasilToggle>
            <div class="basil-dialog-similar__hint">
              Matched by {{ { merchant_name: 'merchant', exact_name: 'name', name_account: 'name + institution', name_prefix: 'name pattern', amount_account: 'amount + institution', amount: 'amount' }[similarityData.strategy] || similarityData.strategy }}
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div style="text-align: center; padding: var(--basil-space-2) 0 var(--basil-space-3);">
          <span class="basil-split__remaining" :class="{ 'basil-split__remaining--done': Math.abs(splitRemaining) < 0.01 }">
            {{ Math.abs(splitRemaining) < 0.01 ? 'Balanced' : `$${splitRemaining.toFixed(2)} remaining` }}
          </span>
        </div>
        <div class="basil-split__rows">
          <div v-for="(row, i) in splitRows" :key="i" class="basil-split__row">
            <BasilAmount :model-value="row.amount" @update:model-value="updateSplitAmount(i, $event)" dense class="basil-split__amount" />
            <BasilSelect
              dense
              :model-value="row.categoryName"
              @update:model-value="updateSplitCategory(i, $event)"
              :options="dropDownOptions"
              label="Category"
              class="basil-split__category"
            />
            <BasilButton
              v-if="splitRows.length > 2"
              variant="icon" dense
              icon="close"
              color="negative"
              @click="removeSplitRow(i)"
            />
            <div v-else style="width: 36px" />
          </div>
          <div v-if="splitRemaining > 0.01" style="text-align: center; padding: var(--basil-space-1) 0;">
            <BasilButton variant="flat" dense label="+ Add row" color="primary" @click="addSplitRow()" />
          </div>
        </div>
      </template>

      <!-- Detected relationship -->
      <div v-if="relationship" class="basil-dialog-section">
        <div class="basil-dialog-section__label">Detected relationship</div>
        <RelationshipCard
          :relationship="relationship"
          @confirm="rel => $emit('relationship-confirm', rel)"
          @dismiss="rel => $emit('relationship-dismiss', rel)"
        />
      </div>

      <div class="basil-dialog-actions">
        <template v-if="splitMode">
          <BasilButton variant="flat" label="Cancel" @click="exitSplitMode()" />
          <BasilButton
            label="Save split"
            :disabled="!splitValid || splitSaving"
            :loading="splitSaving"
            @click="saveSplit()"
          />
        </template>
        <template v-else>
          <div style="display: flex; gap: var(--basil-space-1);">
            <BasilButton variant="flat" label="Cancel" @click="closeTray" />
            <BasilButton v-if="canSplit" variant="flat" label="Split" @click="enterSplitMode()" />
            <BasilButton v-if="isSplitChild" variant="flat" label="Unsplit" @click="requestUnsplit()" />
          </div>
          <div class="basil-dialog-actions__right">
            <BasilButton variant="flat" label="Reset" @click="resetData()" />
            <BasilButton label="Submit" :disabled="!formSubmittable" @click="updateTransaction" />
          </div>
        </template>
      </div>
    </div>

    <!-- ── EDIT CATEGORY form ─────────────────────────── -->
    <div v-if="dialogType === 'editCategory'" class="basil-dialog-body">

      <div class="basil-dialog-fields">
        <BasilText v-model="dialogBody.categoryName" label="Category Name" @blur="isFormSubmittable()" />
        <BasilAmount v-model="dialogBody.monthly_limit" label="Monthly Limit" @blur="isFormSubmittable()" />
        <BasilToggle
          v-if="item.type === 'expense'"
          v-model="dialogBody.fixed"
          label="Fixed expense (rent, subscriptions, bills)"
          style="margin-top: var(--basil-space-2)"
          @update:model-value="isFormSubmittable()"
        />
      </div>

      <!-- Existing rules -->
      <div v-if="hasRules" class="basil-dialog-section">
        <div class="basil-dialog-section__label">Auto-learn rules</div>
        <div v-for="ruleType in ['merchant_name', 'name']" :key="ruleType">
          <div v-if="item.rules && item.rules[ruleType] && item.rules[ruleType].length" style="margin-bottom: var(--basil-space-1)">
            <div class="basil-dialog-section__sublabel">
              {{ ruleType === 'merchant_name' ? 'Merchant' : 'Transaction name' }}
            </div>
            <div class="basil-chips">
              <span
                v-for="ruleValue in item.rules[ruleType]"
                :key="ruleValue"
                class="basil-chip"
                :class="{ 'basil-chip--removing': isPendingRemoval(ruleType, ruleValue) }"
              >
                {{ ruleValue }}
                <button class="basil-chip__remove" @click="stageRuleRemoval(ruleType, ruleValue)">×</button>
              </span>
            </div>
          </div>
        </div>
        <p v-if="pendingRuleRemovals.length" class="basil-dialog-hint">
          Struck-through rules will be deleted on Submit. Click × again to undo.
        </p>
      </div>

      <!-- Add rule -->
      <div class="basil-dialog-section">
        <div class="basil-dialog-section__label">Add merchant rule</div>
        <div style="display: flex; align-items: center; gap: var(--basil-space-2)">
          <BasilSelect
            v-model="newRuleValue"
            :options="allMerchantOptions"
            option-value="value"
            option-label="value"
            emit-value
            label="Search merchants…"
            dense
            filterable
            style="flex: 1;"
          >
            <template #option="{ option }">
              <div>
                <div>{{ option.value }}</div>
                <div v-if="option.conflict" class="basil-conflict-label" style="font-size: 0.75rem;">
                  currently: {{ option.conflict }}
                </div>
              </div>
            </template>
          </BasilSelect>
          <BasilButton variant="icon" icon="add" color="primary" dense :disabled="!newRuleValue || isAlreadyRuled(newRuleValue)" @click="addPendingRule" />
        </div>
        <p v-if="conflictingCategory" class="basil-dialog-hint basil-dialog-hint--warn">
          "{{ newRuleValue }}" is currently assigned to <strong>{{ conflictingCategory }}</strong>.
          Adding it here will move it and re-categorize all matching transactions.
        </p>
        <div v-if="pendingRuleAdditions.length" class="basil-chips" style="margin-top: var(--basil-space-1)">
          <span
            v-for="r in pendingRuleAdditions"
            :key="r.ruleValue"
            class="basil-chip basil-chip--pending"
          >
            {{ r.ruleValue }}
            <button class="basil-chip__remove" @click="removePendingAddition(r.ruleValue)">×</button>
          </span>
        </div>
        <p v-if="pendingRuleAdditions.length" class="basil-dialog-hint">
          These rules will be saved on Submit and applied to all existing and future transactions.
        </p>
      </div>

      <div class="basil-dialog-actions">
        <BasilButton variant="flat" label="Cancel" @click="closeTray" />
        <div class="basil-dialog-actions__right">
          <BasilButton variant="flat" label="Reset" @click="resetData()" />
          <BasilButton label="Submit" :disabled="!formSubmittable" @click="updateCategory" />
        </div>
      </div>
    </div>

    <!-- ── ADD CATEGORY form ──────────────────────────── -->
    <div v-if="dialogType === 'addCategory'" class="basil-dialog-body">

      <div class="basil-dialog-fields">
        <BasilText v-model="dialogBody.categoryName" label="Category Name" @blur="isFormSubmittable()" />
        <BasilAmount v-model="dialogBody.monthly_limit" label="Monthly Limit" @blur="isFormSubmittable()" />
        <BasilSelect
          v-model="dialogBody.type"
          label="Category Type"
          :options="type"
        />
        <div v-if="dialogBody.type" class="basil-type-hint">
          <span v-if="dialogBody.type === 'Expense'">Counts toward your monthly spending totals.</span>
          <span v-else-if="dialogBody.type === 'Income'">Counted as money in. Excluded from spending totals.</span>
          <span v-else-if="dialogBody.type === 'Savings'">Tracked separately as money saved. Excluded from spending totals.</span>
          <span v-else-if="dialogBody.type === 'Payment'">Excluded from all totals. Use for credit card payments and transfers to avoid double-counting money you've already tracked as expenses.</span>
        </div>
      </div>

      <div class="basil-dialog-actions">
        <BasilButton variant="flat" label="Cancel" @click="closeTray" />
        <div class="basil-dialog-actions__right">
          <BasilButton variant="flat" label="Reset" @click="resetData()" />
          <BasilButton label="Submit" :disabled="!formSubmittable" @click="addCategory" />
        </div>
      </div>
    </div>

  </BasilCard>
</template>

<style scoped>

/* ── Body ── */
.basil-dialog-body {
  padding: var(--basil-space-5) var(--basil-space-5) var(--basil-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-5);
  flex: 1;
  overflow-y: auto;
}

/* ── Transaction hero ── */
.basil-dialog-txn-hero {
  padding-bottom: var(--basil-space-4);
  border-bottom: 1px solid var(--basil-border);
}

.basil-dialog-txn-amount {
  font-size: 2rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--basil-text);
}

.basil-dialog-txn-amount--credit {
  color: var(--basil-positive);
}

.basil-dialog-txn-name {
  font-size: 0.9375rem;
  color: var(--basil-text-secondary);
  margin-top: var(--basil-space-1);
}

.basil-dialog-txn-subname {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
}

.basil-dialog-txn-attribution {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  margin-top: var(--basil-space-1);
}

.basil-dialog-txn-attribution--link {
  cursor: pointer;
  transition: color var(--basil-t-fast) var(--basil-ease);
}

.basil-dialog-txn-attribution--link:hover {
  color: var(--basil-text-secondary);
}

/* ── Fields ── */
.basil-dialog-fields {
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-4);
}

/* ── Toggles ── */
.basil-dialog-toggles {
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-2);
}

/* ── Section (rules) ── */
.basil-dialog-section {
  padding-top: var(--basil-space-4);
  border-top: 1px solid var(--basil-border);
}

.basil-dialog-section__label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--basil-text-muted);
  margin-bottom: var(--basil-space-2);
}

.basil-dialog-section__sublabel {
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  margin-bottom: var(--basil-space-1);
}

/* ── Hint text ── */
.basil-dialog-hint {
  font-size: 0.8125rem;
  color: var(--basil-text-muted);
  margin: var(--basil-space-1) 0 0;
  line-height: 1.5;
}

.basil-dialog-hint--warn {
  color: var(--basil-warning);
}

.basil-conflict-label {
  color: var(--basil-warning) !important;
}

/* ── Rule chips ── */
.basil-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.basil-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8125rem;
  padding: 3px 8px 3px 10px;
  border-radius: var(--basil-radius-pill);
  background-color: var(--basil-surface-alt);
  color: var(--basil-text);
  border: 1px solid var(--basil-border);
  line-height: 1.4;
}

.basil-chip--removing {
  text-decoration: line-through;
  opacity: 0.55;
}

.basil-chip--pending {
  background-color: var(--basil-green-subtle);
  color: var(--basil-income);
  border-color: var(--basil-income);
}

.basil-chip__remove {
  background: none;
  border: none;
  padding: 0 2px;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: inherit;
  opacity: 0.6;
  transition: opacity var(--basil-t-fast) var(--basil-ease);
}

.basil-chip__remove:hover {
  opacity: 1;
}

/* ── Action row ── */
.basil-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--basil-space-4);
  border-top: 1px solid var(--basil-border);
  margin-top: auto;
  flex-shrink: 0;
}

.basil-dialog-actions__right {
  display: flex;
  gap: var(--basil-space-2);
}

.basil-type-hint {
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  margin-top: calc(var(--basil-space-1) * -1);
  padding: 0 var(--basil-space-1);
}

/* ── Similarity toggle ── */
.basil-dialog-similar {
  padding: var(--basil-space-2) 0;
}

.basil-dialog-similar__hint {
  font-size: 0.75rem;
  color: var(--basil-text-muted);
  margin-top: var(--basil-space-1);
  padding-left: calc(var(--basil-space-6) + 2px);
}
</style>

<script>
  import {ref} from 'vue'
  import RelationshipCard from './RelationshipCard.vue'
  import TagPicker from './TagPicker.vue'
  import { tagTransactionsApi, untagTransactionsApi } from '@/api'
  import BasilAmount from '@/components/BasilAmount'
  import BasilText from '@/components/BasilText'
  import BasilNote from '@/components/BasilNote'

  export default {
      name: 'DialogComponent',
      components: { RelationshipCard, TagPicker, BasilAmount, BasilText, BasilNote },
      props: {
        dialogType: {
          type: String,
          required: true,
        },
        item: {
          type: Object,
          required: false,
        },
        dropDown: {
            type: Array,
            required: false,
        },
        similarityData: {
          type: Object,
          default: null,
        },
        attribution: {
          type: Object,
          default: null,
        },
        relationship: {
          type: Object,
          default: null,
        },
      },
      data(){
        // console.log('beginning of data log: ', this.item)
        return {
            maximizedToggle: ref(true),
            editedTransaction: {},
            type: ['Expense', 'Income', 'Savings', 'Payment'],
            dialogBody:{
                amount: this.item?.amount ? this.item.amount : 0 ,
                name: this.item?.name ? this.item.name : '',
                monthly_limit: this.item?.monthly_limit ? this.item.monthly_limit : 0,
                showOnBudgetPage: this.item?.showOnBudgetPage ? this.item.showOnBudgetPage : true,
                date: this.item?.date ? this.item.date : '',
                transaction_id: this.item?.transaction_id ? this.item.transaction_id : '',
                merchantName: this.item?.merchant_name ? this.item.merchant_name : '',
                mappedCategory: this.item?.mappedCategory ? this.item.mappedCategory : '',
                categoryName: this.item?.categoryName ? this.item.categoryName : '',
                originalCategoryName: this.item?.categoryName ? this.item.categoryName : this.item?.mappedCategory ? this.item.mappedCategory : '',
                note: this.item?.note ? this.item.note : '',
                excludeFromTotal: this.item?.excludeFromTotal ? this.item.excludeFromTotal : false,
                plaid_pfc: this.item?.plaid_pfc ? [...this.item.plaid_pfc] : [],
                fixed: this.item?.fixed || false,
                createRule: false,
                dialogType: this.dialogType
            },
            originalDialogBody: {},
            formSubmittable:false,
            initialData: null,
            selectedTags: (this.item?.tags || []).map(t => ({ label: t.name, value: t.id, id: t.id, name: t.name })),
            originalTags: (this.item?.tags || []).map(t => ({ label: t.name, value: t.id, id: t.id, name: t.name })),
            pendingRuleRemovals: [],
            pendingRuleAdditions: [],
            newRuleValue: null,
            filteredMerchants: [],
            splitMode: false,
            splitSaving: false,
            splitRows: [],
        };
      },

emits: ['update-transaction', 'update-category', 'add-category', 'view-rule', 'relationship-confirm', 'relationship-dismiss', 'save-split', 'unsplit'],
computed: {
    dialogSubtitle() {
        if (this.dialogType === 'editCategory') return 'Edit Category';
        return null;
    },
    dialogMainTitle() {
        if (this.dialogType === 'editCategory') return this.dialogBody.originalCategoryName;
        if (this.dialogType === 'transaction') return 'Edit Transaction';
        return 'Add Category';
    },
    hasRules() {
        const r = this.item?.rules;
        if (!r) return false;
        return ['merchant_name', 'name'].some(t => r[t]?.length > 0);
    },
    isPendingRemoval() {
        return (ruleType, ruleValue) =>
            this.pendingRuleRemovals.some(r => r.ruleType === ruleType && r.ruleValue === ruleValue);
    },
    isAlreadyRuled() {
        return (ruleValue) => {
            const existing = this.item?.rules?.merchant_name || [];
            const pending = this.pendingRuleAdditions.map(r => r.ruleValue);
            return existing.includes(ruleValue) || pending.includes(ruleValue);
        };
    },
    conflictingCategory() {
        if (!this.newRuleValue) return null;
        const merchantRuleMap = this.item?.merchantRuleMap || {};
        const currentName = this.dialogBody.originalCategoryName || this.dialogBody.categoryName;
        const assignedTo = merchantRuleMap[this.newRuleValue];
        return (assignedTo && assignedTo !== currentName) ? assignedTo : null;
    },
    dropDownOptions() {
        const options = this.dropDown.map(item => item.category);
        options.sort()
        return options
    },
    allMerchantOptions() {
        const merchants = this.item?.merchants || [];
        const merchantRuleMap = this.item?.merchantRuleMap || {};
        const currentName = this.dialogBody.originalCategoryName || this.dialogBody.categoryName;
        return merchants.map(m => {
            const assignedTo = merchantRuleMap[m];
            const conflict = (assignedTo && assignedTo !== currentName) ? assignedTo : null;
            return { value: m, conflict };
        });
    },
    actionableCount() {
        if (!this.similarityData?.matches) return 0;
        return this.similarityData.matches.filter(t =>
            t.mappedCategory !== this.dialogBody.mappedCategory && !t.manually_set
        ).length;
    },
    canSplit() {
        if (!this.item) return false;
        if (this.item.pending) return false;
        if (this.item.amount < 0) return false;
        if (this.item.parentTransactionId) return false;
        if (this.item.isSplitParent) return false;
        return this.dialogType === 'transaction';
    },
    splitRemaining() {
        const total = Number(this.item?.amount || 0);
        const used = this.splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        return Math.round((total - used) * 100) / 100;
    },
    splitValid() {
        return Math.abs(this.splitRemaining) < 0.01
            && this.splitRows.length >= 2
            && this.splitRows.every(r => r.amount > 0 && r.categoryName);
    },
    isSplitChild() {
        return !!this.item?.parentTransactionId;
    },
    parentAmount() {
        if (!this.item?.parentTransactionId) return null;
        for (const month of Object.values(this.$store.state.transactionsByMonth)) {
            const parent = month.find(t => t.id === this.item.parentTransactionId);
            if (parent) return parent.amount;
        }
        return null;
    },
  },
  methods: {
        closeTray() {
          // Close the nearest native <dialog> ancestor (BasilTray).
          // BasilTray's onNativeClose handler will emit update:modelValue = false.
          this.$el.closest('dialog')?.close();
        },
        onTransactionFormReset () {
            this.dialogBody = JSON.parse(JSON.stringify(this.initialData));
        },
        async updateTransaction() {
            // Handle tag changes directly (independent of main transaction update)
            const oldIds = new Set(this.originalTags.map(t => t.id || t.value));
            const newIds = new Set(this.selectedTags.map(t => t.id || t.value));
            const addedTagIds = [...newIds].filter(id => !oldIds.has(id));
            const removedTagIds = [...oldIds].filter(id => !newIds.has(id));
            if (addedTagIds.length) {
                await tagTransactionsApi([this.item.transaction_id], addedTagIds);
            }
            if (removedTagIds.length) {
                await untagTransactionsApi([this.item.transaction_id], removedTagIds);
            }
            if (addedTagIds.length || removedTagIds.length) {
                this.$store.commit('setTransactionTags', {
                    transactionIds: [this.item.transaction_id],
                    tags: this.selectedTags.map(t => ({ id: t.id || t.value, name: t.label || t.name })),
                });
            }
            this.editedTransaction = {...this.dialogBody, similarityData: this.similarityData}
            this.$emit('update-transaction', this.editedTransaction)
        },
        updateCategory() {
            this.editedCategory = {...this.dialogBody, '_id': this.item._id, 'type': this.item.type, 'fixed': this.dialogBody.fixed || false, pendingRuleRemovals: [...this.pendingRuleRemovals], pendingRuleAdditions: [...this.pendingRuleAdditions]}
            this.$emit('update-category', this.editedCategory)
        },
        stageRuleRemoval(ruleType, ruleValue) {
            const idx = this.pendingRuleRemovals.findIndex(r => r.ruleType === ruleType && r.ruleValue === ruleValue);
            if (idx >= 0) {
                this.pendingRuleRemovals.splice(idx, 1);
            } else {
                this.pendingRuleRemovals.push({ ruleType, ruleValue });
            }
            this.isFormSubmittable();
        },
        addPendingRule() {
            if (!this.newRuleValue || this.isAlreadyRuled(this.newRuleValue)) return;
            this.pendingRuleAdditions.push({ ruleType: 'merchant_name', ruleValue: this.newRuleValue });
            this.newRuleValue = null;
            this.isFormSubmittable();
        },
        removePendingAddition(ruleValue) {
            this.pendingRuleAdditions = this.pendingRuleAdditions.filter(r => r.ruleValue !== ruleValue);
            this.isFormSubmittable();
        },
        filterMerchants(val, update) {
            const merchants = this.item?.merchants || [];
            const merchantRuleMap = this.item?.merchantRuleMap || {};
            const currentName = this.dialogBody.originalCategoryName || this.dialogBody.categoryName;
            update(() => {
                const needle = val.toLowerCase();
                const filtered = needle
                    ? merchants.filter(m => m.toLowerCase().includes(needle))
                    : merchants;
                this.filteredMerchants = filtered.map(m => {
                    const assignedTo = merchantRuleMap[m];
                    const conflict = (assignedTo && assignedTo !== currentName) ? assignedTo : null;
                    return { value: m, conflict };
                });
            });
        },
        enterSplitMode() {
            this.splitMode = true;
            this.splitRows = [
                { amount: null, categoryName: '' },
                { amount: null, categoryName: '' },
            ];
        },
        exitSplitMode() {
            this.splitMode = false;
            this.splitSaving = false;
            this.splitRows = [];
        },
        updateSplitAmount(index, value) {
            const num = Number(value) || 0;
            const max = this.splitMaxForRow(index);
            this.splitRows[index].amount = Math.min(Math.max(num, 0), max);
        },
        updateSplitCategory(index, value) {
            this.splitRows[index].categoryName = value;
        },
        splitMaxForRow(index) {
            const total = Number(this.item.amount);
            const othersSum = this.splitRows.reduce((sum, r, i) => i === index ? sum : sum + (Number(r.amount) || 0), 0);
            return Math.round((total - othersSum) * 100) / 100;
        },
        addSplitRow() {
            this.splitRows.push({ amount: this.splitRemaining, categoryName: '' });
        },
        removeSplitRow(index) {
            if (this.splitRows.length <= 2) return;
            this.splitRows.splice(index, 1);
        },
        saveSplit() {
            if (!this.splitValid || this.splitSaving) return;
            this.splitSaving = true;
            this.$emit('save-split', {
                transaction_id: this.item.transaction_id,
                splits: this.splitRows.map(r => ({
                    amount: Number(r.amount),
                    categoryName: r.categoryName,
                    note: null,
                })),
            });
        },
        requestUnsplit() {
            this.$emit('unsplit', { transaction_id: this.item.transaction_id });
        },
        addCategory() {
            this.addedCategory = {...this.dialogBody}
            this.$emit('add-category', this.addedCategory)
        },
        buildEditCategoryDialog() {

        },
        resetData(){
            this.dialogBody = JSON.parse(JSON.stringify(this.initialData));
            this.pendingRuleRemovals = [];
            this.pendingRuleAdditions = [];
            this.newRuleValue = null;
            this.formSubmittable = false
        },
        isFormSubmittable(){
            // first evaluate for change
            if(this.dialogType == 'transaction'){
                const tagsChanged = JSON.stringify(this.selectedTags.map(t => t.id || t.value).sort()) !==
                    JSON.stringify(this.originalTags.map(t => t.id || t.value).sort());
                if(
                    this.dialogBody.date !== this.originalDialogBody.date ||
                    this.dialogBody.mappedCategory !== this.originalDialogBody.mappedCategory ||
                    this.dialogBody.note !== this.originalDialogBody.note ||
                    this.dialogBody.excludeFromTotal !== this.originalDialogBody.excludeFromTotal ||
                    this.dialogBody.createRule !== this.originalDialogBody.createRule ||
                    tagsChanged
                ){
                    this.formSubmittable = true
                }
                else{
                    this.formSubmittable = false
                }
            }

            if (this.dialogType == 'editCategory'){
                if (this.dialogBody.categoryName !== this.originalDialogBody.categoryName
                || this.dialogBody.monthly_limit !== this.originalDialogBody.monthly_limit
                || this.dialogBody.fixed !== this.originalDialogBody.fixed
                || this.pendingRuleRemovals.length > 0
                || this.pendingRuleAdditions.length > 0){
                    this.formSubmittable = true;
                }
                else{
                    this.formSubmittable = false;
                }
            }
            if (this.dialogType == 'addCategory'){
                if (this.dialogBody.categoryName !== ''
                || this.dialogBody.monthly_limit !== null){
                    this.formSubmittable = true;
                }
                else{
                    this.formSubmittable = false;
                }
            }
            return this.formSubmittable
        }
    },
    mounted(){
        this.originalDialogBody = Object.assign({}, this.dialogBody);
    },
    created() {
        this.initialData = JSON.parse(JSON.stringify(this.dialogBody));
    },
    watch: {
        "dialogBody.mappedCategory": function (){
            this.isFormSubmittable()
        },
        "dialogBody.createRule": function (){
            this.isFormSubmittable()
        }
    }
  }
</script>