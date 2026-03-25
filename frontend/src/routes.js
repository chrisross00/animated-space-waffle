import BudgetView from './views/BudgetView.vue'
import AccountsView from './views/AccountsView.vue'
import TrendsView from './views/TrendsView.vue'
import RulesView from './views/RulesView.vue'
import ProfileView from './views/ProfileView.vue'

// Lazy-load views not in the main nav
const BudgetPlannerView = () => import('./views/BudgetPlannerView.vue')
const MerchantBrowser = () => import('./views/MerchantBrowser.vue')
const OnboardingView = () => import('./views/OnboardingView.vue')
const PrivacyView = () => import('./views/PrivacyView.vue')
const TagsView = () => import('./views/TagsView.vue')

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
    path: '/budget',
    name: 'BudgetView',
    component: BudgetView
  },
  {
    path: '/',
    redirect: '/budget',
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
    path: '/tags',
    name: 'TagsView',
    component: TagsView
  },
  {
    path: '/privacy',
    name: 'PrivacyView',
    component: PrivacyView
  },
]

export default routes
