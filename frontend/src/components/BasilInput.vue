<template>
  <div>
    <!-- Mobile: no native input -->
    <div v-if="isMobile" class="basil-input" :class="inputClasses" @click="onTap">
      <svg v-if="variant === 'search'" class="basil-input__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <span v-if="effectivePrefix" class="basil-input__prefix">{{ effectivePrefix }}</span>
      <div class="basil-input__display" :class="{ 'basil-input__display--placeholder': !displayValue && !isFocused }" @dblclick.stop="onSelectAll"><span v-if="selectAll && displayValue" class="basil-input__selected">{{ displayValue }}</span><template v-else>{{ displayValue || (isFocused ? '' : placeholder) }}<span v-if="isFocused" class="basil-input__cursor"></span></template></div>
      <div v-if="variant === 'search' && modelValue" class="basil-input__clear" @click.stop="onClear">&times;</div>
      <span v-if="label" class="basil-input__label" :class="{ 'basil-input__label--float': isFocused || displayValue || placeholder || effectivePrefix }">{{ label }}</span>
    </div>

    <!-- Desktop: native input -->
    <div v-else class="basil-input" :class="inputClasses">
      <svg v-if="variant === 'search'" class="basil-input__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
      <div v-if="variant === 'search' && modelValue" class="basil-input__clear" @click.stop="onClear">&times;</div>
      <span v-if="label" class="basil-input__label" :class="{ 'basil-input__label--float': isFocused || modelValue || placeholder || effectivePrefix }">{{ label }}</span>
    </div>

    <div v-if="hint" class="basil-input__hint">{{ hint }}</div>
  </div>
</template>

<script>
import { requestKeyboard, setActiveBlur, scrollActiveInputIntoView } from '@/utils/basilKeyboard'

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
      selectAll: false,
      displayString: '',
      debounceTimer: null,
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
    effectiveDebounce() {
      return this.debounce || (this.variant === 'search' ? 300 : 0)
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
    emitDebounced(value) {
      if (this.effectiveDebounce > 0) {
        clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
          this.$emit('update:modelValue', value)
        }, this.effectiveDebounce)
      } else {
        this.$emit('update:modelValue', value)
      }
    },

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
      // Register blur callback so the singleton can unfocus us when another input takes over
      setActiveBlur(() => {
        this.isFocused = false
        this.$emit('blur')
      })
      this.$emit('focus')
      // After keyboard animates open, scroll this input into view
      setTimeout(() => scrollActiveInputIntoView(), 300)
    },

    onSelectAll() {
      if (!this.isFocused || !this.displayValue) return
      this.selectAll = true
    },

    onKey(char) {
      if (this.selectAll) {
        this.selectAll = false
        if (this.variant === 'amount') {
          this.displayString = (char === '.' || (char >= '0' && char <= '9')) ? char : ''
          const parsed = parseFloat(this.displayString)
          this.$emit('update:modelValue', isNaN(parsed) ? 0 : parsed)
        } else {
          this.emitDebounced(char)
        }
        return
      }
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
      this.emitDebounced(String(this.modelValue) + char)
    },

    onBackspace() {
      if (this.selectAll) {
        this.selectAll = false
        if (this.variant === 'amount') {
          this.displayString = ''
          this.$emit('update:modelValue', 0)
        } else {
          this.emitDebounced('')
        }
        return
      }
      if (this.variant === 'amount') {
        this.displayString = this.displayString.slice(0, -1)
        const parsed = parseFloat(this.displayString)
        this.$emit('update:modelValue', isNaN(parsed) ? 0 : parsed)
        return
      }
      this.emitDebounced(String(this.modelValue).slice(0, -1))
    },

    onDone() {
      this.isFocused = false
      this.$emit('submit')
      // blur is emitted via the onBlur callback in dismissKeyboard, not here
    },

    onDesktopInput(e) {
      this.emitDebounced(e.target.value)
    },

    onDesktopFocus() {
      this.isFocused = true
      this.$emit('focus')
    },

    onDesktopBlur() {
      this.isFocused = false
      this.$emit('blur')
    },

    onClear() {
      clearTimeout(this.debounceTimer)
      this.$emit('update:modelValue', '')
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
