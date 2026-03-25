<style src="../styles/BudgetPlannerView.css"></style>

<template>
  <div class="basil-planner-wrapper q-pa-md">

    <!-- Not logged in -->
    <EmptyState
      v-if="!isLoggedIn"
      icon="lock_open"
      heading="Sign in to plan your budget"
      body="Set income targets, spending limits, and savings goals."
    >
      <BasilButton label="Go to Profile" to="/profile" class="q-mt-sm" />
    </EmptyState>

    <div v-else>

      <!-- Not onboarded — push to onboarding -->
      <div v-if="!isOnboarded" class="q-mb-md">
        <BasilCard class="my-card basil-setup-card">
          <div class="basil-card-head">
            <span class="basil-card-label">Get started</span>
          </div>
          <div class="basil-setup-card__body">
            <q-icon name="auto_awesome" color="primary" size="2rem" />
            <div>
              <div class="basil-setup-card__heading">Set up Basil</div>
              <div class="basil-setup-card__hint">Connect your bank and configure your budget in a few quick steps.</div>
            </div>
          </div>
          <BasilButton label="Set up Basil" to="/onboarding" class="q-mt-md" />
        </BasilCard>
      </div>

      <!-- First-time setup choice -->
      <template v-else-if="isFirstTimeSetup && !guidedMode">
        <div style="text-align: center; padding: var(--basil-space-7) var(--basil-space-5);">
          <h2 class="basil-display" style="font-size: 1.75rem; margin: 0 0 var(--basil-space-3);">Set up your budget</h2>
          <p style="color: var(--basil-text-secondary); margin: 0 0 var(--basil-space-5);">Choose how you'd like to get started.</p>
          <BasilButton label="Guided setup" class="q-mb-md" style="min-width: 200px;" @click="startGuidedSetup()" />
          <div>
            <a href="#" style="color: var(--basil-text-muted); font-size: 0.875rem;" @click.prevent="dismissGuidedSetup()">I'll do it myself</a>
          </div>
        </div>
      </template>

      <!-- Guided setup flow -->
      <template v-else-if="guidedMode">
        <!-- Step 1: Income -->
        <div v-if="guidedStep === 1" style="max-width: 500px; margin: 0 auto; padding: var(--basil-space-5);">
          <h2 class="basil-display" style="font-size: 1.5rem; margin: 0 0 var(--basil-space-3);">What's your monthly income?</h2>
          <BasilAmount
            :model-value="guidedIncome"
            @update:model-value="guidedIncome = $event"
            label="Monthly income" :hint="incomeHint"
          />
          <div style="display: flex; justify-content: flex-end; margin-top: var(--basil-space-4);">
            <BasilButton label="Next" :disabled="!guidedIncome || guidedIncome <= 0" @click="guidedStep = 2" />
          </div>
        </div>

        <!-- Step 2: Category limits -->
        <div v-if="guidedStep === 2" style="max-width: 500px; margin: 0 auto; padding: var(--basil-space-5);">
          <h2 class="basil-display" style="font-size: 1.5rem; margin: 0 0 var(--basil-space-3);">Set your spending limits</h2>
          <div style="display: flex; flex-direction: column; gap: var(--basil-space-3);">
            <div v-for="cat in guidedCategories" :key="cat.category">
              <BasilAmount
                :model-value="guidedLimits[cat.category]"
                @update:model-value="guidedLimits[cat.category] = $event"
                :label="cat.category" :hint="cat.spendingHint"
              />
            </div>
          </div>

          <!-- Sticky footer -->
          <div class="basil-guided-footer">
            <div style="max-width: 500px; margin: 0 auto;">
              <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: 600; color: var(--basil-text); margin-bottom: var(--basil-space-3);">
                <span>Total limits</span>
                <span class="basil-mono">${{ guidedTotal.toLocaleString() }} / ${{ Number(guidedIncome || 0).toLocaleString() }}</span>
              </div>
              <div style="display: flex; gap: var(--basil-space-2); justify-content: space-between;">
                <BasilButton variant="flat" label="Back" @click="guidedStep = 1" />
                <div style="display: flex; gap: var(--basil-space-2);">
                  <BasilButton variant="flat" label="Skip" @click="dismissGuidedSetup()" />
                  <BasilButton label="Start budgeting" :loading="guidedSaving" :disabled="guidedSaving" @click="saveGuidedSetup()" />
                </div>
              </div>
            </div>
          </div>
          <!-- Spacer so content isn't hidden behind fixed footer -->
          <div style="height: 120px;"></div>
        </div>
      </template>

      <!-- Normal plan view -->
      <div v-else class="basil-planner-content">

        <!-- ── Summary bar ── -->
        <div class="basil-planner-summary">
          <div class="basil-planner-summary__cell">
            <div class="basil-planner-summary__amount basil-display basil-planner-summary__amount--income">
              ${{ summaryIncome.toLocaleString() }}
            </div>
            <div class="basil-planner-summary__label">Income</div>
            <div class="basil-planner-summary__sublabel">planned</div>
          </div>
          <div class="basil-planner-summary__cell">
            <div class="basil-planner-summary__amount basil-display basil-planner-summary__amount--expense">
              ${{ summaryExpenses.toLocaleString() }}
            </div>
            <div class="basil-planner-summary__label">Expenses</div>
            <div class="basil-planner-summary__sublabel">budgeted</div>
          </div>
          <div class="basil-planner-summary__cell">
            <div class="basil-planner-summary__amount basil-display basil-planner-summary__amount--savings">
              ${{ summarySavings.toLocaleString() }}
            </div>
            <div class="basil-planner-summary__label">Savings</div>
            <div class="basil-planner-summary__sublabel">goal</div>
          </div>
          <div class="basil-planner-summary__cell">
            <div :class="['basil-planner-summary__amount basil-display', summaryNet >= 0 ? 'basil-planner-summary__amount--positive' : 'basil-planner-summary__amount--negative']">
              {{ summaryNet >= 0 ? '+' : '−' }}${{ Math.abs(summaryNet).toLocaleString() }}
            </div>
            <div class="basil-planner-summary__label">Net</div>
            <div class="basil-planner-summary__sublabel">{{ summaryNet >= 0 ? 'surplus' : 'deficit' }}</div>
          </div>
        </div>

        <!-- ── Sections ── -->
        <div
          v-for="sectionType in SECTION_ORDER"
          :key="sectionType"
          class="basil-planner-section"
        >
          <div class="basil-planner-section__header">
            <span class="basil-planner-section__label">{{ sectionLabels[sectionType] }}</span>
            <span class="basil-planner-section__total basil-mono">${{ sectionTotal(sectionType).toLocaleString() }}</span>
          </div>

          <!-- Empty section hint -->
          <div
            v-if="!categoriesByType[sectionType] || categoriesByType[sectionType].length === 0"
            class="basil-planner-section__empty-msg"
          >
            No {{ sectionLabels[sectionType].toLowerCase() }} categories yet
          </div>

          <!-- Category rows -->
          <SwipeReveal
            v-for="cat in categoriesByType[sectionType]"
            :key="cat._id"
            :disabled="!isUserCreated(cat)"
            @action="removeCategory(cat)"
          >
            <div :class="['basil-planner-row', `basil-planner-row--${sectionType}`]" @click="openEditCategory(cat)" style="cursor: pointer">
              <!-- Name cell -->
              <div class="basil-planner-row__name-cell">
                <span class="basil-planner-row__name">{{ cat.category }}</span>
              </div>

              <!-- Amount display -->
              <div class="basil-planner-row__controls">
                <span class="basil-planner-row__amount basil-mono">
                  ${{ (Number(cat.monthly_limit) || 0).toLocaleString() }}
                </span>
                <q-icon
                  v-if="isUserCreated(cat)"
                  name="delete_outline"
                  size="16px"
                  class="basil-planner-delete-icon gt-xs"
                  :class="{ 'basil-planner-delete-icon--loading': deletingId === cat._id }"
                  @click.stop="removeCategory(cat)"
                />
              </div>
            </div>
          </SwipeReveal>

          <!-- Add category row / inline form -->
          <div
            v-if="addingType !== sectionType"
            class="basil-planner-add-row"
            @click="startAdd(sectionType)"
          >
            <q-icon name="add" size="16px" />
            <span>Add {{ sectionLabels[sectionType].toLowerCase() }} category</span>
          </div>
          <div v-else class="basil-planner-add-form">
            <BasilText v-model="addName" placeholder="Category name" dense @submit="confirmAdd(sectionType)" />
            <BasilAmount v-model="addLimit" placeholder="Monthly limit" dense @submit="confirmAdd(sectionType)" />
            <BasilButton variant="icon" icon="check" color="positive" dense :loading="addLoading" @click="confirmAdd(sectionType)" />
            <BasilButton variant="icon" icon="close" dense @click="cancelAdd" />
          </div>
        </div>

      </div>

      <!-- Guided setup re-entry -->
      <div v-if="!guidedMode && !isFirstTimeSetup" style="text-align: center; padding: var(--basil-space-5) 0;">
        <a href="#" style="color: var(--basil-text-muted); font-size: 0.8125rem; text-decoration: none;" @click.prevent="reenterGuidedSetup()">Help me set up my budget</a>
      </div>
    </div>

    <!-- Edit category dialog -->
    <BasilTray v-model="editCatDialogOpen">
      <DialogComponent
        v-if="editCatItem"
        :dialogType="'editCategory'"
        :item="editCatItem"
        :dropDown="$store.state.categories"
        @update-category="onEditCategorySubmit"
      />
    </BasilTray>

    <BasilConfirmTray
      v-model="removeCatDialog"
      :title="`Remove &quot;${removeCatTarget?.category}&quot;?`"
      message="Existing transactions will keep this category label."
      ok-label="Remove"
      ok-color="negative"
      cancel-label="Keep"
      @confirm="executeRemoveCategory"
    />

  </div>
