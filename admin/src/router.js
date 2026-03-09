import { createRouter, createWebHistory } from 'vue-router';
import TestUsers from './views/TestUsers.vue';

const routes = [
  { path: '/', redirect: '/test-users' },
  { path: '/test-users', component: TestUsers },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
