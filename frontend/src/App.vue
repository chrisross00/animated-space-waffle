<template>
  <q-layout view="hHh Lpr lFf">
    <q-header :class="['basil-header', headerScrolled && 'basil-header--scrolled']">
      <q-toolbar>
        <q-btn
          dense flat round
          icon="menu"
          class="basil-menu-btn"
          @click="toggleLeftDrawer"
        />

        <q-toolbar-title class="basil-wordmark">
          <a href="/" class="basil-wordmark__link">Basil</a>
        </q-toolbar-title>

        <!-- Current-month summary — visible when data is loaded, desktop only -->
        <div v-if="headerStats" class="basil-header-stat gt-xs">
          <span class="basil-header-stat__spend">${{ headerStats.expenseSpendFmt }} spent</span>
          <span class="basil-header-stat__dot">·</span>
          <span class="basil-header-stat__earned">${{ headerStats.incomeAmountFmt }} earned</span>
        </div>

        <!-- Sync button -->
        <q-btn
          v-if="$store.state.session"
          flat round dense
          icon="sync"
          class="basil-sync-btn q-ml-sm"
          :class="{ 'basil-sync-btn--spinning': syncing }"
          :title="hasItemErrors ? 'Account needs attention — tap to sync' : 'Sync with bank'"
          @click="handleSync"
        >
          <q-badge v-if="hasItemErrors" floating color="warning" rounded class="basil-sync-badge" />
        </q-btn>
      </q-toolbar>

      <!-- Desktop tab bar — hidden on mobile -->
      <q-tabs align="left" class="basil-tabs gt-xs">
        <template v-if="$store.state.session">
          <q-route-tab to="/" icon="account_balance_wallet" label="Budget" />
          <q-route-tab to="/plan" icon="edit_note" label="Plan" />
          <template v-if="$store.state.user?.onboarded_at">
            <q-route-tab to="/accounts" icon="account_balance" label="Accounts" />
            <q-route-tab to="/trends" icon="bar_chart" label="Trends" />
            <q-route-tab to="/rules" icon="rule" label="Rules" />
          </template>
        </template>
        <q-route-tab to="/profile" icon="person" label="Profile" />
      </q-tabs>

      <!-- Global thin progress bar — visible while bootstrapping app data -->
      <q-linear-progress
        v-if="$store.state.bootstrapping"
        indeterminate
        color="primary"
        class="basil-loading-bar"
      />
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      side="left"
      overlay
      elevated
    >
      <q-list>
        <template v-if="$store.state.session">
          <q-item-label header class="basil-drawer-section-label">Navigation</q-item-label>
          <q-item clickable to="/plan" @click="leftDrawerOpen = false">
            <q-item-section avatar>
              <q-icon name="edit_note" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Plan</q-item-label>
              <q-item-label caption>Budget planner</q-item-label>
            </q-item-section>
          </q-item>
          <q-item clickable to="/rules" @click="leftDrawerOpen = false">
            <q-item-section avatar>
              <q-icon name="rule" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Rules</q-item-label>
              <q-item-label caption>Manage categorization rules</q-item-label>
            </q-item-section>
          </q-item>
          <q-separator class="q-my-sm" />
          <q-item-label header class="basil-drawer-section-label">Tools</q-item-label>
          <q-item clickable @click="openVenmoEnrichment">
            <q-item-section avatar>
              <q-icon name="sync_alt" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Venmo Import</q-item-label>
              <q-item-label caption>Add names and notes to Venmo transactions</q-item-label>
            </q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-drawer>

    <!-- Mobile bottom nav — hidden on desktop -->
    <q-footer v-if="$store.state.session" class="lt-sm basil-bottom-nav">
      <q-tabs align="justify" class="basil-bottom-tabs">
        <q-route-tab to="/" icon="account_balance_wallet" label="Budget" />
        <q-route-tab v-if="$store.state.user?.onboarded_at" to="/accounts" icon="account_balance" label="Accounts" />
        <q-route-tab v-if="$store.state.user?.onboarded_at" to="/trends" icon="bar_chart" label="Trends" />
        <q-route-tab to="/profile" icon="person" label="Profile" />
      </q-tabs>
    </q-footer>

    <q-page-container>
      <router-view v-slot="{ Component }">
        <Transition name="basil-page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
    </q-page-container>
  </q-layout>
</template>

<style>
/* ---- Display typography utility ---- */
.basil-display {
  font-family: var(--basil-font-display);
  font-weight: 400;
}

/* ---- Monospace numbers utility ---- */
.basil-mono {
  font-family: var(--basil-font-mono);
  font-variant-numeric: tabular-nums;
}

