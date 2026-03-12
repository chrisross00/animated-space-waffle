// Apply saved theme before app mounts — prevents flash of wrong theme
if (localStorage.getItem('basil-theme') === 'dark') {
  document.documentElement.dataset.theme = 'dark';
}

import * as Vue from 'vue'
import * as VueRouter from 'vue-router'
import App from './App.vue'
import store from './store'
import routes from './routes'
import { Quasar } from 'quasar'
import quasarUserOptions from './quasar-user-options'
import { auth, getOrAddUser, ensureAppData } from './firebase'

// Handle impersonation token from admin portal "Login As" flow.
// Consumes ?impersonate=<token> from URL, stores in sessionStorage, clears
// previous user state, and strips the param.
;(function handleImpersonation() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('impersonate');
  if (!token) return;

  // Clear previous user's state
  sessionStorage.clear();

  // Store token for getAuthHeaders() to pick up
  sessionStorage.setItem('impersonate-token', token);

  // Strip param from URL without reload
  params.delete('impersonate');
  const clean = params.toString();
  const url = window.location.pathname + (clean ? `?${clean}` : '');
  window.history.replaceState({}, '', url);
})();

auth.onAuthStateChanged(async (firebaseUser) => {
  if (firebaseUser) {
    // Fetch the real app user (with onboarded_at, accounts, etc.) from the backend
    try {
      const appUser = await getOrAddUser();
      store.commit('setUser', appUser);
      if (!store.state.session) store.commit('setSession', { isSessionActive: true });
      ensureAppData(store);
    } catch (err) {
      console.error('onAuthStateChanged: failed to fetch app user', err);
      store.commit('setUser', firebaseUser); // fallback to raw Firebase user
    }
  } else if (sessionStorage.getItem('impersonate-token')) {
    // Admin portal impersonation: no Firebase user, but we have a token
    try {
      const appUser = await getOrAddUser();
      store.commit('setUser', appUser);
      if (!store.state.session) store.commit('setSession', { isSessionActive: true });
      ensureAppData(store);
    } catch (err) {
      console.error('Impersonation auth error:', err);
      sessionStorage.removeItem('impersonate-token');
    }
  } else if (store.state.session && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
    // Dev-bypass: no Firebase user, but session persisted — restore app user
    try {
      const appUser = await getOrAddUser();
      store.commit('setUser', appUser);
      ensureAppData(store);
    } catch (err) {
      console.error('Dev-bypass user restore error:', err);
    }
  } else {
    store.commit('setUser', null);
  }
})


const router = VueRouter.createRouter({
  history: VueRouter.createWebHistory(),
  routes,
})

const PUBLIC_ROUTES = ['/profile', '/onboarding'];
const ONBOARDING_ALLOWED = ['/', '/plan', '/profile', '/onboarding'];
router.beforeEach((to, _from, next) => {
  if (!PUBLIC_ROUTES.includes(to.path) && !store.state.session) {
    next('/profile');
  } else if (
    store.state.session &&
    !store.state.user?.onboarded_at &&
    !store.state.bootstrapping &&
    !ONBOARDING_ALLOWED.includes(to.path)
  ) {
    next('/onboarding');
  } else if (to.path === '/onboarding' && store.state.user?.onboarded_at) {
    next('/');
  } else {
    next();
  }
});


const app = Vue.createApp(App).use(Quasar, quasarUserOptions)

// Global error handler — catches unhandled errors from any component.
// Logs to console.error (Sentry will hook into this later in Phase 4).
app.config.errorHandler = (err, instance, info) => {
  console.error(`[Vue error] ${info}:`, err);
}

app.use(router)
app.use(store)
  .mount('#app')
