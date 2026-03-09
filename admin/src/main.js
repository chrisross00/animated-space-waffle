import { createApp } from 'vue';
import { Quasar, Notify } from 'quasar';
import router from './router';
import App from './App.vue';

import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import './styles/tokens.css';

const app = createApp(App);
app.use(Quasar, {
  plugins: { Notify },
  config: {
    brand: {
      primary: '#3d8b6c',
      secondary: '#5a9e85',
      positive: '#2d7a4f',
      negative: '#b83c2b',
      warning: '#c07a1a',
      info: '#2366a8',
    },
  },
});
app.use(router);
app.mount('#app');
