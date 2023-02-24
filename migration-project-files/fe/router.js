// router.js
import { createRouter, createWebHistory } from 'vue-router'
import Home from '../components/Home.vue'
import Find from '../components/Find.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home
  },
  {
    path: '/find',
    name: 'find',
    component: Find
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router