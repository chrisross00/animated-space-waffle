<template>
  <!-- Switch variant -->
  <label
    v-if="variant === 'switch'"
    :class="[
      'basil-toggle basil-toggle--switch',
      modelValue && 'basil-toggle--checked',
      dense && 'basil-toggle--dense',
      disabled && 'basil-toggle--disabled',
    ]"
  >
    <button
      type="button"
      role="switch"
      :aria-checked="!!modelValue"
      :disabled="disabled"
      class="basil-toggle__track"
      @click="toggle"
    >
      <span class="basil-toggle__thumb" />
    </button>
    <span v-if="$slots.default || label" class="basil-toggle__label">
      <slot>{{ label }}</slot>
    </span>
  </label>

  <!-- Checkbox variant -->
  <label
    v-else-if="variant === 'checkbox'"
    :class="[
      'basil-toggle basil-toggle--checkbox',
      modelValue && 'basil-toggle--checked',
      dense && 'basil-toggle--dense',
      disabled && 'basil-toggle--disabled',
    ]"
  >
    <button
      type="button"
      role="checkbox"
      :aria-checked="!!modelValue"
      :disabled="disabled"
      class="basil-toggle__box"
      @click="toggle"
    >
      <svg
        v-if="modelValue"
        class="basil-toggle__check"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 9.5L7.5 13L14 5.5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <span v-if="$slots.default || label" class="basil-toggle__label">
      <slot>{{ label }}</slot>
    </span>
  </label>

  <!-- Button-group variant -->
  <div
    v-else-if="variant === 'button-group'"
    :class="[
      'basil-toggle basil-toggle--button-group',
      dense && 'basil-toggle--dense',
      disabled && 'basil-toggle--disabled',
    ]"
    role="radiogroup"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === opt.value"
      :disabled="disabled"
      :class="[
        'basil-toggle__segment',
        modelValue === opt.value && 'basil-toggle__segment--active',
      ]"
      @click="selectOption(opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script>
export default {
  name: 'BasilToggle',
  props: {
    modelValue:  { default: false },
    label:       { type: String, default: '' },
    variant:     { type: String, default: 'switch', validator: v => ['switch', 'checkbox', 'button-group'].includes(v) },
    options:     { type: Array, default: () => [] },
    dense:       { type: Boolean, default: false },
    disabled:    { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  methods: {
    toggle() {
      if (this.disabled) return
      this.$emit('update:modelValue', !this.modelValue)
    },
    selectOption(value) {
      if (this.disabled) return
      this.$emit('update:modelValue', value)
    },
  },
}
</script>
