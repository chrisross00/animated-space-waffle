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

        <!-- Theme toggle -->
        <q-btn
          flat round dense
          :icon="isDark ? 'light_mode' : 'dark_mode'"
          class="basil-theme-btn q-ml-sm"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        />
      </q-toolbar>

      <q-tabs align="left" class="basil-tabs">
        <q-route-tab to="/" icon="account_balance_wallet" label="Budget" />
        <q-route-tab to="/trends" icon="bar_chart" label="Trends" />
        <q-route-tab to="/merchants" icon="store" label="Merchants" />
        <q-route-tab to="/api" icon="build" label="Toolbox" />
        <q-route-tab to="/profile" icon="person" label="Profile" />
      </q-tabs>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      side="left"
      overlay
      elevated
    >
      <q-list>
        <q-item-label header>Essential Links</q-item-label>
        <q-item clickable tag="a" target="_blank" href="/api">
          <q-item-section avatar>
            <q-icon name="build" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Toolbox</q-item-label>
            <q-item-label caption>Admin tools</q-item-label>
          </q-item-section>
        </q-item>
        <q-item clickable tag="a" target="_blank" href="https://github.com/quasarframework/">
          <q-item-section avatar>
            <q-icon name="school" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Github</q-item-label>
            <q-item-label caption>github.com/quasarframework</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view></router-view>
    </q-page-container>
  </q-layout>
</template>

<style>
/* ---- Base ---- */
html, body, #app {
  background-color: var(--basil-bg);
  color: var(--basil-text);
  font-family: var(--basil-font-ui);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ---- Surface hierarchy ---- */
.q-page {
  background-color: var(--basil-bg);
}

.q-card {
  background-color: var(--basil-surface);
  border: 1px solid var(--basil-border);
  box-shadow: var(--basil-shadow-sm) !important;
  border-radius: var(--basil-radius-md) !important;
}

.q-dialog .q-card {
  background-color: var(--basil-surface-dialog);
}

/* ---- Drawer ---- */
.q-drawer {
  background-color: var(--basil-surface) !important;
  border-right: 1px solid var(--basil-border);
}

/* ---- List items ---- */
.q-item {
  color: var(--basil-text);
}

/* ---- Chips ---- */
.q-chip {
  font-family: var(--basil-font-ui);
}

/* ---- Tables ---- */
.q-table thead th {
  font-family: var(--basil-font-ui);
  font-weight: 600;
  color: var(--basil-text-secondary);
  border-bottom: 1px solid var(--basil-border-strong);
  background-color: var(--basil-surface-alt);
}

.q-table tbody td {
  border-bottom: 1px solid var(--basil-border);
  color: var(--basil-text);
}

.q-table tbody tr:hover td {
  background-color: var(--basil-surface-alt);
}

/* ---- Inputs ---- */
.q-field__label {
  color: var(--basil-text-secondary);
}

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

/* ---- Theme toggle button ---- */
.basil-theme-btn {
  color: var(--basil-text-secondary) !important;
  transition: color var(--basil-t-fast) var(--basil-ease);
}
.basil-theme-btn:hover {
  color: var(--basil-text) !important;
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
   Dark mode — Quasar component surface overrides
   Quasar components use their own backgrounds that don't
   inherit our token variables automatically.
   ======================================== */
[data-theme="dark"] html,
[data-theme="dark"] body,
[data-theme="dark"] #app {
  background-color: var(--basil-bg) !important;
  color: var(--basil-text) !important;
}

[data-theme="dark"] .q-page {
  background-color: var(--basil-bg) !important;
}

[data-theme="dark"] .q-card {
  background-color: var(--basil-surface) !important;
  border-color: var(--basil-border) !important;
}

[data-theme="dark"] .q-dialog .q-card {
  background-color: var(--basil-surface-dialog) !important;
}

/* Table rows */
[data-theme="dark"] .q-table {
  background-color: var(--basil-surface);
  color: var(--basil-text);
}

[data-theme="dark"] .q-table thead th {
  background-color: var(--basil-surface-alt) !important;
  color: var(--basil-text-secondary) !important;
  border-bottom-color: var(--basil-border-strong) !important;
}

[data-theme="dark"] .q-table tbody td {
  background-color: var(--basil-surface) !important;
  color: var(--basil-text) !important;
  border-bottom-color: var(--basil-border) !important;
}

[data-theme="dark"] .q-table tbody tr:hover td {
  background-color: var(--basil-surface-alt) !important;
}

/* List items */
[data-theme="dark"] .q-item {
  color: var(--basil-text);
}

[data-theme="dark"] .q-item__label {
  color: var(--basil-text);
}

[data-theme="dark"] .q-item__label--caption {
  color: var(--basil-text-muted);
}

/* Separator */
[data-theme="dark"] .q-separator {
  background-color: var(--basil-border);
}

/* Banner */
[data-theme="dark"] .q-banner {
  background-color: var(--basil-info-bg) !important;
  color: var(--basil-text) !important;
}

/* Input / select fields */
[data-theme="dark"] .q-field__native,
[data-theme="dark"] .q-field__prefix,
[data-theme="dark"] .q-field__suffix,
[data-theme="dark"] .q-field__input {
  color: var(--basil-text) !important;
  caret-color: var(--basil-text) !important;
}

[data-theme="dark"] .q-field--outlined .q-field__control {
  background-color: var(--basil-surface-alt) !important;
}

[data-theme="dark"] .q-field--outlined .q-field__control:before {
  border-color: var(--basil-border) !important;
}

[data-theme="dark"] .q-field__label {
  color: var(--basil-text-secondary) !important;
}

[data-theme="dark"] .q-field__marginal {
  color: var(--basil-text-muted) !important;
}

/* Dropdown / popup menus */
[data-theme="dark"] .q-menu {
  background-color: var(--basil-surface-raised) !important;
  border: 1px solid var(--basil-border) !important;
  color: var(--basil-text) !important;
}

[data-theme="dark"] .q-menu .q-item {
  color: var(--basil-text) !important;
}

[data-theme="dark"] .q-menu .q-item:hover,
[data-theme="dark"] .q-menu .q-item--active {
  background-color: var(--basil-surface-alt) !important;
}

/* Chips */
[data-theme="dark"] .q-chip {
  background-color: var(--basil-surface-alt) !important;
  color: var(--basil-text) !important;
}

/* Toggle label */
[data-theme="dark"] .q-toggle__label {
  color: var(--basil-text);
}

/* Btn-toggle */
[data-theme="dark"] .q-btn-toggle .q-btn--standard {
  background-color: var(--basil-surface-alt) !important;
  color: var(--basil-text-secondary) !important;
}

/* Drawer */
[data-theme="dark"] .q-drawer {
  background-color: var(--basil-surface) !important;
  border-right-color: var(--basil-border) !important;
}

/* ---- Tabs ---- */
.basil-tabs {
  color: var(--basil-text-secondary) !important;
}

/* Active tab */
.basil-tabs .q-tab--active {
  color: var(--basil-green) !important;
}

/* Indicator line */
.basil-tabs .q-tab__indicator {
  background-color: var(--basil-green);
  height: 2px;
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
  },
}
</script>