/* ---- Existing layout utilities ---- */
.button-container {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.page-padder {
  padding: 0 1em;
}

/* ========================================
   Header
   ======================================== */
.basil-header {
  background-color: var(--basil-surface) !important;
  color: var(--basil-text) !important;
  border-bottom: 1px solid var(--basil-border);
  /* Override Quasar's elevated shadow — we apply our own on scroll */
  box-shadow: none !important;
  transition: box-shadow var(--basil-t-base) var(--basil-ease);
}

.basil-header--scrolled {
  box-shadow: var(--basil-shadow-md) !important;
}

/* ---- Wordmark ---- */
.basil-wordmark {
  font-family: var(--basil-font-display);
  font-size: 1.5rem;
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1;
}

.basil-wordmark__link {
  color: var(--basil-text);
  text-decoration: none;
}

/* ---- Menu button ---- */
.basil-menu-btn {
  color: var(--basil-text-secondary) !important;
}

/* ---- Sync button ---- */
.basil-sync-btn {
  color: var(--basil-text-secondary) !important;
  transition: color var(--basil-t-fast) var(--basil-ease);
}
.basil-sync-btn:hover {
  color: var(--basil-text) !important;
}
.basil-sync-btn--spinning .q-icon {
  animation: basil-spin 0.8s linear infinite;
}
.basil-sync-badge {
  min-width: 10px;
  min-height: 10px;
  padding: 0;
  top: 2px;
  right: 2px;
}
@keyframes basil-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}

/* ---- Summary stat pill ---- */
.basil-header-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  padding: 5px 14px;
  border-radius: var(--basil-radius-pill);
  background-color: var(--basil-surface-alt);
  border: 1px solid var(--basil-border);
  white-space: nowrap;
}

.basil-header-stat__spend {
  color: var(--basil-text-secondary);
  font-weight: 500;
}

.basil-header-stat__dot {
  color: var(--basil-border-strong);
  font-weight: 300;
}

.basil-header-stat__earned {
  color: var(--basil-positive);
  font-weight: 600;
}

/* ========================================
   Global loading bar
   ======================================== */
.basil-loading-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
}

/* ========================================
   Motion
   ======================================== */

/* Page fade transition */
.basil-page-enter-active,
.basil-page-leave-active {
  transition: opacity 180ms var(--basil-ease);
}
.basil-page-enter-from,
.basil-page-leave-to {
  opacity: 0;
}

/* ========================================
   Mobile bottom nav
   ======================================== */
:root {
  --basil-bottom-nav-height: 72px;
}

.basil-bottom-nav {
  background-color: var(--basil-surface) !important;
  border-top: 1px solid var(--basil-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.basil-bottom-tabs {
  color: var(--basil-text-secondary) !important;
}

.basil-bottom-tabs .q-tab--active {
  color: var(--basil-brand) !important;
}

.basil-drawer-section-label {
  color: var(--basil-text-secondary) !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}


</style>

<script>
import { ref } from 'vue'
import store from './store'
import { triggerSync, fetchTransactionsForMonth } from './firebase'
import VenmoEnrichmentDialog from './components/VenmoEnrichmentDialog.vue'

export default {
  name: 'LayoutDefault',

  data() {
    return {
      leftDrawerOpen: ref(false),
      headerScrolled: false,
      syncing: false,
    }
  },

  computed: {
    headerStats() {
      const txns = this.$store?.state?.transactions;
      const cats = this.$store?.state?.categories;
      if (!txns?.length || !cats?.length) return null;

      // Build category type lookup
      const catTypes = {};
      for (const c of cats) catTypes[c.category] = c.type;

      // Current month as "YYYY-MM" string — avoids timezone issues
      const now = new Date();
      const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      let expenseSpend = 0;
      let incomeAmount = 0;
      for (const t of txns) {
        if (t.pending || t.excludeFromTotal) continue;
        if (!t.date || t.date.substring(0, 7) !== currentYM) continue;
        const type = catTypes[t.mappedCategory];
        if (type === 'expense') expenseSpend += Math.abs(t.amount);
        if (type === 'income') incomeAmount += Math.abs(t.amount);
      }

      return {
        expenseSpendFmt: Math.round(expenseSpend).toLocaleString(),
        incomeAmountFmt: Math.round(incomeAmount).toLocaleString(),
      };
    },
    hasItemErrors() {
      return Object.keys(this.$store.state.itemErrors || {}).length > 0;
    },
  },

  created() {},

  mounted() {
    window.addEventListener('scroll', this.onScroll, { passive: true });
  },

  beforeUnmount() {
    window.removeEventListener('scroll', this.onScroll);
  },

  methods: {
    toggleLeftDrawer() {
      this.leftDrawerOpen = !this.leftDrawerOpen;
    },
    onScroll() {
      this.headerScrolled = window.scrollY > 4;
    },
    async handleSync() {
      if (this.syncing) return;
      this.syncing = true;
      try {
        const syncResult = await triggerSync();
        if (syncResult) {
          store.commit('setLastSyncedAt', syncResult.syncedAt);
          if (syncResult.balances) store.commit('setAccountBalances', syncResult.balances);
          if (syncResult.balanceSnapshots) store.commit('setBalanceSnapshots', syncResult.balanceSnapshots);
          store.commit('setItemErrors', syncResult.itemErrors);
          const now = new Date();
          const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const txnResult = await fetchTransactionsForMonth(month);
          if (txnResult?.transactions) store.commit('setMonthTransactions', { month, transactions: txnResult.transactions });
        }
      } catch (err) {
        console.error('Sync failed:', err);
      } finally {
        this.syncing = false;
      }
    },
    openVenmoEnrichment() {
      this.leftDrawerOpen = false;
      this.$q.dialog({ component: VenmoEnrichmentDialog });
    },
  },
}
</script>
