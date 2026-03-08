<style src="../styles/OnboardingView.css"></style>

<template>
  <div class="basil-onboarding-page">
    <div class="basil-onboarding-card">

      <!-- Progress dots — shown on steps 1–3 only -->
      <div v-if="currentStep <= 3" class="basil-onboarding-dots">
        <div
          v-for="n in 3"
          :key="n"
          class="basil-onboarding-dot"
          :class="{ 'basil-onboarding-dot--active': n === currentStep }"
        />
      </div>

      <!-- Step 1: Flow picker -->
      <div v-if="currentStep === 1" class="basil-onboarding-step">
        <h1 class="basil-onboarding-heading">Welcome to Basil</h1>
        <p class="basil-onboarding-body">
          How would you like to get started?
        </p>
        <div class="basil-onboarding-flow-cards">
          <div class="basil-onboarding-flow-card" @click="pickFlow('quick')">
            <q-icon name="flash_on" size="2rem" color="primary" />
            <div class="basil-onboarding-flow-card__title">Quick setup</div>
            <div class="basil-onboarding-flow-card__sub">We'll create categories for you</div>
          </div>
          <div class="basil-onboarding-flow-card" @click="pickFlow('custom')">
            <q-icon name="tune" size="2rem" color="primary" />
            <div class="basil-onboarding-flow-card__title">Custom setup</div>
            <div class="basil-onboarding-flow-card__sub">Choose your own categories first</div>
          </div>
        </div>
      </div>

      <!-- Step 2: Quick flow — Connect bank -->
      <div v-if="currentStep === 2 && flow === 'quick'" class="basil-onboarding-step">
        <h2 class="basil-onboarding-heading">Connect your bank</h2>
        <p class="basil-onboarding-body">
          Link your accounts to automatically import transactions.
        </p>
        <q-btn
          unelevated
          color="primary"
          label="Connect account"
          icon="account_balance"
          class="basil-onboarding-cta"
          @click="showPlaidLink = true"
        />
        <PlaidLinkHandler v-if="showPlaidLink" @onPlaidSuccess="onPlaidSuccess" />
        <div class="basil-onboarding-skip">
          <a href="#" @click.prevent="goToStep3Quick">Skip for now →</a>
        </div>
        <div class="basil-onboarding-skip">
          <a href="#" @click.prevent="currentStep = 1">← Back</a>
        </div>
      </div>

      <!-- Step 2: Custom flow — Checklist hub -->
      <div v-if="currentStep === 2 && flow === 'custom'" class="basil-onboarding-step">
        <h2 class="basil-onboarding-heading">Set up your account</h2>
        <p class="basil-onboarding-body">
          Complete these in any order.
        </p>

        <!-- Checklist cards (when editor is not open) -->
        <div v-if="!showCategoryEditor" class="basil-onboarding-checklist">
          <div
            class="basil-onboarding-checklist-card"
            :class="{ 'basil-onboarding-checklist-card--done': categoriesDone }"
            @click="showCategoryEditor = true"
          >
            <q-icon :name="categoriesDone ? 'check_circle' : 'category'" size="1.5rem"
              :color="categoriesDone ? 'positive' : 'primary'" />
            <div>
              <div class="basil-onboarding-checklist-card__title">Customize categories</div>
              <div class="basil-onboarding-checklist-card__sub">
                {{ categoriesDone ? 'Done' : 'Rename, add, or remove categories' }}
              </div>
            </div>
          </div>
          <div
            class="basil-onboarding-checklist-card"
            :class="{ 'basil-onboarding-checklist-card--done': bankDone }"
            @click="showPlaidLink = true"
          >
            <q-icon :name="bankDone ? 'check_circle' : 'account_balance'" size="1.5rem"
              :color="bankDone ? 'positive' : 'primary'" />
            <div>
              <div class="basil-onboarding-checklist-card__title">Connect your bank</div>
              <div class="basil-onboarding-checklist-card__sub">
                {{ bankDone ? 'Connected' : 'Link accounts to import transactions' }}
              </div>
            </div>
          </div>
          <PlaidLinkHandler v-if="showPlaidLink" @onPlaidSuccess="onPlaidSuccessCustom" />
          <q-btn
            unelevated
            color="primary"
            label="Continue"
            icon-right="arrow_forward"
            class="basil-onboarding-cta q-mt-md"
            :disable="!categoriesDone"
            @click="finishCustom"
          />
          <div v-if="!categoriesDone" class="basil-onboarding-skip" style="margin-top: var(--basil-space-2)">
            <span style="font-size: 0.8125rem; color: var(--basil-text-muted)">Customize categories to continue</span>
          </div>
          <div class="basil-onboarding-skip">
            <a href="#" @click.prevent="currentStep = 1">← Back</a>
          </div>
        </div>

        <!-- Inline category editor -->
        <div v-if="showCategoryEditor">
          <OnboardingCategoryEditor @done="onCategoriesDone" />
          <div class="basil-onboarding-skip">
            <a href="#" @click.prevent="showCategoryEditor = false">← Back to checklist</a>
          </div>
        </div>
      </div>

      <!-- Step 3: Quick flow — seed + done summary -->
      <div v-if="currentStep === 3 && flow === 'quick'" class="basil-onboarding-step">
        <h2 class="basil-onboarding-heading">Set up your categories</h2>
        <p class="basil-onboarding-body">
          We'll create a starter set you can customize any time.
        </p>
        <div v-if="seeding" class="basil-onboarding-seeding">
          <q-spinner color="primary" size="2rem" />
          <span>Setting up categories…</span>
        </div>
        <div v-else-if="seeded" class="basil-onboarding-seeded">
          <q-icon name="check_circle" color="positive" size="2rem" />
          <span>{{ categorySummary }} created across income, expenses, and payments.</span>
        </div>
        <q-btn
          v-if="!seeding"
          unelevated
          color="primary"
          label="Continue"
          icon-right="arrow_forward"
          class="basil-onboarding-cta q-mt-md"
          @click="currentStep = 4"
        />
      </div>

      <!-- Step 3: Custom flow — done summary -->
      <div v-if="currentStep === 3 && flow === 'custom'" class="basil-onboarding-step">
        <h2 class="basil-onboarding-heading">Set up your categories</h2>
        <div v-if="seedingCustom" class="basil-onboarding-seeding">
          <q-spinner color="primary" size="2rem" />
          <span>Setting up your categories…</span>
        </div>
        <div v-else-if="seededCustom" class="basil-onboarding-seeded">
          <q-icon name="check_circle" color="positive" size="2rem" />
          <span>{{ categorySummary }} created.</span>
        </div>
        <q-btn
          v-if="!seedingCustom"
          unelevated
          color="primary"
          label="Continue"
          icon-right="arrow_forward"
          class="basil-onboarding-cta q-mt-md"
          @click="currentStep = 4"
        />
      </div>

      <!-- Step 4: Done -->
      <div v-if="currentStep === 4" class="basil-onboarding-step">
        <h2 class="basil-onboarding-heading">You're all set</h2>
        <div class="basil-onboarding-summary">
          <div class="basil-onboarding-summary__row">
            <q-icon name="account_balance" color="primary" size="1.25rem" />
            <span>{{ accountSummary }}</span>
          </div>
          <div class="basil-onboarding-summary__row">
            <q-icon name="category" color="primary" size="1.25rem" />
            <span>{{ categorySummary }}</span>
          </div>
          <div class="basil-onboarding-summary__row">
            <q-icon name="bar_chart" color="primary" size="1.25rem" />
            <span>Budget planner ready</span>
          </div>
        </div>
        <q-btn
          unelevated
          color="primary"
          label="Go to Budget Planner"
          class="basil-onboarding-cta"
          @click="$router.push('/plan')"
        />
        <div class="basil-onboarding-skip">
          <a href="#" @click.prevent="$router.push('/')">Go to dashboard →</a>
        </div>
      </div>

    </div>
  </div>
