import BasilInput from './BasilInput.vue'

export default {
  extends: BasilInput,
  name: 'BasilAmount',
  props: { variant: { type: String, default: 'amount' } }
}
