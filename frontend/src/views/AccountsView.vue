<template>
  <div class="q-pa-md">

    <!-- Header -->
    <div class="basil-card-head q-mb-sm">
      <span class="basil-card-label">Accounts</span>
      <q-btn
        flat dense round
        icon="refresh"
        size="sm"
        :loading="refreshing"
        @click="handleRefresh"
      />
    </div>

    <!-- Loading skeleton -->
    <template v-if="$store.state.bootstrapping">
      <q-item v-for="i in 3" :key="i">
        <q-item-section>
          <q-skeleton type="text" width="55%" />
          <q-skeleton type="text" width="35%" />
        </q-item-section>
      </q-item>
    </template>

    <!-- Empty state: no accounts linked -->
    <EmptyState
      v-else-if="!hasAccounts"
      icon="account_balance"
      heading="No accounts linked"
      body="Link a bank account in your Profile to see balances here."
    />

    <!-- Empty state: accounts linked but no balance data -->
    <EmptyState
      v-else-if="!hasBalances"
      icon="sync"
      heading="No balance data yet"
      body="Tap the refresh button to fetch your account balances."
    />

    <!-- Account list -->
    <template v-else>
      <div
        v-for="institution in institutions"
        :key="institution.name"
        class="basil-accounts__institution q-mb-md"
      >
        <div class="basil-accounts__institution-name">{{ institution.name }}</div>

        <q-list bordered separator rounded>
          <q-item v-for="acct in institution.accounts" :key="acct.account_id">
            <q-item-section>
              <q-item-label class="basil-accounts__acct-name">
                {{ acct.name }}
                <span v-if="acct.mask" class="basil-accounts__mask">{{ acct.mask }}</span>
              </q-item-label>
              <q-item-label caption>{{ formatSubtype(acct.subtype) }}</q-item-label>
              <!-- Credit utilization -->
              <template v-if="acct.type === 'credit' && acct.limit">
                <div class="basil-accounts__utilization q-mt-xs">
                  <q-linear-progress
                    :value="Math.abs(acct.current) / acct.limit"
                    rounded
                    size="6px"
                    :color="utilizationColor(Math.abs(acct.current) / acct.limit)"
                    track-color="grey-3"
                    class="basil-accounts__utilization-bar"
                  />
                  <span class="basil-accounts__utilization-label">
                    {{ Math.round((Math.abs(acct.current) / acct.limit) * 100) }}% of {{ formatCurrency(acct.limit) }}
                  </span>
                </div>
              </template>
            </q-item-section>
            <q-item-section side>
              <span
                class="basil-mono basil-accounts__balance"
                :class="balanceClass(acct)"
              >
                {{ formatBalance(acct) }}
              </span>
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <!-- Net Worth card -->
      <div class="basil-accounts__card q-mb-md">
        <div class="basil-card-head">
          <span class="basil-card-label">Net Worth</span>
        </div>
        <div class="basil-accounts__card-body">
          <div class="basil-accounts__net-row">
            <span class="basil-accounts__net-label">Assets</span>
            <span class="basil-mono">{{ formatCurrency(netWorth.assets) }}</span>
          </div>
          <div class="basil-accounts__net-row">
            <span class="basil-accounts__net-label">Liabilities</span>
            <span class="basil-mono" style="color: var(--basil-negative)">
              {{ netWorth.liabilities > 0 ? '-' : '' }}{{ formatCurrency(netWorth.liabilities) }}
            </span>
          </div>
          <q-separator class="q-my-sm" />
          <div class="basil-accounts__net-row">
            <span class="basil-accounts__net-label">Net</span>
            <span
              class="basil-display basil-accounts__net-total"
              :style="{ color: netWorth.net >= 0 ? 'var(--basil-positive)' : 'var(--basil-negative)' }"
            >
              {{ netWorth.net >= 0 ? '' : '-' }}{{ formatCurrency(Math.abs(netWorth.net)) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Cash Runway card -->
      <div class="basil-accounts__card q-mb-md">
        <div class="basil-card-head">
          <span class="basil-card-label">Cash Runway</span>
        </div>
        <div class="basil-accounts__card-body basil-accounts__runway">
          <template v-if="runway.months !== null">
            <span
              class="basil-display basil-accounts__runway-number"
              :style="{ color: runwayColor }"
            >
              {{ runway.months.toFixed(1) }} months
            </span>
            <span class="basil-accounts__runway-detail">
              {{ formatCurrency(runway.liquid) }} liquid &divide; {{ formatCurrency(runway.burn) }}/mo avg
            </span>
            <span class="basil-accounts__runway-note">
              Based on your last 3 months of expenses (excl. savings &amp; income).
            </span>
          </template>
          <template v-else>
            <span class="basil-accounts__runway-number" style="color: var(--basil-text-secondary)">
              &mdash;
            </span>
            <span class="basil-accounts__runway-note">
              {{ runway.reason }}
            </span>
          </template>
        </div>
      </div>

      <!-- Last updated -->
      <div v-if="lastUpdatedText" class="basil-accounts__updated">
        {{ lastUpdatedText }}
      </div>
    </template>
  </div>
</template>

<script>
import { ensureAppData, refreshBalances } from '@/firebase';
import EmptyState from '../components/EmptyState.vue';

export default {
  name: 'AccountsView',
  components: { EmptyState },

  data() {
    return {
      refreshing: false,
    };
  },

  computed: {
    hasAccounts() {
      return this.$store.state.user?.accounts?.length > 0;
    },

    balances() {
      return this.$store.state.accountBalances;
    },

    hasBalances() {
      if (!this.balances) return false;
      return Object.values(this.balances).some(arr => arr?.length > 0);
    },

    institutions() {
      if (!this.balances) return [];
      return Object.entries(this.balances)
        .filter(([, accounts]) => accounts?.length > 0)
        .map(([name, accounts]) => ({ name, accounts }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    allAccounts() {
      if (!this.balances) return [];
      return Object.values(this.balances).flat();
    },

    netWorth() {
      const accts = this.allAccounts;
      let assets = 0;
      let liabilities = 0;

      for (const acct of accts) {
        const bal = acct.available ?? acct.current ?? 0;
        if (acct.type === 'depository' || acct.type === 'investment') {
          assets += bal;
        } else if (acct.type === 'credit' || acct.type === 'loan') {
          liabilities += Math.abs(bal);
        }
      }

      return { assets, liabilities, net: assets - liabilities };
    },

    runway() {
      const accts = this.allAccounts;
      const liquid = accts
        .filter(a => a.type === 'depository')
        .reduce((sum, a) => sum + (a.available ?? a.current ?? 0), 0);

      if (liquid <= 0) {
        return { months: null, reason: 'No liquid balance available.' };
      }

      const transactions = this.$store.state.transactions || [];
      const categories = this.$store.state.categories || [];

      // Determine excluded category types
      const excludedTypes = new Set(['income', 'payment', 'savings']);
      const excludedCategories = new Set(
        categories
          .filter(c => excludedTypes.has(c.type))
          .map(c => c.category)
      );

      // Get last 3 complete months
      const now = new Date();
      const months = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toISOString().slice(0, 7)); // YYYY-MM
      }

      let totalExpenses = 0;
      let monthsWithData = 0;

      for (const month of months) {
        const monthTxns = transactions.filter(t => {
          if (!t.date?.startsWith(month)) return false;
          if (t.excludeFromTotal) return false;
          if (excludedCategories.has(t.mappedCategory)) return false;
          return t.amount > 0; // Plaid: positive = debit
        });
        if (monthTxns.length > 0) {
          totalExpenses += monthTxns.reduce((sum, t) => sum + t.amount, 0);
          monthsWithData++;
        }
      }

      if (monthsWithData < 2) {
        return { months: null, reason: 'Need at least 2 months of transaction history to calculate runway.' };
      }

      const burn = totalExpenses / monthsWithData;
      if (burn <= 0) {
        return { months: null, reason: 'No expense data found in recent months.' };
      }

      return { months: liquid / burn, liquid, burn };
    },

    runwayColor() {
      if (!this.runway.months) return 'var(--basil-text-secondary)';
      if (this.runway.months > 6) return 'var(--basil-positive)';
      if (this.runway.months >= 3) return 'var(--basil-warning)';
      return 'var(--basil-negative)';
    },

    lastUpdatedText() {
      const accts = this.allAccounts;
      if (accts.length === 0) return '';
      const oldest = Math.min(...accts.map(a => a.fetchedAt).filter(Boolean));
      if (!oldest) return '';
      const mins = Math.round((Date.now() - oldest) / 60000);
      if (mins < 1) return 'Last updated just now';
      if (mins < 60) return `Last updated ${mins} minute${mins !== 1 ? 's' : ''} ago`;
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return `Last updated ${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
      const days = Math.round(hrs / 24);
      return `Last updated ${days} day${days !== 1 ? 's' : ''} ago`;
    },
  },

  methods: {
    async handleRefresh() {
      this.refreshing = true;
      try {
        const result = await refreshBalances();
        if (result?.balances) {
          this.$store.commit('setAccountBalances', result.balances);
        }
      } finally {
        this.refreshing = false;
      }
    },

    formatCurrency(val) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val);
    },

    formatBalance(acct) {
      const val = acct.available ?? acct.current ?? 0;
      const isLiability = acct.type === 'credit' || acct.type === 'loan';
      const display = isLiability ? -Math.abs(val) : val;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }).format(display);
    },

    balanceClass(acct) {
      const isLiability = acct.type === 'credit' || acct.type === 'loan';
      return isLiability ? 'basil-accounts__balance--negative' : '';
    },

    formatSubtype(subtype) {
      if (!subtype) return '';
      return subtype.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },

    utilizationColor(ratio) {
      if (ratio > 0.7) return 'negative';
      if (ratio > 0.3) return 'warning';
      return 'positive';
    },
  },

  async mounted() {
    await ensureAppData(this.$store);
    // Auto-fetch balances if none cached
    if (this.hasAccounts && !this.hasBalances) {
      this.handleRefresh();
    }
  },
};
</script>

<style scoped>
@import '../styles/accounts.css';
</style>
