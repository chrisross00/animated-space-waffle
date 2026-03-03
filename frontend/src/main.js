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
import { auth  } from './firebase' // Import the initialized Firebase app object

auth.onAuthStateChanged(user => {
  store.dispatch('setUser', user)
})


const router = VueRouter.createRouter({
  history: VueRouter.createWebHistory(),
  routes,
})


const app = Vue.createApp(App).use(Quasar, quasarUserOptions)
app.use(router)
app.use(store)
  .mount('#app')


