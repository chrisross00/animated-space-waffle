import * as Vue from 'vue'
import * as VueRouter from 'vue-router'
import App from './App.vue'
import routes from './routes'
import { Quasar } from 'quasar'
import quasarUserOptions from './quasar-user-options'


const router = VueRouter.createRouter({
  history: VueRouter.createWebHistory(),
  routes,
})


const app = Vue.createApp(App).use(Quasar, quasarUserOptions)
app.use(router)
  .mount('#app')