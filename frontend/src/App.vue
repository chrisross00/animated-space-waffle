<template>
  <q-layout view="hHh Lpr lFf">
    <q-header elevated class="bg-primary text-white" height-hint="98">
      <q-toolbar>
        <q-btn dense flat round icon="menu" @click="toggleLeftDrawer" />

        <q-toolbar-title>
          <q-avatar>
            <a href="/">
              <img alt="Vue logo" src="./assets/logo.png">
            </a>
          </q-avatar>
          Basil
        </q-toolbar-title>
      </q-toolbar>

      <q-tabs align="left">
        <q-route-tab to="/" label="View Budget" />
        <q-route-tab to="/trends" label="Trends" />
        <q-route-tab to="/merchants" label="Merchants" />
        <q-route-tab to="/api" label="API Directory" />
        <q-route-tab to="/profile" label="Profile" />
      </q-tabs>
    </q-header>

    <q-drawer
      v-model="leftDrawerOpen"
      side="left"
      class="bg-grey-2"
      overlay
      elevated
    >
      <q-list>
        <q-item-label header>Essential Links</q-item-label>
        <q-item clickable tag="a" target="_blank" href="/api">
          <q-item-section avatar>
            <q-icon name="code" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Toolbox</q-item-label>
            <q-item-label caption>/api endpoint with various</q-item-label>
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
        <q-item clickable tag="a" target="_blank" href="https://chat.quasar.dev">
          <q-item-section avatar>
            <q-icon name="chat" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Discord Chat Channel</q-item-label>
            <q-item-label caption>chat.quasar.dev</q-item-label>
          </q-item-section>
        </q-item>
        <q-item clickable tag="a" target="_blank" href="https://forum.quasar.dev">
          <q-item-section avatar>
            <q-icon name="forum" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Forum</q-item-label>
            <q-item-label caption>forum.quasar.dev</q-item-label>
          </q-item-section>
        </q-item>
        <q-item clickable tag="a" target="_blank" href="https://twitter.com/quasarframework">
          <q-item-section avatar>
            <q-icon name="rss_feed" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Twitter</q-item-label>
            <q-item-label caption>@quasarframework</q-item-label>
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

/* ---- Navigation ---- */
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
</style>

<script>
import { ref } from 'vue'

export default {
  name: 'LayoutDefault',
  // name: 'App',

  components: {
  },

  setup () {
    const leftDrawerOpen = ref(false);
    return {
      leftDrawerOpen,
      toggleLeftDrawer () {
        leftDrawerOpen.value = !leftDrawerOpen.value
      }
    }
  }
}
</script>