import HomeView from './views/HomeView.vue'
import ApiDr from './views/ApiDir.vue'
import FindView from './views/FindView.vue'
import TestView from './views/TestView.vue'

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
  }
]

export default routes