</template>

<script>
import PlaidLinkHandler from '../components/PlaidLinkHandler.vue';
import OnboardingCategoryEditor from '../components/OnboardingCategoryEditor.vue';
import { getOrAddUser, seedCategories, seedCustomCategories, fetchCategories } from '@/firebase';
import store from '../store';

export default {
  name: 'OnboardingView',
  components: { PlaidLinkHandler, OnboardingCategoryEditor },

  data() {
    return {
      currentStep: 1,
      flow: null,
      showPlaidLink: false,
      showCategoryEditor: false,
      // Quick flow
      seeding: false,
      seeded: false,
      // Custom flow
      customCategories: null,
      categoriesDone: false,
      bankDone: false,
      seedingCustom: false,
      seededCustom: false,
    };
  },

  computed: {
    accountSummary() {
      const accounts = store.state.user?.accounts;
      if (!accounts?.length) return 'No accounts linked yet — add one from Profile';
      return `${accounts.length} account${accounts.length === 1 ? '' : 's'} linked`;
    },
    categorySummary() {
      const cats = store.state.categories;
      if (!cats?.length) return 'No categories set up';
      return `${cats.length} categories set up`;
    },
  },

  watch: {
    currentStep(val) {
      if (val === 3 && this.flow === 'quick') this.runSeed();
      if (val === 3 && this.flow === 'custom') this.runCustomSeed();
    },
  },

  methods: {
    pickFlow(flow) {
      this.flow = flow;
      this.currentStep = 2;
    },

    // Quick flow: plaid success → step 3
    async onPlaidSuccess() {
      try {
        const user = await getOrAddUser();
        store.commit('setUser', user);
      } catch (err) {
        console.error('onPlaidSuccess error:', err);
      }
      this.showPlaidLink = false;
      this.currentStep = 3;
    },

    goToStep3Quick() {
      this.currentStep = 3;
    },

    async runSeed() {
      if (store.state.categories?.length) {
        this.seeded = true;
        return;
      }
      this.seeding = true;
      try {
        await seedCategories();
        const [cats, user] = await Promise.all([fetchCategories(), getOrAddUser()]);
        if (cats) store.commit('setCategories', cats);
        if (user) store.commit('setUser', user);
        this.seeded = true;
      } catch (err) {
        console.error('runSeed error:', err);
      } finally {
        this.seeding = false;
      }
    },

    // Custom flow: plaid success (stay on hub)
    async onPlaidSuccessCustom() {
      try {
        const user = await getOrAddUser();
        store.commit('setUser', user);
        this.bankDone = true;
      } catch (err) {
        console.error('onPlaidSuccessCustom error:', err);
      }
      this.showPlaidLink = false;
    },

    onCategoriesDone(categories) {
      this.customCategories = categories;
      this.categoriesDone = true;
      this.showCategoryEditor = false;
    },

    finishCustom() {
      this.currentStep = 3;
    },

    async runCustomSeed() {
      if (store.state.categories?.length) {
        this.seededCustom = true;
        return;
      }
      this.seedingCustom = true;
      try {
        await seedCustomCategories(this.customCategories);
        const [cats, user] = await Promise.all([fetchCategories(), getOrAddUser()]);
        if (cats) store.commit('setCategories', cats);
        if (user) store.commit('setUser', user);
        this.seededCustom = true;
      } catch (err) {
        console.error('runCustomSeed error:', err);
      } finally {
        this.seedingCustom = false;
      }
    },
  },
};
</script>
