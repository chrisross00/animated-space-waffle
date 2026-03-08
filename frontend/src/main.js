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
  } else {
    next();
  }
});


const app = Vue.createApp(App).use(Quasar, quasarUserOptions)

app.use(router)
app.use(store)
  .mount('#app')


