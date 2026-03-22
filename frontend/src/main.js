// Apply saved theme before app mounts — prevents flash of wrong theme
if (localStorage.getItem('basil-theme') === 'dark') {
  document.documentElement.dataset.theme = 'dark';
}

import * as Vue from 'vue'
import * as VueRouter from 'vue-router'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import store from './store'
import routes from './routes'
import { Quasar } from 'quasar'
import quasarUserOptions from './quasar-user-options'
import { consumeAuthToken, getOrAddUser, ensureAppData } from './api'

// Handle impersonation token from admin portal "Login As" flow.
// Consumes ?impersonate=<token> from URL, stores in sessionStorage, clears
// previous user state, and strips the param.
;(function handleImpersonation() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('impersonate');
  if (!token) return;

  // Clear previous user's state
  sessionStorage.clear();
  localStorage.removeItem('basil-store');
  localStorage.removeItem('basil-token');

  // Store token for getAuthHeaders() to pick up
  sessionStorage.setItem('impersonate-token', token);

  // Strip param from URL without reload
  params.delete('impersonate');
  const clean = params.toString();
  const url = window.location.pathname + (clean ? `?${clean}` : '');
  window.history.replaceState({}, '', url);
})();

// Consume ?token= from OAuth callback redirect (must run before auth hydration)
consumeAuthToken();

// Check for ?waitlisted= from OAuth redirect (user not on whitelist)
;(function checkWaitlisted() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('waitlisted')) {
    store.commit('setWaitlisted', true);
    params.delete('waitlisted');
    const clean = params.toString();
    const url = window.location.pathname + (clean ? `?${clean}` : '');
    window.history.replaceState({}, '', url);
  }
})();

// Hydrate auth state from token (JWT in sessionStorage, dev-bypass, or impersonation).
// Stored as a promise so the router guard can await it before deciding redirects.
const authReady = (async function hydrateAuth() {
  const hasToken = localStorage.getItem('basil-token');
  const hasImpersonation = sessionStorage.getItem('impersonate-token');
  const isDevBypass = import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

  if (hasToken || hasImpersonation || isDevBypass) {
    try {
      const appUser = await getOrAddUser();
      if (appUser) {
        store.commit('setUser', appUser);
        if (!store.state.session) store.commit('setSession', { isSessionActive: true });
        ensureAppData(store);
      }
    } catch (err) {
      console.error('Auth hydration error:', err);
      // Token may be expired — clear it so user sees login screen
      localStorage.removeItem('basil-token');
    }
  }
})();


const router = VueRouter.createRouter({
  history: VueRouter.createWebHistory(),
  routes,
})

const PUBLIC_ROUTES = ['/profile', '/onboarding', '/privacy'];
const ONBOARDING_ALLOWED = ['/profile', '/onboarding', '/privacy'];
let isFirstNavigation = true;
router.beforeEach(async (to, _from, next) => {
  // Wait for auth hydration to finish before the first guard decision.
  // Prevents redirect-to-/profile race when a valid token exists.
  if (isFirstNavigation) {
    await authReady;
  }
  const firstNav = isFirstNavigation;
  isFirstNavigation = false;

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
    next('/accounts');
  } else if (firstNav && to.path === '/' && store.state.user?.onboarded_at) {
    // Initial page load on / (e.g. after OAuth callback) — send onboarded
    // users to Accounts. Subsequent navigations to / (Budget tab) pass through.
    next('/accounts');
  } else {
    next();
  }
});


const app = Vue.createApp(App).use(Quasar, quasarUserOptions)

// Initialize Sentry (no-ops silently if DSN is not set)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    app,
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration({ router }),
    ],
    tracesSampleRate: 0.2,
  });
}

// Global error handler — catches unhandled errors from any component
app.config.errorHandler = (err, instance, info) => {
  console.error(`[Vue error] ${info}:`, err);
  if (sentryDsn) Sentry.captureException(err);
}

app.use(router)
app.use(store)
  .mount('#app')
