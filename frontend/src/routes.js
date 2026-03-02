import ApiDr from './views/ApiDir.vue'
import BudgetView from './views/BudgetView.vue'
import ProfileView from './views/ProfileView.vue'
import MerchantBrowser from './views/MerchantBrowser.vue'

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
  {
    path: '/merchants',
    name: 'MerchantBrowser',
    component: MerchantBrowser
  },
]

export default routes
