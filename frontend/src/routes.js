import HomeView from './views/HomeView.vue'
import ApiDr from './views/ApiDir.vue'
import FindView from './views/FindView.vue'
import TestView from './views/TestView.vue'
import DeDupeView from './views/DeDupeView.vue'
import GetNew from './views/GetNew.vue'

const routes = [
  {
    path: '/',
    name: 'HomeView',
    component: HomeView
  },
  {
    path: '/api/',
    name: 'ApiDr',
    component: ApiDr
  },
  {
    path: '/api/find',
    name: 'FindView',
    component: FindView
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
  }
]

export default routes