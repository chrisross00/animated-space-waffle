<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="admin-header">
      <q-toolbar>
        <q-toolbar-title class="admin-title">Basil Admin</q-toolbar-title>
        <template v-if="user">
          <span class="admin-user-name">{{ user.displayName || user.email }}</span>
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
    };
  },
  async created() {
    // Dev bypass: skip Firebase auth, go straight to admin check
    if (import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
      this.user = { displayName: 'Dev Bypass', email: 'dev@basil.test' };
      this.isAdmin = await checkAdmin();
      this.loading = false;
      return;
    }

    await authReady;
    auth.onAuthStateChanged(async (user) => {
      this.user = user;
      this.loading = false;
      if (user) {
        this.isAdmin = await checkAdmin();
      } else {
        this.isAdmin = false;
      }
    });
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
  },
};
</script>

<style>
body {
  background: #f5f5f5;
}
.admin-header {
  background: #2e7d32 !important;
}
.admin-title {
  font-weight: 600;
  font-size: 18px;
}
.admin-user-name {
  font-size: 14px;
  opacity: 0.9;
  margin-right: 8px;
}
.admin-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 50px);
}
.admin-login-card {
  text-align: center;
  padding: 48px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}
.admin-login-title {
  margin: 0 0 4px;
  font-weight: 600;
}
.admin-login-subtitle {
  margin: 0 0 24px;
  color: #666;
}
.admin-login-error {
  margin-top: 16px;
  color: #c62828;
  font-size: 14px;
}
</style>
