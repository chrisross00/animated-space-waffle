import BasilInput from './BasilInput.vue'

export default {
  extends: BasilInput,
  name: 'BasilNote',
  props: { variant: { type: String, default: 'note' } }
}
