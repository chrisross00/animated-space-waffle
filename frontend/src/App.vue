<template>
  <q-layout view="hHh Lpr lFf">
    <q-header :class="['basil-header', headerScrolled && 'basil-header--scrolled']">
      <q-toolbar>
        <q-btn
          v-if="$store.state.user?.onboarded_at"
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
          v-if="$store.state.session && $store.state.user?.onboarded_at"
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
        <template v-if="$store.state.session && $store.state.user?.onboarded_at">
          <q-route-tab to="/budget" icon="account_balance_wallet" label="Budget" />
          <q-route-tab to="/accounts" icon="account_balance" label="Accounts" />
          <q-route-tab to="/plan" icon="edit_note" label="Plan" />
          <q-route-tab to="/trends" icon="bar_chart" label="Trends" />
          <q-route-tab to="/rules" icon="rule" label="Rules" />
          <q-route-tab to="/tags" icon="sell" label="Tags" />
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
        <template v-if="$store.state.session && $store.state.user?.onboarded_at">
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
          <q-item clickable to="/tags" @click="leftDrawerOpen = false">
            <q-item-section avatar>
              <q-icon name="sell" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Tags</q-item-label>
              <q-item-label caption>Track spending by tag</q-item-label>
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
          <q-separator class="q-my-sm" />
          <q-item clickable @click="toggleTheme">
            <q-item-section avatar>
              <q-icon :name="isDark ? 'light_mode' : 'dark_mode'" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ isDark ? 'Light mode' : 'Dark mode' }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item clickable to="/privacy" @click="leftDrawerOpen = false">
            <q-item-section avatar>
              <q-icon name="policy" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Privacy Policy</q-item-label>
            </q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-drawer>

    <!-- Mobile bottom nav — hidden on desktop and when keyboard is open -->
    <q-footer v-if="$store.state.session && $store.state.user?.onboarded_at" v-show="!keyboardOpen" class="lt-sm basil-bottom-nav">
      <q-tabs align="justify" class="basil-bottom-tabs">
        <q-route-tab to="/budget" icon="account_balance_wallet" label="Budget" />
        <q-route-tab v-if="$store.state.user?.onboarded_at" to="/accounts" icon="account_balance" label="Accounts" />
        <q-route-tab v-if="$store.state.user?.onboarded_at" to="/trends" icon="bar_chart" label="Trends" />
        <q-route-tab to="/profile" icon="person" label="Profile" />
      </q-tabs>
    </q-footer>

    <q-page-container>
      <template v-if="hasError">
        <q-page class="flex flex-center">
          <EmptyState
            icon="error_outline"
            heading="Something went wrong"
            body="An unexpected error occurred. Reloading usually fixes it."
          >
            <q-btn
              unelevated
              color="primary"
              label="Reload"
              class="q-mt-md"
              @click="reload"
            />
          </EmptyState>
        </q-page>
      </template>
      <template v-else>
        <PullToRefresh>
          <router-view v-slot="{ Component }">
            <Transition name="basil-page" mode="out-in">
              <component :is="Component" />
            </Transition>
          </router-view>
        </PullToRefresh>
      </template>
    </q-page-container>

    <VenmoEnrichmentDialog v-model="venmoDialogOpen" />
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
  /* PWA safe area: pad above the toolbar for notch/dynamic island */
  padding-top: env(safe-area-inset-top);
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

/* Active tab: green color + pill behind icon (M3 / Gmail pattern) */
.basil-bottom-tabs .q-tab--active {
  color: var(--basil-green) !important;
}

.basil-bottom-tabs .q-tab__indicator {
  display: none !important;
}

/* Pill behind active icon — anchored to the icon element itself */
.basil-bottom-tabs .q-tab__icon {
  position: relative;
}

.basil-bottom-tabs .q-tab__icon::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 64px;
  height: 32px;
  border-radius: 16px;
  background-color: transparent;
  transition: background-color 200ms var(--basil-ease);
  z-index: -1;
}

.basil-bottom-tabs .q-tab--active .q-tab__icon::before {
  background-color: var(--basil-green-subtle);
}

.basil-drawer-section-label {
  color: var(--basil-text-secondary) !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ========================================
   Dark mode — Quasar component overrides
   ======================================== */
[data-theme="dark"] .q-card {
  background-color: var(--basil-surface) !important;
  color: var(--basil-text) !important;
}

[data-theme="dark"] .basil-tosort-card:hover,
[data-theme="dark"] .basil-relationships-card:not(.basil-relationships-card--expanded):hover {
  background-color: var(--basil-surface-raised) !important;
}

[data-theme="dark"] .q-field--outlined .q-field__control {
  color: var(--basil-text) !important;
}

[data-theme="dark"] .q-field--outlined .q-field__control:hover::before {
  border-color: var(--basil-text-secondary) !important;
}


</style>

<script>
import { ref } from 'vue'
import store from './store'
import { triggerSync, fetchTransactionsForMonth } from './api'
import VenmoEnrichmentDialog from './components/VenmoEnrichmentDialog.vue'
import EmptyState from './components/EmptyState.vue'
import PullToRefresh from './components/PullToRefresh.vue'

export default {
  name: 'LayoutDefault',
  components: { EmptyState, PullToRefresh, VenmoEnrichmentDialog },

  data() {
    return {
      leftDrawerOpen: ref(false),
      headerScrolled: false,
      syncing: false,
      hasError: false,
      venmoDialogOpen: false,
      keyboardOpen: false,
    }
  },

  errorCaptured(err) {
    console.error('[App errorCaptured]:', err);
    this.hasError = true;
    return false; // prevent further propagation
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
        if (!(t.effectiveDate || t.date) || (t.effectiveDate || t.date).substring(0, 7) !== currentYM) continue;
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
    isDark() {
      return this.$store.state.theme === 'dark';
    },
  },

  created() {},

  mounted() {
    window.addEventListener('scroll', this.onScroll, { passive: true });
    // Hide bottom nav when keyboard opens on mobile (iOS PWA)
    window.addEventListener('focusin', this.onFocusIn);
    window.addEventListener('focusout', this.onFocusOut);
  },

  beforeUnmount() {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('focusin', this.onFocusIn);
    window.removeEventListener('focusout', this.onFocusOut);
  },

  methods: {
    toggleLeftDrawer() {
      this.leftDrawerOpen = !this.leftDrawerOpen;
    },
    toggleTheme() {
      this.$store.commit('setTheme', this.isDark ? '' : 'dark');
    },
    onScroll() {
      this.headerScrolled = window.scrollY > 4;
    },
    onFocusIn(e) {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') {
        this.keyboardOpen = true;
      }
    },
    onFocusOut() {
      this.keyboardOpen = false;
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
      this.venmoDialogOpen = true;
    },
    reload() {
      window.location.reload();
    },
  },
}
</script>
