import AccountsView from './views/AccountsView.vue'
import BudgetView from './views/BudgetView.vue'
import BudgetPlannerView from './views/BudgetPlannerView.vue'
import ProfileView from './views/ProfileView.vue'
import MerchantBrowser from './views/MerchantBrowser.vue'
import TrendsView from './views/TrendsView.vue'
import OnboardingView from './views/OnboardingView.vue'
import RulesView from './views/RulesView.vue'
import PrivacyView from './views/PrivacyView.vue'

const routes = [
  {
    path: '/onboarding',
    name: 'OnboardingView',
    component: OnboardingView
  },
{
    path: '/accounts',
    name: 'AccountsView',
    component: AccountsView
  },
  {
    path: '/rules',
    name: 'RulesView',
    component: RulesView
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
  {
    path: '/privacy',
    name: 'PrivacyView',
    component: PrivacyView
  },
]

export default routes
