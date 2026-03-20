<style src="../styles/OnboardingView.css"></style>

<template>
  <div class="basil-onboarding-page">

    <!-- Steps 1 and 2a (sync) live inside the card -->
    <div v-if="!(currentStep === 2 && syncDone)" class="basil-onboarding-card">

      <!-- Progress dots -->
      <div class="basil-onboarding-dots">
        <div
          v-for="n in 2"
          :key="n"
          class="basil-onboarding-dot"
          :class="{ 'basil-onboarding-dot--active': n === currentStep }"
        />
      </div>

      <!-- Step 1: Connect bank(s) -->
      <div v-if="currentStep === 1" class="basil-onboarding-step">

        <!-- Default state: connect prompt -->
        <template v-if="!linking && linkedInstitutions.length === 0">
          <h1 class="basil-onboarding-heading">Welcome to Basil</h1>
          <p class="basil-onboarding-body">
            Link your accounts to see where your money goes. Basil sorts your transactions and learns how you budget.
          </p>
          <q-btn
            unelevated
            color="primary"
            label="Connect account"
            icon="account_balance"
            class="basil-onboarding-cta"
            @click="startPlaidLink"
          />
          <div class="basil-onboarding-skip">
            <a href="#" @click.prevent="skipToApp">Skip for now →</a>
          </div>
          <div style="font-size: 0.75rem; color: var(--basil-text-muted); max-width: 260px; text-align: center; margin-top: var(--basil-space-3); line-height: 1.5">
            Your bank sends data directly to this server. Nothing is shared with anyone else.
          </div>
        </template>

        <!-- Linking in progress -->
        <template v-else-if="linking">
          <div class="basil-onboarding-linking">
            <q-spinner color="primary" size="2.5rem" />
            <h2 class="basil-onboarding-heading">Connecting your account</h2>
            <p class="basil-onboarding-body">
              Syncing your account details — this may take a moment.
            </p>
          </div>
        </template>

        <!-- Account(s) connected — add another or proceed -->
        <template v-else>
          <h2 class="basil-onboarding-heading">Account connected</h2>
          <div class="basil-onboarding-linked-list">
            <div v-for="inst in linkedInstitutions" :key="inst" class="basil-onboarding-linked-row">
              <q-icon name="check_circle" color="positive" size="1.25rem" />
              <span>{{ inst }}</span>
            </div>
          </div>
          <q-btn
            unelevated
            color="primary"
            label="Add another account"
            icon="add"
            class="basil-onboarding-cta q-mt-md"
            @click="startPlaidLink"
          />
          <div class="basil-onboarding-skip">
            <a href="#" @click.prevent="startSync">That's all — let's go →</a>
          </div>
        </template>

        <PlaidLinkHandler v-if="showPlaidLink" @onPlaidSuccess="onPlaidSuccess" @onPlaidExit="onPlaidExit" />
      </div>

      <!-- Step 2: Sync progress + Summary -->
      <div v-if="currentStep === 2" class="basil-onboarding-step">

        <!-- 2a: Sync in progress -->
        <template v-if="!syncDone">
          <div class="basil-onboarding-sync">
            <q-spinner color="primary" size="2.5rem" class="q-mb-md" />
            <h2 class="basil-onboarding-heading" style="text-align: center">Importing your transactions</h2>
            <p class="basil-onboarding-body" style="text-align: center">
              This takes a moment the first time
            </p>
            <div class="basil-onboarding-sync-steps">
              <div
                v-for="step in syncSteps"
                :key="step.label"
                :class="['basil-onboarding-sync-step', `basil-onboarding-sync-step--${step.status}`]"
              >
                <div class="basil-onboarding-sync-step__icon">
                  <q-icon
                    :name="step.status === 'done' ? 'check' : step.status === 'active' ? 'more_horiz' : 'radio_button_unchecked'"
                    :size="step.status === 'pending' ? '10px' : '14px'"
                  />
                </div>
                <span>{{ step.label }}</span>
              </div>
            </div>
          </div>
        </template>

      </div>
    </div><!-- /basil-onboarding-card -->

    <!-- 2b: Summary (the aha moment) — outside the card, on the page background -->
    <div v-if="currentStep === 2 && syncDone" class="basil-onboarding-summary-screen">
      <div style="text-align: center; margin-bottom: var(--basil-space-5)">
        <div class="basil-onboarding-summary-icon">
          <q-icon name="check_circle" size="28px" color="primary" />
        </div>
        <div class="basil-display" style="font-size: 2.25rem; color: var(--basil-text); margin-bottom: var(--basil-space-2)">
          ${{ summaryStats.totalSpend.toLocaleString() }}
        </div>
        <p class="basil-onboarding-body" style="margin-bottom: var(--basil-space-1)">
          spent this month across {{ summaryStats.total }} transactions
        </p>
        <p style="font-size: 0.8125rem; color: var(--basil-text-muted); margin: 0">
          Basil sorted {{ summaryStats.categorized }} automatically
        </p>
      </div>

      <!-- Top categories -->
      <div v-if="summaryStats.topCategories.length > 0" class="basil-onboarding-categories">
        <div class="basil-onboarding-categories__header">Where it went</div>
        <div
          v-for="(cat, idx) in summaryStats.topCategories"
          :key="cat.name"
          class="basil-onboarding-categories__row"
        >
          <span>{{ cat.name }}</span>
          <span class="basil-mono">${{ cat.amount.toLocaleString() }}</span>
        </div>
      </div>

      <!-- To sort nudge -->
      <div v-if="summaryStats.toSort > 0" class="basil-onboarding-sort-nudge">
        <div class="basil-onboarding-sort-nudge__icon">
          <q-icon name="help_outline" size="20px" />
        </div>
        <div>
          <div style="font-size: 0.875rem; font-weight: 500">
            {{ summaryStats.toSort }} need a second look
          </div>
          <div style="font-size: 0.75rem; color: var(--basil-text-muted); margin-top: 2px">
            About {{ Math.max(1, Math.round(summaryStats.toSort / 6)) }} minute{{ Math.round(summaryStats.toSort / 6) === 1 ? '' : 's' }}. Basil learns from every one.
          </div>
        </div>
      </div>

      <q-btn
        unelevated
        color="primary"
        :label="summaryStats.toSort > 0 ? 'Start sorting' : 'See your budget'"
        class="basil-onboarding-cta q-mt-md"
        @click="$router.push('/')"
      />
      <div v-if="summaryStats.toSort > 0" class="basil-onboarding-skip">
        <a href="#" @click.prevent="$router.push('/')">See your budget →</a>
      </div>
    </div>

  </div>
