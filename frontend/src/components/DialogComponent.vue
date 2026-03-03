<template>
  <q-card class="basil-dialog-card">

    <!-- ── Header ─────────────────────────────────────── -->
    <div class="basil-dialog-header">
      <div class="basil-dialog-title">
        <div v-if="dialogSubtitle" class="basil-dialog-title__sub">{{ dialogSubtitle }}</div>
        <div class="basil-dialog-title__main basil-display">{{ dialogMainTitle }}</div>
      </div>
      <q-btn flat round dense icon="close" v-close-popup class="basil-dialog-close" />
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
        <div class="basil-dialog-txn-name">{{ dialogBody.merchantName || dialogBody.name }}</div>
        <div
          v-if="dialogBody.merchantName && dialogBody.merchantName !== dialogBody.name"
          class="basil-dialog-txn-subname"
        >{{ dialogBody.name }}</div>
      </div>

      <div class="basil-dialog-fields">
        <q-input
          type="date"
          outlined
          v-model="dialogBody.date"
          label="Date"
          @change="isFormSubmittable()"
        />
        <q-select
          outlined
          v-model="dialogBody.mappedCategory"
          label="Category"
          :options="dropDownOptions"
          @touchmove.stop.prevent
        />
        <q-input
          type="text"
          outlined
          v-model="dialogBody.note"
          label="Note"
          @change="isFormSubmittable()"
        />
      </div>

      <div class="basil-dialog-toggles">
        <q-toggle
          color="primary"
          label="Exclude from total"
          v-model="dialogBody.excludeFromTotal"
          @click="excludeFromTotal = !excludeFromTotal, isFormSubmittable()"
        />
        <q-toggle
          v-if="dialogBody.merchantName || dialogBody.name"
          color="primary"
          v-model="dialogBody.createRule"
          :label="'Remember category for ' + (dialogBody.merchantName || dialogBody.name)"
        />
        <p v-if="dialogBody.createRule" class="basil-dialog-hint">
          All existing transactions from <strong>{{ dialogBody.merchantName || dialogBody.name }}</strong>
          will be moved to <strong>{{ dialogBody.mappedCategory }}</strong>, and future ones assigned automatically.
        </p>
      </div>

      <div class="basil-dialog-actions">
        <q-btn flat label="Cancel" v-close-popup />
        <div class="basil-dialog-actions__right">
          <q-btn flat label="Reset" @click="resetData()" />
          <q-btn unelevated label="Submit" color="primary" :disable="!formSubmittable" @click="updateTransaction" />
        </div>
      </div>
    </div>

    <!-- ── EDIT CATEGORY form ─────────────────────────── -->
    <div v-if="dialogType === 'editCategory'" class="basil-dialog-body">

      <div class="basil-dialog-fields">
        <q-input
          outlined
          v-model="dialogBody.categoryName"
          label="Category Name"
          :rules="[val => val && val.length > 0 || 'Please type something']"
          @change="isFormSubmittable()"
        />
        <q-input
          outlined
          type="number"
          v-model="dialogBody.monthly_limit"
          label="Monthly Limit"
          :rules="[val => val !== null && val !== '' || 'Please enter a monthly limit']"
          @change="isFormSubmittable()"
        />
        <q-select
          outlined
          v-model="dialogBody.plaid_pfc"
          label="Auto-map Plaid transaction types"
          :options="plaidPfcOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          multiple
          use-chips
          hint="Transactions Plaid labels with these types will be auto-assigned to this category."
          class="q-mt-xs"
          @update:model-value="isFormSubmittable()"
        />
      </div>

      <!-- Existing rules -->
      <div v-if="hasRules" class="basil-dialog-section">
        <div class="basil-dialog-section__label">Auto-learn rules</div>
        <div v-for="ruleType in ['merchant_name', 'name']" :key="ruleType">
          <div v-if="item.rules && item.rules[ruleType] && item.rules[ruleType].length" class="q-mb-xs">
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
        <div class="row items-center q-gutter-sm">
          <q-select
            v-model="newRuleValue"
            :options="filteredMerchants"
            option-value="value"
            option-label="value"
            emit-value
            map-options
            label="Search merchants…"
            dense
            outlined
            use-input
            hide-selected
            fill-input
            input-debounce="0"
            @filter="filterMerchants"
            @touchmove.stop.prevent
            class="col"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.value }}</q-item-label>
                  <q-item-label v-if="scope.opt.conflict" caption class="basil-conflict-label">
                    currently: {{ scope.opt.conflict }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <q-btn dense flat icon="add" color="primary" :disable="!newRuleValue || isAlreadyRuled(newRuleValue)" @click="addPendingRule" />
        </div>
        <p v-if="conflictingCategory" class="basil-dialog-hint basil-dialog-hint--warn">
          "{{ newRuleValue }}" is currently assigned to <strong>{{ conflictingCategory }}</strong>.
          Adding it here will move it and re-categorize all matching transactions.
        </p>
        <div v-if="pendingRuleAdditions.length" class="basil-chips q-mt-xs">
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
        <q-btn flat label="Cancel" v-close-popup />
        <div class="basil-dialog-actions__right">
          <q-btn flat label="Reset" @click="resetData()" />
          <q-btn unelevated label="Submit" color="primary" :disable="!formSubmittable" @click="updateCategory" />
        </div>
      </div>
    </div>

    <!-- ── ADD CATEGORY form ──────────────────────────── -->
    <div v-if="dialogType === 'addCategory'" class="basil-dialog-body">

      <div class="basil-dialog-fields">
        <q-input
          outlined
          v-model="dialogBody.categoryName"
          label="Category Name"
          :rules="[val => val && val.length > 0 || 'Please type something']"
          @change="isFormSubmittable()"
        />
        <q-input
          outlined
          type="number"
          v-model="dialogBody.monthly_limit"
          label="Monthly Limit"
          :rules="[val => val !== null && val !== '' || 'Please enter a monthly limit']"
          @change="isFormSubmittable()"
        />
        <q-select
          outlined
          v-model="dialogBody.type"
          label="Category Type"
          :options="type"
          @touchmove.stop.prevent
        />
        <q-select
          outlined
          v-model="dialogBody.plaid_pfc"
          label="Auto-map Plaid transaction types"
          :options="plaidPfcOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          multiple
          use-chips
          hint="Transactions Plaid labels with these types will be auto-assigned to this category."
          class="q-mt-xs"
        />
      </div>

      <div class="basil-dialog-actions">
        <q-btn flat label="Cancel" v-close-popup />
        <div class="basil-dialog-actions__right">
          <q-btn flat label="Reset" @click="resetData()" />
          <q-btn unelevated label="Submit" color="primary" :disable="!formSubmittable" @click="addCategory" />
        </div>
      </div>
    </div>

  </q-card>
</template>

<style scoped>
/* ── Card ── */
.basil-dialog-card {
  background-color: var(--basil-surface-dialog) !important;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* ── Header ── */
.basil-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--basil-space-4) var(--basil-space-5);
  border-bottom: 1px solid var(--basil-border);
  flex-shrink: 0;
}

