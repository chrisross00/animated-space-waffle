
import './styles/tokens.css'
import './styles/quasar.sass'
import './styles/quasar-overrides.css'
import './styles/dialogs.css'
import './styles/basil-keyboard.css'
import './styles/basil-components.css'
import './styles/basil-shell.css'
import './styles/basil-utilities.css'
import '@quasar/extras/material-icons/material-icons.css'
import { Dialog, Loading, Notify } from 'quasar'

// To be used on app.use(Quasar, { ... })
export default {
  config: {},
  plugins: {
    Dialog,
    Loading,
    Notify,
  },
}