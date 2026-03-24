import BasilInput from './BasilInput.vue'

export default {
  extends: BasilInput,
  name: 'BasilSearch',
  props: { variant: { type: String, default: 'search' } }
}
