<template>
  <div>
    <!-- Mobile: no native input -->
    <div v-if="isMobile" class="basil-input" :class="inputClasses" @click="onTap">
      <span v-if="effectivePrefix" class="basil-input__prefix">{{ effectivePrefix }}</span>
      <div class="basil-input__display" :class="{ 'basil-input__display--placeholder': !displayValue }">
        {{ displayValue || placeholder }}
        <span v-if="isFocused" class="basil-input__cursor"></span>
      </div>
      <span v-if="label" class="basil-input__label" :class="{ 'basil-input__label--float': isFocused || displayValue }">{{ label }}</span>
    </div>

    <!-- Desktop: native input -->
    <div v-else class="basil-input" :class="inputClasses">
      <span v-if="effectivePrefix" class="basil-input__prefix">{{ effectivePrefix }}</span>
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
      displayString: '',
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
    effectivePrefix() {
      if (this.prefix) return this.prefix
      if (this.variant === 'amount') return '$'
      return ''
    },
    displayValue() {
      if (this.variant === 'amount') {
        return this.displayString || (this.modelValue ? String(this.modelValue) : '')
      }
      return String(this.modelValue)
    },
  },

  watch: {
    modelValue: {
      handler(val) {
        if (this.variant === 'amount' && !this.isFocused) {
          this.displayString = val ? String(val) : ''
        }
      },
      immediate: true,
    },
  },

  created() {
    this.isMobile = typeof window !== 'undefined' && 'ontouchstart' in window
  },

  methods: {
    onTap() {
      if (this.disabled) return
      if (this.variant === 'amount' && !this.displayString && this.modelValue) {
        this.displayString = String(this.modelValue)
      }
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
      if (this.variant === 'amount') {
        // Only accept digits and decimal point
        if (char !== '.' && (char < '0' || char > '9')) return
        // Reject second decimal point
        if (char === '.' && this.displayString.includes('.')) return
        // Reject if already 2 decimal places
        const dotIndex = this.displayString.indexOf('.')
        if (dotIndex !== -1 && this.displayString.length - dotIndex > 2) return
        // Build new string
        const newStr = this.displayString + char
        const parsed = parseFloat(newStr)
        // Reject if exceeds max
        if (!isNaN(parsed) && parsed > 999999.99) return
        this.displayString = newStr
        this.$emit('update:modelValue', parsed || 0)
        return
      }
      this.$emit('update:modelValue', String(this.modelValue) + char)
    },

    onBackspace() {
      if (this.variant === 'amount') {
        this.displayString = this.displayString.slice(0, -1)
        const parsed = parseFloat(this.displayString)
        this.$emit('update:modelValue', isNaN(parsed) ? 0 : parsed)
        return
      }
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
