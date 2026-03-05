import ApiDr from './views/ApiDir.vue'
import BudgetView from './views/BudgetView.vue'
import BudgetPlannerView from './views/BudgetPlannerView.vue'
import ProfileView from './views/ProfileView.vue'
import MerchantBrowser from './views/MerchantBrowser.vue'
import TrendsView from './views/TrendsView.vue'
import OnboardingView from './views/OnboardingView.vue'

const routes = [
  {
    path: '/onboarding',
    name: 'OnboardingView',
    component: OnboardingView
  },
  {
    path: '/admin',
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
  {
    path: '/trends',
    name: 'TrendsView',
    component: TrendsView
  },
  {
    path: '/plan',
    name: 'BudgetPlannerView',
    component: BudgetPlannerView
  },
]

export default routes