.basil-dialog-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.basil-dialog-title__sub {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--basil-text-muted);
  line-height: 1;
}

.basil-dialog-title__main {
  font-size: 1.25rem;
  color: var(--basil-text);
  line-height: 1.1;
  letter-spacing: -0.01em;
}

.basil-dialog-close {
  color: var(--basil-text-muted) !important;
}

/* ── Body ── */
.basil-dialog-body {
  padding: var(--basil-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-4);
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

/* ── Fields ── */
.basil-dialog-fields {
  display: flex;
  flex-direction: column;
  gap: var(--basil-space-3);
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
</style>

<script>
  import {ref} from 'vue'

  const PLAID_PFC_OPTIONS = [
    { label: 'Income',                   value: 'INCOME' },
    { label: 'Transfer In',              value: 'TRANSFER_IN' },
    { label: 'Transfer Out',             value: 'TRANSFER_OUT' },
    { label: 'Loan Payments',            value: 'LOAN_PAYMENTS' },
    { label: 'Bank Fees',                value: 'BANK_FEES' },
    { label: 'Food & Drink',             value: 'FOOD_AND_DRINK' },
    { label: 'General Merchandise',      value: 'GENERAL_MERCHANDISE' },
    { label: 'Home Improvement',         value: 'HOME_IMPROVEMENT' },
    { label: 'Medical',                  value: 'MEDICAL' },
    { label: 'Personal Care',            value: 'PERSONAL_CARE' },
    { label: 'General Services',         value: 'GENERAL_SERVICES' },
    { label: 'Government & Non-profit',  value: 'GOVERNMENT_AND_NON_PROFIT' },
    { label: 'Entertainment',            value: 'ENTERTAINMENT' },
    { label: 'Travel',                   value: 'TRAVEL' },
    { label: 'Transportation',           value: 'TRANSPORTATION' },
    { label: 'Rent & Utilities',         value: 'RENT_AND_UTILITIES' },
  ];

  export default {
      name: 'DialogComponent',
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
        }
      },
      data(){
        // console.log('beginning of data log: ', this.item)
        return {
            maximizedToggle: ref(true),
            editedTransaction: {},
            type: ['Expense', 'Income', 'Savings'],
            plaidPfcOptions: PLAID_PFC_OPTIONS,
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
                createRule: false,
                dialogType: this.dialogType
            },
            originalDialogBody: {},
            formSubmittable:false,
            initialData: null,
            pendingRuleRemovals: [],
            pendingRuleAdditions: [],
            newRuleValue: null,
            filteredMerchants: [],
        };
      },
      
