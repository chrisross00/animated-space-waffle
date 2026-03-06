
import './styles/tokens.css'
import './styles/quasar.sass'
import './styles/quasar-overrides.css'
import './styles/dialogs.css'
import '@quasar/extras/material-icons/material-icons.css'
import { Loading, Notify } from 'quasar'

// To be used on app.use(Quasar, { ... })
export default {
  config: {},
  plugins: {
    Loading,
    Notify,
  },
}