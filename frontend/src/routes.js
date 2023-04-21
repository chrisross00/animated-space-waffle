// import HomeView from './views/HomeView.vue'
import ApiDr from './views/ApiDir.vue'
import BudgetView from './views/BudgetView.vue'
import TestView from './views/TestView.vue'
import DeDupeView from './views/DeDupeView.vue'
import GetNew from './views/GetNew.vue'
import GetCategories from './views/GetCategories.vue'
import MapUnmapped from './views/MapUnmapped.vue'
import CleanPending from './views/CleanPending.vue'
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
  {
    path: '/api/test',
    name: 'TestView',
    component: TestView
  },
  {
    path: '/api/dedupe',
    name: 'DeDupeView',
    component: DeDupeView
  },
  {
    path: '/api/getnew',
    name: 'GetNew',
    component: GetNew
  },
  {
    path: '/api/getcategories',
    name: 'GetCategories',
    component: GetCategories
  },
  {
    path: '/api/mapunmapped',
    name: 'MapUnmapped',
    component: MapUnmapped
  },
  {
    path: '/api/cleanPendingTransactions',
    name: 'CleanPending',
    component: CleanPending
  },
]

export default routes