import * as Vue from 'vue'
import * as VueRouter from 'vue-router'
import App from './App.vue'
import routes from './routes'

const router = VueRouter.createRouter({
  history: VueRouter.createWebHistory(),
  routes,
})


const app = Vue.createApp(App)
app.use(router)
  .mount('#app')