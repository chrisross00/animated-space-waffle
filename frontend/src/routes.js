import ApiDr from './views/ApiDir.vue'
import BudgetView from './views/BudgetView.vue'
import ProfileView from './views/ProfileView.vue'

const routes = [
  {
    path: '/api/',
    name: 'ApiDr',
    component: ApiDr
  },
  {
    path: '/',
    name: 'BudgetView',
    component: BudgetView
  },
  {
    path: '/profile',
    name: 'ProfileView',
    component: ProfileView
  },
]

export default routes
