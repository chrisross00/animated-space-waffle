<template>
  <div class="basil-shell">
    <header :class="['basil-header', headerScrolled && 'basil-header--scrolled']">
      <div class="basil-header__toolbar">
        <BasilButton
          v-if="$store.state.user?.onboarded_at"
          variant="icon" dense
          icon="menu"
          class="basil-menu-btn"
          @click="toggleLeftDrawer"
        />

        <span class="basil-header__title basil-wordmark">
          <a href="/" class="basil-wordmark__link">Basil</a>
        </span>

        <!-- Spacer to push right-side items to the right -->
        <div style="flex: 1" />

        <!-- Current-month summary — visible when data is loaded, desktop only -->
        <div v-if="headerStats" class="basil-header-stat basil-desktop-only">
          <span class="basil-header-stat__spend">${{ headerStats.expenseSpendFmt }} spent</span>
          <span class="basil-header-stat__dot">·</span>
          <span class="basil-header-stat__earned">${{ headerStats.incomeAmountFmt }} earned</span>
        </div>

        <!-- Sync button -->
        <BasilButton
          v-if="$store.state.session && $store.state.user?.onboarded_at"
          variant="icon" dense
          icon="sync"
          class="basil-sync-btn"
          :class="{ 'basil-sync-btn--spinning': syncing }"
          :title="hasItemErrors ? 'Account needs attention — tap to sync' : 'Sync with bank'"
          @click="handleSync"
        >
          <BasilBadge v-if="hasItemErrors" floating color="warning" />
        </BasilButton>
      </div>

      <!-- Desktop tab bar — hidden on mobile -->
      <BasilTabs class="basil-desktop-tabs basil-desktop-only">
        <template v-if="$store.state.session && $store.state.user?.onboarded_at">
          <BasilTab name="budget" to="/budget" icon="account_balance_wallet" label="Budget" />
          <BasilTab name="accounts" to="/accounts" icon="account_balance" label="Accounts" />
          <BasilTab name="plan" to="/plan" icon="edit_note" label="Plan" />
          <BasilTab name="trends" to="/trends" icon="bar_chart" label="Trends" />
          <BasilTab name="rules" to="/rules" icon="rule" label="Rules" />
          <BasilTab name="tags" to="/tags" icon="sell" label="Tags" />
        </template>
        <BasilTab name="profile" to="/profile" icon="person" label="Profile" />
      </BasilTabs>

      <!-- Global thin progress bar — visible while bootstrapping app data -->
      <BasilProgress
        v-if="$store.state.bootstrapping"
        indeterminate
        color="primary"
        class="basil-loading-bar"
      />
    </header>

    <!-- Drawer backdrop -->
    <div
      class="basil-drawer-backdrop"
      :class="{ 'basil-drawer-backdrop--visible': leftDrawerOpen }"
      @click="leftDrawerOpen = false"
    />

    <!-- Left drawer -->
    <aside class="basil-drawer" :class="{ 'basil-drawer--open': leftDrawerOpen }">
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
          <BasilSeparator class="basil-drawer__separator" />
          <div class="basil-drawer-section-label">Tools</div>
          <BasilListItem clickable @click="openVenmoEnrichment">
            <template #avatar><BasilIcon name="sync_alt" /></template>
            <template #label>Venmo Import</template>
            <template #caption>Add names and notes to Venmo transactions</template>
          </BasilListItem>
          <BasilSeparator class="basil-drawer__separator" />
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
    </aside>

    <!-- Mobile bottom nav — hidden on desktop and when keyboard is open -->
    <nav
      v-if="$store.state.session && $store.state.user?.onboarded_at"
      v-show="!isKeyboardOpen"
      class="basil-footer basil-mobile-only"
    >
      <BasilTabs class="basil-bottom-tabs">
        <BasilTab name="budget" to="/budget" icon="account_balance_wallet" label="Budget" />
        <BasilTab v-if="$store.state.user?.onboarded_at" name="accounts" to="/accounts" icon="account_balance" label="Accounts" />
        <BasilTab v-if="$store.state.user?.onboarded_at" name="trends" to="/trends" icon="bar_chart" label="Trends" />
        <BasilTab name="profile" to="/profile" icon="person" label="Profile" />
      </BasilTabs>
    </nav>

    <main class="basil-main" :class="{ 'basil-main--has-footer': $store.state.session && $store.state.user?.onboarded_at }">
      <template v-if="hasError">
        <div class="basil-error-page">
          <EmptyState
            icon="error_outline"
            heading="Something went wrong"
            body="An unexpected error occurred. Reloading usually fixes it."
          >
            <BasilButton
              label="Reload"
              class="basil-error-page__btn"
              @click="reload"
            />
          </EmptyState>
        </div>
      </template>
      <template v-else>
        <PullToRefresh>
          <router-view v-slot="{ Component, route }">
            <Transition :name="transitionName" :mode="transitionName === 'basil-page' ? 'out-in' : undefined">
              <KeepAlive include="BudgetView">
                <component :is="Component" :key="route.path" />
              </KeepAlive>
            </Transition>
          </router-view>
        </PullToRefresh>
      </template>
    </main>

    <VenmoEnrichmentDialog v-model="venmoDialogOpen" />
  </div>

  <BasilKeyboard />
  <BasilToast />
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
   Header — title area
   ======================================== */
