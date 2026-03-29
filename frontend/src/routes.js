import BudgetView from './views/BudgetView.vue'

// Lazy-loaded but prefetched after initial render (see prefetchViews below)
const AccountsView = () => import('./views/AccountsView.vue')
const TrendsView = () => import('./views/TrendsView.vue')
const RulesView = () => import('./views/RulesView.vue')
const ProfileView = () => import('./views/ProfileView.vue')
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
    path: '/budget/transactions',
    name: 'TransactionDrillDown',
    component: () => import('./views/TransactionDrillDown.vue'),
    meta: { transition: 'slide' },
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
