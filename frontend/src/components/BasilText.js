import BasilInput from './BasilInput.vue'

export default {
  extends: BasilInput,
  name: 'BasilText',
  props: { variant: { type: String, default: 'text' } }
}
