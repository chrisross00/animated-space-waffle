import { createRouter, createWebHistory } from 'vue-router';
import TestUsers from './views/TestUsers.vue';
import ToolboxView from './views/ToolboxView.vue';

const routes = [
  { path: '/', redirect: '/test-users' },
  { path: '/test-users', component: TestUsers },
  { path: '/toolbox', component: ToolboxView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
