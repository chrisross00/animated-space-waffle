<template>
  <div>
    <!-- Mobile: no native input -->
    <div v-if="isMobile" class="basil-input" :class="inputClasses" @click="onTap">
      <span v-if="prefix" class="basil-input__prefix">{{ prefix }}</span>
      <div class="basil-input__display" :class="{ 'basil-input__display--placeholder': !displayValue }">
        {{ displayValue || placeholder }}
        <span v-if="isFocused" class="basil-input__cursor"></span>
      </div>
      <span v-if="label" class="basil-input__label" :class="{ 'basil-input__label--float': isFocused || displayValue }">{{ label }}</span>
    </div>

    <!-- Desktop: native input -->
    <div v-else class="basil-input" :class="inputClasses">
      <span v-if="prefix" class="basil-input__prefix">{{ prefix }}</span>
      <input
        ref="nativeInput"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="onDesktopInput"
        @focus="onDesktopFocus"
        @blur="onDesktopBlur"
        @keyup.enter="$emit('submit')"
      />
      <span v-if="label" class="basil-input__label" :class="{ 'basil-input__label--float': isFocused || modelValue }">{{ label }}</span>
    </div>

    <div v-if="hint" class="basil-input__hint">{{ hint }}</div>
  </div>
</template>

<script>
import { requestKeyboard } from '@/utils/basilKeyboard'

export default {
  name: 'BasilInput',

  props: {
    modelValue: { type: [String, Number], default: '' },
    variant: { type: String, default: 'text' },
    label: { type: String, default: '' },
    hint: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    prefix: { type: String, default: '' },
    dense: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    action: { type: String, default: 'done' },
    debounce: { type: Number, default: 0 },
  },

  emits: ['update:modelValue', 'focus', 'blur', 'submit'],

  data() {
    return {
      isFocused: false,
      isMobile: false,
    }
  },

  computed: {
    inputClasses() {
      return {
        'basil-input--focused': this.isFocused,
        'basil-input--dense': this.dense,
        'basil-input--disabled': this.disabled,
      }
    },
    displayValue() {
      return String(this.modelValue)
    },
  },

  created() {
    this.isMobile = typeof window !== 'undefined' && 'ontouchstart' in window
  },

  methods: {
    onTap() {
      if (this.disabled) return
      this.isFocused = true
      requestKeyboard({
        mode: this.variant === 'amount' ? 'numpad' : 'qwerty',
        onKey: this.onKey,
        onBackspace: this.onBackspace,
        onDone: this.onDone,
        inputEl: this.$el,
      })
      this.$emit('focus')
    },

    onKey(char) {
      this.$emit('update:modelValue', String(this.modelValue) + char)
    },

    onBackspace() {
      this.$emit('update:modelValue', String(this.modelValue).slice(0, -1))
    },

    onDone() {
      this.isFocused = false
      this.$emit('submit')
      this.$emit('blur')
    },

    onDesktopInput(e) {
      this.$emit('update:modelValue', e.target.value)
    },

    onDesktopFocus() {
      this.isFocused = true
      this.$emit('focus')
    },

    onDesktopBlur() {
      this.isFocused = false
      this.$emit('blur')
    },

    focus() {
      if (this.isMobile) {
        this.onTap()
      } else {
        this.$refs.nativeInput?.focus()
      }
    },
  },
}
</script>