.basil-header__title {
  flex-shrink: 0;
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
.basil-sync-btn--spinning .basil-icon {
  animation: basil-spin 0.8s linear infinite;
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

/* Slide transition for drill-down navigation.
   Both pages must overlap during the slide, so they need
   position:absolute within the relative PullToRefresh container. */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  min-height: 100%;
}
.slide-left-enter-from {
  transform: translateX(100%);
}
.slide-left-leave-to {
  transform: translateX(-30%);
}
.slide-right-enter-from {
  transform: translateX(-30%);
}
.slide-right-leave-to {
  transform: translateX(100%);
}

/* ========================================
   Desktop tabs — horizontal alignment
   ======================================== */
.basil-desktop-tabs {
  padding: 0 var(--basil-space-3);
}

/* ========================================
   Mobile bottom nav — tab layout
   ======================================== */
.basil-bottom-tabs {
  display: flex;
  justify-content: space-around;
}

.basil-bottom-tabs .basil-tab {
  padding: 12px var(--basil-space-3);
}

/* ========================================
   Drawer section label
   ======================================== */
.basil-drawer-section-label {
  color: var(--basil-text-secondary) !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--basil-space-3) var(--basil-space-4) var(--basil-space-1);
}

.basil-drawer__separator {
  margin: var(--basil-space-2) 0;
}

/* ========================================
   Error page — centered layout
   ======================================== */
.basil-error-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

.basil-error-page__btn {
  margin-top: var(--basil-space-4);
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
      transitionName: 'basil-page',
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

  watch: {
    $route(to, from) {
      if (to.meta.transition === 'slide') {
        // Forward into drill-down: slide in from right
        const main = document.querySelector('.basil-main')
        if (main) this._savedScroll = { path: from.path, top: main.scrollTop }
        this.transitionName = 'slide-left'
      } else if (from.meta.transition === 'slide') {
        // Back from drill-down: instant swap (no transition).
        // iOS swipe-back already animates; back button should restore
        // state immediately. Scroll restore happens synchronously
        // because KeepAlive means BudgetView is already in the DOM.
        this.transitionName = 'none'
        const main = document.querySelector('.basil-main')
        if (main && this._savedScroll && this._savedScroll.path === to.path) {
          this.$nextTick(() => { main.scrollTop = this._savedScroll.top })
          this._savedScroll = null
        }
      } else {
        this.transitionName = 'basil-page'
      }
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
