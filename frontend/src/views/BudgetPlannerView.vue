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
      <q-btn unelevated color="primary" label="Go to Profile" to="/profile" class="q-mt-sm" />
    </EmptyState>

    <div v-else>

      <!-- Not onboarded — push to onboarding -->
      <div v-if="!isOnboarded" class="q-mb-md">
        <q-card class="my-card basil-setup-card">
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
          <q-btn unelevated color="primary" label="Set up Basil" to="/onboarding" class="q-mt-md" />
        </q-card>
      </div>

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
            <q-input
              v-model="addName"
              placeholder="Category name"
              dense outlined
              class="basil-planner-add-name"
              @keyup.enter="confirmAdd(sectionType)"
              @keyup.esc="cancelAdd"
            />
            <q-input
              v-model.number="addLimit"
              type="number"
              placeholder="Monthly limit"
              dense outlined
              class="basil-planner-add-limit"
              @keyup.enter="confirmAdd(sectionType)"
              @keyup.esc="cancelAdd"
              min="0"
            />
            <q-btn flat round dense icon="check" color="positive" :loading="addLoading" @click="confirmAdd(sectionType)" />
            <q-btn flat round dense icon="close" @click="cancelAdd" />
          </div>
        </div>

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
import { ensureAppData, updateBudgetLimit, handleDialogSubmit, deleteCategory, fetchMerchants } from '@/api';
import { DEFAULT_CATEGORIES } from '@/utils/defaultCategories';
import store from '../store';

const SECTION_ORDER = ['income', 'expense', 'savings', 'payment'];
const DEFAULT_NAMES = new Set(DEFAULT_CATEGORIES.map(c => c.category));

export default {
  name: 'BudgetPlannerView',
  components: { EmptyState, BasilConfirmTray, BasilTray, DialogComponent, SwipeReveal },

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