</template>

<script>
import PlaidLinkHandler from '../components/PlaidLinkHandler.vue';
import { getOrAddUser, seedCategories, fetchCategories, triggerSync, ensureAppData } from '@/api';
import store from '../store';

export default {
  name: 'OnboardingView',
  components: { PlaidLinkHandler },

  data() {
    return {
      currentStep: 1,
      showPlaidLink: false,
      linking: false,
      linkedInstitutions: [],
      // Sync state
      syncDone: false,
      syncSteps: [],
      summaryStats: { total: 0, categorized: 0, toSort: 0, totalSpend: 0, topCategories: [] },
    };
  },

  methods: {
    startPlaidLink() {
      this.showPlaidLink = true;
    },

    onPlaidExit() {
      this.showPlaidLink = false;
      this.linking = false;
    },

    async onPlaidSuccess() {
      this.linking = true;
      this.showPlaidLink = false;
      try {
        const user = await getOrAddUser();
        store.commit('setUser', user);
        // Track linked institutions for display
        if (user?.accounts) {
          this.linkedInstitutions = [...user.accounts];
        }
      } catch (err) {
        console.error('onPlaidSuccess error:', err);
      }
      this.linking = false;
    },

    async skipToApp() {
      // Seed categories + set onboarded_at, then go to dashboard
      try {
        await seedCategories();
        const [cats, user] = await Promise.all([fetchCategories(), getOrAddUser()]);
        if (cats) store.commit('setCategories', cats);
        if (user) store.commit('setUser', user);
      } catch (err) {
        console.error('skipToApp error:', err);
      }
      this.$router.push('/');
    },

    async startSync() {
      this.currentStep = 2;
      const institutions = this.linkedInstitutions.join(', ') || 'your bank';
      const accountCount = store.state.user?.accounts?.length || 0;

      this.syncSteps = [
        { label: `Connected to ${institutions}`, status: 'done' },
        { label: `Found ${accountCount} account${accountCount === 1 ? '' : 's'}`, status: 'done' },
        { label: 'Importing transactions', status: 'active' },
        { label: 'Sorting into categories', status: 'pending' },
      ];

      const syncStartedAt = Date.now();
      const MIN_SYNC_DISPLAY_MS = 3000; // Show progress for at least 3 seconds

      try {
        // Seed categories + refresh user (sets onboarded_at which ensureAppData requires)
        await seedCategories();
        const [cats, user] = await Promise.all([fetchCategories(), getOrAddUser()]);
        if (cats) store.commit('setCategories', cats);
        if (user) store.commit('setUser', user);

        // Sync with Plaid (inline, not background)
        await triggerSync();
        this.syncSteps[2].status = 'done';
        this.syncSteps[3].status = 'active';

        // Brief pause so "Sorting into categories" is visible
        await new Promise(resolve => setTimeout(resolve, 800));

        // Fetch transactions into store (requires onboarded_at to be set)
        await ensureAppData(store);
        this.syncSteps[3].status = 'done';

        // Compute summary from loaded transactions
        this.computeSummary();
      } catch (err) {
        console.error('startSync error:', err);
        // Still show summary even if something failed
        this.computeSummary();
      }

      // Ensure sync screen is visible long enough for the user to register the progress
      const elapsed = Date.now() - syncStartedAt;
      if (elapsed < MIN_SYNC_DISPLAY_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_SYNC_DISPLAY_MS - elapsed));
      }

      this.syncDone = true;
    },

    computeSummary() {
      const txns = store.state.transactions || [];
      const total = txns.length;
      const categorized = txns.filter(t => t.mappedCategory && t.mappedCategory !== 'To Sort').length;
      const toSort = total - categorized;

      // Determine which categories are expense-type (exclude income, payment, savings)
      const categories = store.state.categories || [];
      const expenseCats = new Set(
        categories.filter(c => c.type === 'expense' && c.category !== 'To Sort').map(c => c.category)
      );

      // Total spend (expense categories only)
      const totalSpend = Math.round(txns
        .filter(t => t.amount > 0 && expenseCats.has(t.mappedCategory))
        .reduce((sum, t) => sum + t.amount, 0));

      // Top categories by spend (expense only)
      const catSpend = {};
      const catCount = {};
      txns.forEach(t => {
        if (expenseCats.has(t.mappedCategory)) {
          const cat = t.mappedCategory;
          catSpend[cat] = (catSpend[cat] || 0) + Math.abs(t.amount);
          catCount[cat] = (catCount[cat] || 0) + 1;
        }
      });
      const topCategories = Object.entries(catSpend)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name, amount]) => ({
          name,
          amount: Math.round(amount),
          count: catCount[name] || 0,
        }));

      this.summaryStats = { total, categorized, toSort, totalSpend, topCategories };
    },
  },
};
</script>
