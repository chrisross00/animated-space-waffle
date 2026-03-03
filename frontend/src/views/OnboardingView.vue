<style src="../styles/OnboardingView.css"></style>

<template>
  <div class="basil-onboarding-page">
    <div class="basil-onboarding-card">

      <!-- Progress dots — shown on steps 1–3 only -->
      <div v-if="currentStep < 4" class="basil-onboarding-dots">
        <div
          v-for="n in 3"
          :key="n"
          class="basil-onboarding-dot"
          :class="{ 'basil-onboarding-dot--active': n === currentStep }"
        />
      </div>

      <!-- Step 1: Welcome -->
      <div v-if="currentStep === 1" class="basil-onboarding-step">
        <h1 class="basil-onboarding-heading">Welcome to Basil</h1>
        <p class="basil-onboarding-body">
          Connect your bank, set up categories, and start understanding your finances in three quick steps.
        </p>
        <q-btn
          unelevated
          color="primary"
          label="Get started"
          icon-right="arrow_forward"
          class="basil-onboarding-cta"
          @click="currentStep = 2"
        />
      </div>

      <!-- Step 2: Connect bank -->
      <div v-if="currentStep === 2" class="basil-onboarding-step">
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
          <a href="#" @click.prevent="currentStep = 3">Skip for now →</a>
        </div>
      </div>

      <!-- Step 3: Starter categories -->
      <div v-if="currentStep === 3" class="basil-onboarding-step">
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
          <span>10 categories created across income, expenses, and savings.</span>
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
import { getOrAddUser, seedCategories, fetchCategories } from '@/firebase';
import store from '../store';

export default {
  name: 'OnboardingView',
  components: { PlaidLinkHandler },

  data() {
    return {
      currentStep: 1,
      showPlaidLink: false,
      seeding: false,
      seeded: false,
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
      if (val === 3) this.runSeed();
    },
  },

  methods: {
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

    async runSeed() {
      if (store.state.categories?.length) {
        this.seeded = true;
        return;
      }
      this.seeding = true;
      try {
        await seedCategories();
        const cats = await fetchCategories();
        if (cats) store.commit('setCategories', cats);
        this.seeded = true;
      } catch (err) {
        console.error('runSeed error:', err);
      } finally {
        this.seeding = false;
      }
    },
  },
};
</script>