emits: ['update-transaction', 'update-category', 'add-category'],
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
        // let dropDown = this.dropDown
        const options = this.dropDown.map(item => item.category);

        // console.log('dropDownOptions =',this.dropDown)
        // console.log('options =',options)
        options.sort()
        return options
    }
  },
  methods: {
        onTransactionFormReset () {
            this.dialogBody = JSON.parse(JSON.stringify(this.initialData));
        },
        updateTransaction() {
            this.editedTransaction = {...this.dialogBody}
            // console.log('updateTransaction: edited Transaction: ', this.editedTransaction)
            this.$emit('update-transaction', this.editedTransaction)
        },
        updateCategory() {
            this.editedCategory = {...this.dialogBody, '_id': this.item._id, 'type': this.item.type, pendingRuleRemovals: [...this.pendingRuleRemovals], pendingRuleAdditions: [...this.pendingRuleAdditions]}
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
        addCategory() {
            this.addedCategory = {...this.dialogBody}
            console.log('add-Category: added Category: ', this.addedCategory)
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
            console.log('excludeFromTotal, ', this.dialogBody.excludeFromTotal, this.originalDialogBody.excludeFromTotal )
            // first evaluate for change
            if(this.dialogType == 'transaction'){
                if(
                    this.dialogBody.date !== this.originalDialogBody.date ||
                    this.dialogBody.mappedCategory !== this.originalDialogBody.mappedCategory || 
                    this.dialogBody.note !== this.originalDialogBody.note ||
                    this.dialogBody.excludeFromTotal !== this.originalDialogBody.excludeFromTotal 
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
                || JSON.stringify(this.dialogBody.plaid_pfc) !== JSON.stringify(this.originalDialogBody.plaid_pfc)
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
        console.log('mounted(): this.item ', this.item)
    },
    created() {
        this.initialData = JSON.parse(JSON.stringify(this.dialogBody));
        console.log('created child component dialog', this.originalDialogBody)
    },
    watch: {
        "dialogBody.mappedCategory": function (){
            this.isFormSubmittable()
        },
        "dialogBody.plaid_pfc": function (){
            this.isFormSubmittable()
        }
    }
  }
</script>