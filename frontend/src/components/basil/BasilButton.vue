<template>
  <component
    :is="tag"
    v-bind="rootAttrs"
    :class="rootClasses"
    :disabled="disabled || loading"
    @click="onClick"
  >
    <BasilSpinner
      v-if="loading"
      :size="variant === 'icon' ? '1.125rem' : '1rem'"
      :color="spinnerColor"
      class="basil-btn__spinner"
    />
    <BasilIcon
      v-else-if="icon"
      :name="icon"
      :class="['basil-btn__icon', { 'basil-btn__icon--with-label': !!label }]"
    />
    <span v-if="label && variant !== 'icon'" class="basil-btn__label">{{ label }}</span>
    <slot />
  </component>
</template>

<script>
const COLOR_MAP = {
  primary:  'var(--basil-green)',
  negative: 'var(--basil-negative)',
  positive: 'var(--basil-positive)',
}

export default {
  name: 'BasilButton',

  props: {
    label:    { type: String, default: '' },
    icon:     { type: String, default: '' },
    variant:  { type: String, default: 'primary', validator: v => ['primary', 'flat', 'icon'].includes(v) },
    color:    { type: String, default: 'primary' },
    dense:    { type: Boolean, default: false },
    loading:  { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    to:       { type: [String, Object], default: null },
    type:     { type: String, default: 'button' },
  },

  emits: ['click'],

  computed: {
    tag () {
      return this.to ? 'router-link' : 'button'
    },

    rootAttrs () {
      if (this.to) {
        return { to: this.to, custom: false }
      }
      return { type: this.type }
    },

    rootClasses () {
      return [
        'basil-btn',
        `basil-btn--${this.variant}`,
        `basil-btn--${this.color}`,
        {
          'basil-btn--dense': this.dense,
          'basil-btn--loading': this.loading,
          'basil-btn--disabled': this.disabled || this.loading,
          'basil-btn--icon-with-label': this.icon && this.label && this.variant !== 'icon',
        },
      ]
    },

    spinnerColor () {
      if (this.variant === 'primary') return 'white'
      return this.color
    },
  },

  methods: {
    onClick (e) {
      if (this.disabled || this.loading) {
        e.preventDefault()
        return
      }
      this.$emit('click', e)
    },
  },
}
</script>