</template>

<script>
import EmptyState from '../components/EmptyState.vue';
import BasilConfirmTray from '../components/BasilConfirmTray.vue';
import BasilTray from '../components/BasilTray.vue';
import DialogComponent from '../components/DialogComponent.vue';
import SwipeReveal from '../components/SwipeReveal.vue';
import BasilAmount from '@/components/BasilAmount';
import BasilText from '@/components/BasilText';
import { ensureAppData, updateBudgetLimit, handleDialogSubmit, deleteCategory, fetchMerchants, updatePreferences, fetchCategories } from '@/api';
import { formatWithCommas, parseAmount, getLastMonthKey, getCurrentMonthKey } from '@/utils/budgetSetup';
import { DEFAULT_CATEGORIES } from '@/utils/defaultCategories';
import store from '../store';

const SECTION_ORDER = ['income', 'expense', 'savings', 'payment'];
const DEFAULT_NAMES = new Set(DEFAULT_CATEGORIES.map(c => c.category));

export default {
  name: 'BudgetPlannerView',
  components: { EmptyState, BasilConfirmTray, BasilTray, DialogComponent, SwipeReveal, BasilAmount, BasilText },

  data() {
    return {
      SECTION_ORDER,
      sectionLabels: {
        income:  'Income',
        expense: 'Expenses',
        savings: 'Savings',
        payment: 'Payments',
      },

      // Inline amount editing
      editingId: null,
      editValue: 0,
      savingId: null,
      activeInputRef: null,

      // Inline name editing
      editingNameId: null,
      editNameValue: '',
      savingNameId: null,
      activeNameInputRef: null,

      // Delete
      deletingId: null,
      removeCatDialog: false,
      removeCatTarget: null,

      // Add category form
      addingType: null,
      addName: '',
      addLimit: 0,
      addLoading: false,

      // Edit category dialog
      editCatDialogOpen: false,
      editCatItem: null,
      editCatDialogBody: {},

      // Guided setup
      guidedMode: false,
      guidedStep: 1, // 1 = income, 2 = categories
      guidedIncome: null,
      guidedLimits: {},
      guidedSaving: false,
    };
  },

  async mounted() {
    await ensureAppData(store);
  },

  computed: {
    isLoggedIn() {
      return !!this.$store.state.session;
    },
    isOnboarded() {
      return !!this.$store.state.user?.onboarded_at;
    },
    categoriesByType() {
      const cats = this.$store.state.categories || [];
      const grouped = {};
      for (const type of SECTION_ORDER) grouped[type] = [];
      for (const cat of cats) {
        if (grouped[cat.type]) grouped[cat.type].push(cat);
      }
      return grouped;
    },
    summaryIncome()   { return this.sectionTotal('income'); },
    summaryExpenses() { return this.sectionTotal('expense'); },
    summarySavings()  { return this.sectionTotal('savings'); },
    summaryNet() {
      return this.summaryIncome - this.summaryExpenses - this.summarySavings;
    },
    isFirstTimeSetup() {
      const categories = this.$store.state.categories || [];
      const hasAnyLimit = categories.some(c => c.type === 'expense' && Number(c.monthly_limit) > 0);
      const dismissed = this.$store.state.user?.preferences?.dismissed_budget_setup;
      return !hasAnyLimit && !dismissed;
    },
    incomeHint() {
      const categories = this.$store.state.categories || [];
      const incomeCat = categories.find(c => c.type === 'income');
      if (!incomeCat) return null;
      const now = new Date();
      // Check last month
      const lastMonth = getLastMonthKey(now);
      const txns = this.$store.state.transactionsByMonth[lastMonth] || [];
      const incomeTotal = txns.filter(t => t.mappedCategory === incomeCat.category).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      if (incomeTotal > 0) return `You received $${Math.round(incomeTotal).toLocaleString()} last month`;
      // Fall back to current month
      const currentMonth = getCurrentMonthKey(now);
      const currentTxns = this.$store.state.transactionsByMonth[currentMonth] || [];
      const currentIncome = currentTxns.filter(t => t.mappedCategory === incomeCat.category).reduce((sum, t) => sum + Math.abs(t.amount), 0);
      if (currentIncome > 0) return `$${Math.round(currentIncome).toLocaleString()} received so far this month`;
      return null;
    },
    guidedCategories() {
      const categories = this.$store.state.categories || [];
      const expense = categories.filter(c => (c.type === 'expense' || c.type === 'savings') && c.category !== 'To Sort');
      const txns = this.$store.state.transactions || [];
      const spending = {};
      txns.forEach(t => {
        if (t.amount > 0 && t.mappedCategory) {
          spending[t.mappedCategory] = (spending[t.mappedCategory] || 0) + t.amount;
        }
      });
      const withSpending = expense.filter(c => spending[c.category] > 0)
        .sort((a, b) => (spending[b.category] || 0) - (spending[a.category] || 0))
        .map(c => ({ ...c, spendingHint: `$${Math.round(spending[c.category]).toLocaleString()} spent recently` }));
      const withoutSpending = expense.filter(c => !spending[c.category])
        .map(c => ({ ...c, spendingHint: null }));
      return [...withSpending, ...withoutSpending];
    },
    guidedTotal() {
      return Object.values(this.guidedLimits).reduce((sum, v) => sum + (Number(v) || 0), 0);
    },
  },

  methods: {
    sectionTotal(type) {
      const cats = this.categoriesByType[type] || [];
      return cats.reduce((sum, c) => sum + (Number(c.monthly_limit) || 0), 0);
    },

    // ── Inline amount edit ─────────────────────────────
    startEdit(cat) {
      this.cancelEditName();
      this.editingId = cat._id;
      this.editValue = Number(cat.monthly_limit) || 0;
      this.$nextTick(() => {
        this.activeInputRef?.$el?.querySelector('input')?.select();
      });
    },
    cancelEdit() {
      this.editingId = null;
      this.editValue = 0;
      this.activeInputRef = null;
    },
    onBlur(cat) {
      this.saveLimit(cat);
    },
    async saveLimit(cat) {
      if (this.editingId !== cat._id) return;
      const newLimit = Number(this.editValue) || 0;
      const oldId = cat._id;
      this.editingId = null;
      this.activeInputRef = null;
      if (newLimit === (Number(cat.monthly_limit) || 0)) return;
      this.savingId = oldId;
      const ok = await updateBudgetLimit(oldId, newLimit);
      this.savingId = null;
      if (ok) store.commit('updateCategoryLimit', { categoryId: oldId, monthly_limit: newLimit });
    },

    // ── Inline name edit ───────────────────────────────
    startEditName(cat) {
      this.cancelEdit();
      this.editingNameId = cat._id;
      this.editNameValue = cat.category;
      this.$nextTick(() => {
        this.activeNameInputRef?.$el?.querySelector('input')?.select();
      });
    },
    cancelEditName() {
      this.editingNameId = null;
      this.editNameValue = '';
      this.activeNameInputRef = null;
    },
    onNameBlur(cat) {
      this.saveName(cat);
    },
    async saveName(cat) {
      if (this.editingNameId !== cat._id) return;
      if (this.savingNameId === cat._id) return; // already saving, ignore blur double-fire
      const newName = (this.editNameValue || '').trim();
      const oldId = cat._id;
      const oldName = cat.category;
      if (!newName || newName === oldName) {
        this.cancelEditName();
        return;
      }
      // Keep input visible with loading spinner until save completes
      this.savingNameId = oldId;
      const payload = {
        updateType: 'editCategory',
        _id: oldId,
        categoryName: newName,
        originalCategoryName: oldName,
        monthly_limit: Number(cat.monthly_limit) || 0,
        showOnBudgetPage: cat.showOnBudgetPage !== false,
        plaid_pfc: cat.plaid_pfc || [],
        fixed: cat.fixed || false,
      };
      const data = await handleDialogSubmit(JSON.stringify(payload));
      this.savingNameId = null;
      this.editingNameId = null;
      this.activeNameInputRef = null;
      if (data) store.commit('updateCategory', data);
    },


    openEditCategory(cat) {
      const merchantRuleMap = {};
      (this.$store.state.categories || []).forEach(c => {
        (c.rules?.merchant_name || []).forEach(m => { merchantRuleMap[m] = c.category; });
      });
      this.editCatItem = {
        _id: cat._id,
        type: cat.type,
        monthly_limit: cat.monthly_limit,
        categoryName: cat.category,
        showOnBudgetPage: cat.showOnBudgetPage !== false,
        fixed: cat.fixed || false,
        plaid_pfc: cat.plaid_pfc || [],
        rules: cat.rules || {},
        merchants: [],
        merchantRuleMap,
        originalCategoryName: cat.category,
      };
      this.editCatDialogBody = { ...this.editCatItem };
      fetchMerchants().then(list => {
        if (list && this.editCatItem) this.editCatItem.merchants = list;
      });
      this.editCatDialogOpen = true;
    },

    async onEditCategorySubmit(e) {
      const d = {
        updateType: 'editCategory',
        _id: e._id,
        categoryName: e.categoryName,
        originalCategoryName: this.editCatItem.originalCategoryName || e.categoryName,
        monthly_limit: e.monthly_limit,
        showOnBudgetPage: e.showOnBudgetPage !== false,
        plaid_pfc: e.plaid_pfc || [],
        fixed: e.fixed || false,
        pendingRuleRemovals: e.pendingRuleRemovals || [],
        pendingRuleAdditions: e.pendingRuleAdditions || [],
      };
      const data = await handleDialogSubmit(JSON.stringify(d));
      if (data) store.commit('updateCategory', data);
      this.editCatDialogOpen = false;
      this.editCatItem = null;
    },

    // ── Guided setup ────────────────────────────────
    formatWithCommas,
    parseAmount,
    reenterGuidedSetup() {
      this.guidedMode = true;
      this.guidedStep = 1;
      this.guidedLimits = {};
      // Pre-fill income from existing limit if set
      const categories = this.$store.state.categories || [];
      const incomeCat = categories.find(c => c.type === 'income');
      this.guidedIncome = incomeCat && Number(incomeCat.monthly_limit) > 0 ? Number(incomeCat.monthly_limit) : null;
    },
    async startGuidedSetup() {
      this.guidedMode = true;
      this.guidedStep = 1;
      this.guidedLimits = {};
      await updatePreferences({ budget_setup_mode: 'guided' });
      this.$store.commit('updatePreferences', { budget_setup_mode: 'guided' });
    },
    async dismissGuidedSetup() {
      const prefs = { dismissed_budget_setup: true, dismissed_budget_nudge: true };
      if (!this.$store.state.user.preferences?.budget_setup_mode) {
        prefs.budget_setup_mode = 'manual';
      }
      await updatePreferences(prefs);
      this.$store.commit('updatePreferences', prefs);
      this.guidedMode = false;
    },
    async saveGuidedSetup() {
      if (this.guidedSaving) return;
      this.guidedSaving = true;
      try {
        const categories = this.$store.state.categories || [];
        const saves = [];

        // Save income limit
        const incomeCat = categories.find(c => c.type === 'income');
        if (incomeCat && this.guidedIncome > 0) {
          saves.push(updateBudgetLimit(incomeCat._id || incomeCat.id, Number(this.guidedIncome)));
        }

        // Save category limits in parallel
        for (const [catName, limit] of Object.entries(this.guidedLimits)) {
          if (limit > 0) {
            const cat = categories.find(c => c.category === catName);
            if (cat) {
              saves.push(updateBudgetLimit(cat._id || cat.id, Number(limit)));
            }
          }
        }

        await Promise.all(saves);

        // Mark setup complete
        const prefs = { budget_setup_completed_at: new Date().toISOString(), dismissed_budget_setup: true };
        await updatePreferences(prefs);
        this.$store.commit('updatePreferences', prefs);

        // Refresh categories in store and navigate to budget
        const updatedCats = await fetchCategories();
        if (updatedCats) this.$store.commit('setCategories', updatedCats);
        this.$router.push('/budget');
      } finally {
        this.guidedSaving = false;
      }
    },

    isUserCreated(cat) {
      // Prefer isDefault flag (set at seed time); fall back to name matching for older accounts
      if (cat.isDefault != null) return !cat.isDefault;
      return !DEFAULT_NAMES.has(cat.category);
    },

    // ── Delete category ────────────────────────────────
    removeCategory(cat) {
      this.removeCatTarget = cat;
      this.removeCatDialog = true;
    },
    async executeRemoveCategory() {
      const cat = this.removeCatTarget;
      if (!cat) return;
      this.deletingId = cat._id;
      const ok = await deleteCategory(cat._id);
      this.deletingId = null;
      this.removeCatDialog = false;
      if (ok) store.commit('removeCategory', cat._id);
    },

    // ── Add category ──────────────────────────────────
    startAdd(type) {
      this.addingType = type;
      this.addName = '';
      this.addLimit = 0;
    },
    cancelAdd() {
      this.addingType = null;
    },
    async confirmAdd(type) {
      const name = (this.addName || '').trim();
      if (!name) return;
      this.addLoading = true;
      const randomId = 'client_id_' + Math.random().toString(36).substring(2, 12);
      const payload = {
        updateType: 'addCategory',
        categoryName: name,
        monthly_limit: Number(this.addLimit) || 0,
        type,
        showOnBudgetPage: true,
        plaid_pfc: [],
        client_id: randomId,
        originalCategoryName: name,
      };
      try {
        const data = await handleDialogSubmit(JSON.stringify(payload));
        if (data) store.commit('addCategory', data);
      } finally {
        this.addLoading = false;
        this.addingType = null;
      }
    },

  },
};
</script>
