<template>
  <q-layout view="hHh Lpr lFf">
    <q-header :class="['basil-header', headerScrolled && 'basil-header--scrolled']">
      <q-toolbar>
        <BasilButton
          v-if="$store.state.user?.onboarded_at"
          variant="icon" dense
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
        <BasilButton
          v-if="$store.state.session && $store.state.user?.onboarded_at"
          variant="icon" dense
          icon="sync"
          class="basil-sync-btn q-ml-sm"
          :class="{ 'basil-sync-btn--spinning': syncing }"
          :title="hasItemErrors ? 'Account needs attention — tap to sync' : 'Sync with bank'"
          @click="handleSync"
        >
          <q-badge v-if="hasItemErrors" floating color="warning" rounded class="basil-sync-badge" />
        </BasilButton>
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
      <BasilList>
        <template v-if="$store.state.session && $store.state.user?.onboarded_at">
          <div class="basil-drawer-section-label">Navigation</div>
          <BasilListItem clickable @click="$router.push('/plan'); leftDrawerOpen = false">
            <template #avatar><BasilIcon name="edit_note" /></template>
            <template #label>Plan</template>
            <template #caption>Budget planner</template>
          </BasilListItem>
          <BasilListItem clickable @click="$router.push('/rules'); leftDrawerOpen = false">
            <template #avatar><BasilIcon name="rule" /></template>
            <template #label>Rules</template>
            <template #caption>Manage categorization rules</template>
          </BasilListItem>
          <BasilListItem clickable @click="$router.push('/tags'); leftDrawerOpen = false">
            <template #avatar><BasilIcon name="sell" /></template>
            <template #label>Tags</template>
            <template #caption>Track spending by tag</template>
          </BasilListItem>
          <BasilSeparator class="q-my-sm" />
          <div class="basil-drawer-section-label">Tools</div>
          <BasilListItem clickable @click="openVenmoEnrichment">
            <template #avatar><BasilIcon name="sync_alt" /></template>
            <template #label>Venmo Import</template>
            <template #caption>Add names and notes to Venmo transactions</template>
          </BasilListItem>
          <BasilSeparator class="q-my-sm" />
          <BasilListItem clickable @click="toggleTheme">
            <template #avatar><BasilIcon :name="isDark ? 'light_mode' : 'dark_mode'" /></template>
            <template #label>{{ isDark ? 'Light mode' : 'Dark mode' }}</template>
          </BasilListItem>
          <BasilListItem clickable @click="$router.push('/privacy'); leftDrawerOpen = false">
            <template #avatar><BasilIcon name="policy" /></template>
            <template #label>Privacy Policy</template>
          </BasilListItem>
        </template>
      </BasilList>
    </q-drawer>

    <!-- Mobile bottom nav — hidden on desktop and when keyboard is open -->
    <q-footer v-if="$store.state.session && $store.state.user?.onboarded_at" v-show="!isKeyboardOpen" class="lt-sm basil-bottom-nav">
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
            <BasilButton
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

  <BasilKeyboard />
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
import BasilKeyboard from './components/BasilKeyboard.vue'
import { keyboardState } from './utils/basilKeyboard'

export default {
  name: 'LayoutDefault',
  components: { EmptyState, PullToRefresh, VenmoEnrichmentDialog, BasilKeyboard },

  data() {
    return {
      leftDrawerOpen: ref(false),
      headerScrolled: false,
      syncing: false,
      hasError: false,
      venmoDialogOpen: false,
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
    isKeyboardOpen() {
      return keyboardState.isOpen
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
  },

  beforeUnmount() {
    window.removeEventListener('scroll', this.onScroll);
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
