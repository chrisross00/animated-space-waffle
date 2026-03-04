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
          <span class="basil-header-stat__spend">{{ currencySymbol }}{{ headerStats.expenseSpendFmt }} spent</span>
          <span class="basil-header-stat__dot">·</span>
          <span class="basil-header-stat__earned">{{ currencySymbol }}{{ headerStats.incomeAmountFmt }} earned</span>
        </div>

      </q-toolbar>

      <q-tabs align="left" class="basil-tabs">
        <template v-if="$store.state.session">
          <q-route-tab to="/" icon="account_balance_wallet" label="Budget" />
          <q-route-tab to="/plan" icon="edit_note" label="Plan" />
          <q-route-tab to="/trends" icon="bar_chart" label="Trends" />
          <q-route-tab to="/merchants" icon="store" label="Merchants" />
          <q-route-tab to="/api" icon="build" label="Toolbox" />
        </template>
        <q-route-tab to="/profile" icon="person" label="Profile" />
      </q-tabs>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      side="left"
      overlay
      elevated
      class="basil-settings-drawer"
    >
      <div class="basil-settings-drawer__header">
        <span class="basil-card-label">Settings</span>
      </div>

      <q-list>
        <q-item-label header class="basil-settings-section-label">Appearance</q-item-label>

        <q-item tag="label" class="basil-settings-item">
          <q-item-section avatar>
            <q-icon :name="isDark ? 'dark_mode' : 'light_mode'" class="basil-settings-icon" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Dark mode</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle :model-value="isDark" @update:model-value="toggleTheme" color="primary" />
          </q-item-section>
        </q-item>

        <q-item class="basil-settings-item">
          <q-item-section avatar>
            <q-icon name="attach_money" class="basil-settings-icon" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Currency symbol</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-select
              :model-value="settings.currencySymbol"
              @update:model-value="setSetting('currencySymbol', $event)"
              :options="['$', '€', '£', '¥', '₹']"
              dense outlined
              style="width: 64px"
            />
          </q-item-section>
        </q-item>

        <q-item-label header class="basil-settings-section-label">Budget</q-item-label>

        <q-item class="basil-settings-item">
          <q-item-section avatar>
            <q-icon name="calendar_month" class="basil-settings-icon" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Default month</q-item-label>
            <q-item-label caption>Which month opens on load</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-select
              :model-value="settings.defaultMonth"
              @update:model-value="setSetting('defaultMonth', $event)"
              :options="[{ label: 'Current', value: 'current' }, { label: 'Previous', value: 'last' }]"
              emit-value map-options
              dense outlined
              style="width: 100px"
            />
          </q-item-section>
        </q-item>

        <q-item tag="label" class="basil-settings-item">
          <q-item-section avatar>
            <q-icon name="visibility_off" class="basil-settings-icon" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Hide excluded transactions</q-item-label>
            <q-item-label caption>Collapse excluded from lists</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              :model-value="settings.hideExcluded"
              @update:model-value="setSetting('hideExcluded', $event)"
              color="primary"
            />
          </q-item-section>
        </q-item>

        <q-item-label header class="basil-settings-section-label">Charts</q-item-label>

        <q-item class="basil-settings-item">
          <q-item-section avatar>
            <q-icon name="bar_chart" class="basil-settings-icon" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Default range</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-select
              :model-value="settings.chartRange"
              @update:model-value="setSetting('chartRange', $event)"
              :options="[{ label: '3 months', value: 3 }, { label: '6 months', value: 6 }, { label: '12 months', value: 12 }]"
              emit-value map-options
              dense outlined
              style="width: 100px"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

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

/* ---- Settings drawer ---- */
.basil-settings-drawer {
  background-color: var(--basil-surface) !important;
  color: var(--basil-text) !important;
}
.basil-settings-drawer__header {
  padding: var(--basil-space-5) var(--basil-space-5) var(--basil-space-3);
  border-bottom: 1px solid var(--basil-border);
}
.basil-settings-section-label {
  color: var(--basil-text-secondary) !important;
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.basil-settings-item {
  color: var(--basil-text) !important;
}
.basil-settings-icon {
  color: var(--basil-text-secondary) !important;
}
[data-theme="dark"] .basil-settings-drawer .q-item__label {
  color: var(--basil-text) !important;
}
[data-theme="dark"] .basil-settings-drawer .q-item__label--caption {
  color: var(--basil-text-secondary) !important;
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

</style>

<script>
import { ref } from 'vue'

export default {
  name: 'LayoutDefault',

  data() {
    return {
      leftDrawerOpen: ref(false),
      headerScrolled: false,
    }
  },

  computed: {
    isDark() {
      return this.$store.state.theme === 'dark';
    },
    settings() {
      return this.$store.state.settings;
    },
    currencySymbol() {
      return this.$store.state.settings.currencySymbol;
    },
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
  },

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
    toggleTheme() {
      this.$store.commit('setTheme', this.isDark ? '' : 'dark');
    },
    setSetting(key, value) {
      this.$store.commit('setSetting', { key, value });
    },
  },
}
</script>
