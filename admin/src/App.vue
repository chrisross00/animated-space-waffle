<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="admin-header">
      <q-toolbar>
        <q-toolbar-title class="admin-title">Basil Admin</q-toolbar-title>
        <q-tabs
          v-if="user && isAdmin"
          v-model="activeTab"
          shrink
          active-color="white"
          indicator-color="white"
          class="admin-nav-tabs"
        >
          <q-route-tab name="test-users" label="Test Users" to="/test-users" />
          <q-route-tab name="toolbox" label="Toolbox" to="/toolbox" />
        </q-tabs>
        <q-space />
        <template v-if="user">
          <span class="admin-user-name">{{ user.displayName || user.email }}</span>
          <q-btn flat dense :icon="darkMode ? 'light_mode' : 'dark_mode'" @click="toggleDarkMode" class="admin-theme-btn" />
          <q-btn flat dense icon="logout" @click="handleSignOut" />
        </template>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <template v-if="loading">
        <div class="admin-center">
          <q-spinner size="48px" />
        </div>
      </template>

      <template v-else-if="!user">
        <div class="admin-center">
          <div class="admin-login-card">
            <h5 class="admin-login-title">Basil Admin</h5>
            <p class="admin-login-subtitle">Sign in with an admin account</p>
            <q-btn
              color="primary"
              label="Sign in with Google"
              icon="login"
              @click="handleSignIn"
              :loading="signingIn"
            />
            <p v-if="authError" class="admin-login-error">{{ authError }}</p>
          </div>
        </div>
      </template>

      <template v-else-if="!isAdmin">
        <div class="admin-center">
          <div class="admin-login-card">
            <q-icon name="block" size="48px" color="negative" />
            <h6>Access Denied</h6>
            <p>{{ user.email }} is not an admin account.</p>
            <q-btn flat label="Sign out" @click="handleSignOut" />
          </div>
        </div>
      </template>

      <template v-else>
        <router-view />
      </template>
    </q-page-container>
  </q-layout>
</template>

<script>
import { auth, authReady, signInWithGoogle, signOut } from './auth';
import { checkAdmin } from './api';

export default {
  data() {
    return {
      user: null,
      isAdmin: false,
      loading: true,
      signingIn: false,
      authError: null,
      activeTab: 'test-users',
      darkMode: localStorage.getItem('basil-admin-theme') === 'dark',
    };
  },
  mounted() {
    if (this.darkMode) {
      document.documentElement.dataset.theme = 'dark';
    }
  },
  async created() {
    // Dev bypass: skip Firebase auth, go straight to admin check
    if (import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
      this.user = { displayName: 'Dev Bypass', email: 'dev@basil.test' };
      this.isAdmin = await checkAdmin();
      this.loading = false;
      return;
    }

    const handleUser = async (user) => {
      this.user = user;
      this.loading = false;
      if (user) {
        this.isAdmin = await checkAdmin();
      } else {
        this.isAdmin = false;
      }
    };

    // Register listener first, then check current state.
    // onAuthStateChanged fires immediately with current state on registration.
    auth.onAuthStateChanged(handleUser);
  },
  methods: {
    async handleSignIn() {
      this.signingIn = true;
      this.authError = null;
      try {
        await signInWithGoogle();
      } catch (err) {
        this.authError = err.message;
      } finally {
        this.signingIn = false;
      }
    },
    async handleSignOut() {
      await signOut();
      this.user = null;
      this.isAdmin = false;
    },
    toggleDarkMode() {
      this.darkMode = !this.darkMode;
      if (this.darkMode) {
        document.documentElement.dataset.theme = 'dark';
        localStorage.setItem('basil-admin-theme', 'dark');
      } else {
        delete document.documentElement.dataset.theme;
        localStorage.setItem('basil-admin-theme', '');
      }
      document.documentElement.classList.add('basil-theme-transitioning');
      setTimeout(() => document.documentElement.classList.remove('basil-theme-transitioning'), 350);
    },
  },
};
</script>

<style>
body {
  background: var(--basil-bg);
  font-family: var(--basil-font-ui);
  color: var(--basil-text);
}
.admin-header {
  background: var(--basil-green) !important;
}
.admin-title {
  font-family: var(--basil-font-display);
  font-weight: 400;
  font-size: 20px;
  letter-spacing: 0.01em;
  flex: 0 0 auto;
}
.admin-nav-tabs {
  margin-left: var(--basil-space-4);
}
.admin-nav-tabs .q-tab {
  color: rgba(255, 255, 255, 0.7);
  text-transform: none;
  font-weight: 500;
  min-width: 0;
  padding: 0 var(--basil-space-3);
}
.admin-nav-tabs .q-tab--active {
  color: #ffffff;
}
.admin-user-name {
  font-size: 14px;
  opacity: 0.9;
  margin-right: var(--basil-space-2);
}
.admin-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 50px);
}
.admin-login-card {
  text-align: center;
  padding: var(--basil-space-7);
  background: var(--basil-surface);
  border-radius: var(--basil-radius-lg);
  box-shadow: var(--basil-shadow-md);
}
.admin-login-title {
  margin: 0 0 var(--basil-space-1);
  font-family: var(--basil-font-display);
  font-weight: 400;
  color: var(--basil-text);
}
.admin-login-subtitle {
  margin: 0 0 var(--basil-space-5);
  color: var(--basil-text-secondary);
}
.admin-login-error {
  margin-top: var(--basil-space-4);
  color: var(--basil-negative);
  font-size: 14px;
}
.admin-theme-btn {
  color: rgba(255, 255, 255, 0.7) !important;
}

/* ---- Dark mode: Quasar component overrides ---- */
[data-theme="dark"] .q-card {
  background-color: var(--basil-surface) !important;
  color: var(--basil-text) !important;
}
[data-theme="dark"] .q-item {
  color: var(--basil-text) !important;
}
[data-theme="dark"] .q-field__control {
  color: var(--basil-text) !important;
}
[data-theme="dark"] .q-field__label {
  color: var(--basil-text-secondary) !important;
}
[data-theme="dark"] .q-field--outlined .q-field__control:hover::before {
  border-color: var(--basil-text-secondary) !important;
}
[data-theme="dark"] .q-field__native,
[data-theme="dark"] .q-field__input {
  color: var(--basil-text) !important;
}
[data-theme="dark"] .q-table {
  background-color: var(--basil-surface) !important;
  color: var(--basil-text) !important;
}
[data-theme="dark"] .q-table thead th {
  color: var(--basil-text-secondary) !important;
}
[data-theme="dark"] .q-table tbody td {
  color: var(--basil-text) !important;
}
[data-theme="dark"] .q-table__bottom {
  color: var(--basil-text-secondary) !important;
}
[data-theme="dark"] .q-separator {
  background-color: var(--basil-border) !important;
}
</style>
