<template>
  <div class="basil-select" :class="rootClasses" ref="rootRef">
    <!-- Trigger -->
    <div class="basil-select__trigger" @click="toggle" @keydown="onTriggerKeydown" tabindex="0" role="combobox" :aria-expanded="isOpen" aria-haspopup="listbox">
      <span class="basil-select__value" :class="{ 'basil-select__value--placeholder': !hasValue }">
        {{ displayText }}
      </span>
      <svg class="basil-select__arrow" :class="{ 'basil-select__arrow--open': isOpen }" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      <span v-if="label" class="basil-select__label" :class="{ 'basil-select__label--float': hasValue || isOpen || placeholder }">{{ label }}</span>
    </div>

    <!-- Desktop dropdown — teleport to nearest dialog (if inside one) or body -->
    <Teleport :to="teleportTarget">
      <div v-if="isOpen && !isMobile" ref="dropdownRef" class="basil-select__dropdown" :style="dropdownStyle" @mousedown.prevent>
        <div v-if="filterable" class="basil-select__filter">
          <input
            ref="filterInput"
            v-model="filterText"
            class="basil-select__filter-input"
            placeholder="Search..."
            @keydown="onFilterKeydown"
          />
        </div>
        <div class="basil-select__options" role="listbox" ref="optionsRef">
          <div
            v-for="(opt, i) in filteredOptions"
            :key="resolveValue(opt)"
            class="basil-select__option"
            :class="{
              'basil-select__option--selected': isSelected(opt),
              'basil-select__option--focused': focusedIndex === i,
            }"
            role="option"
            :aria-selected="isSelected(opt)"
            @click="selectOption(opt)"
            @mouseenter="focusedIndex = i"
          >
            <slot name="option" :option="opt" :selected="isSelected(opt)">
              <span class="basil-select__option-label">{{ resolveLabel(opt) }}</span>
            </slot>
            <svg v-if="isSelected(opt)" class="basil-select__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div v-if="filteredOptions.length === 0" class="basil-select__empty">No matches</div>
        </div>
      </div>
    </Teleport>

    <!-- Mobile tray -->
    <BasilTray v-model="mobileOpen" v-if="isMobile">
      <div class="basil-select__tray">
        <div v-if="label" class="basil-select__tray-header">{{ label }}</div>
        <div v-if="filterable" class="basil-select__filter basil-select__filter--tray">
          <BasilSearch
            ref="mobileFilterInput"
            :model-value="filterText"
            @update:model-value="filterText = $event"
            placeholder="Search..."
            dense
          />
        </div>
        <div class="basil-select__options basil-select__options--tray" role="listbox" ref="mobileOptionsRef">
          <div
            v-for="(opt, i) in filteredOptions"
            :key="resolveValue(opt)"
            class="basil-select__option"
            :class="{
              'basil-select__option--selected': isSelected(opt),
            }"
            role="option"
            :aria-selected="isSelected(opt)"
            @click="selectOption(opt)"
          >
            <slot name="option" :option="opt" :selected="isSelected(opt)">
              <span class="basil-select__option-label">{{ resolveLabel(opt) }}</span>
            </slot>
            <svg v-if="isSelected(opt)" class="basil-select__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div v-if="filteredOptions.length === 0" class="basil-select__empty">No matches</div>
        </div>
      </div>
    </BasilTray>
  </div>
</template>

<script>
import { nextTick } from 'vue'
import { screen } from '@/composables/useScreen'
import BasilTray from '@/components/BasilTray.vue'
import BasilSearch from '@/components/BasilSearch'

export default {
  name: 'BasilSelect',
  components: { BasilTray, BasilSearch },

  props: {
    modelValue:   { type: [String, Number, Object, null], default: null },
    options:      { type: Array, default: () => [] },
    optionLabel:  { type: [String, Function], default: 'label' },
    optionValue:  { type: [String, Function], default: 'value' },
    label:        { type: String, default: '' },
    placeholder:  { type: String, default: '' },
    filterable:   { type: Boolean, default: false },
    disabled:     { type: Boolean, default: false },
    dense:        { type: Boolean, default: false },
    emitValue:    { type: Boolean, default: false },
    clearable:    { type: Boolean, default: false },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      isOpen: false,
      mobileOpen: false,
      filterText: '',
      focusedIndex: -1,
      dropdownStyle: {},
      teleportTarget: 'body',
    }
  },

  computed: {
    isMobile() {
      return screen.isMobile
    },
    rootClasses() {
      return {
        'basil-select--open': this.isOpen || this.mobileOpen,
        'basil-select--dense': this.dense,
        'basil-select--disabled': this.disabled,
        'basil-select--has-value': this.hasValue,
      }
    },
    hasValue() {
      return this.modelValue != null && this.modelValue !== ''
    },
    displayText() {
      if (!this.hasValue) return this.placeholder || ''
      // If emitValue is true, modelValue is a raw value — find matching option
      if (this.emitValue) {
        const match = this.options.find(o => this.resolveValue(o) === this.modelValue)
        return match ? this.resolveLabel(match) : String(this.modelValue)
      }
      // If modelValue is a string (from string-array options), show it directly
      if (typeof this.modelValue === 'string') return this.modelValue
      if (typeof this.modelValue === 'number') return String(this.modelValue)
      // Object — resolve label
      return this.resolveLabel(this.modelValue)
    },
    filteredOptions() {
      if (!this.filterText) return this.options
      const needle = this.filterText.toLowerCase()
      return this.options.filter(opt => {
        const label = this.resolveLabel(opt)
        return String(label).toLowerCase().includes(needle)
      })
    },
  },

  watch: {
    mobileOpen(val) {
      if (!val) {
        this.filterText = ''
        this.isOpen = false
      }
    },
  },

  mounted() {
    // If inside a modal <dialog>, teleport dropdown there instead of body
    // (showModal() blocks interaction with elements outside the dialog's DOM tree)
    const parentDialog = this.$el.closest('dialog')
    if (parentDialog) this.teleportTarget = parentDialog

    this._onClickOutside = (e) => {
      if (!this.isOpen || this.isMobile) return
      if (this.$refs.rootRef?.contains(e.target)) return
      if (this.$refs.dropdownRef?.contains(e.target)) return
      this.close()
    }
    this._onScroll = () => {
      if (!this.isOpen || this.isMobile) return
      this.repositionDropdown()
    }
    document.addEventListener('mousedown', this._onClickOutside)
    window.addEventListener('scroll', this._onScroll, { passive: true, capture: true })
  },

  beforeUnmount() {
    document.removeEventListener('mousedown', this._onClickOutside)
    window.removeEventListener('scroll', this._onScroll, { capture: true })
  },

  methods: {
    resolveLabel(opt) {
      if (opt == null) return ''
      if (typeof opt === 'string' || typeof opt === 'number') return String(opt)
      if (typeof this.optionLabel === 'function') return this.optionLabel(opt)
      return opt[this.optionLabel] ?? ''
    },

    resolveValue(opt) {
      if (opt == null) return null
      if (typeof opt === 'string' || typeof opt === 'number') return opt
      if (typeof this.optionValue === 'function') return this.optionValue(opt)
      return opt[this.optionValue] ?? opt
    },

    isSelected(opt) {
      const val = this.resolveValue(opt)
      if (this.emitValue) return val === this.modelValue
      if (typeof this.modelValue === 'string' || typeof this.modelValue === 'number') {
        return val === this.modelValue
      }
      if (this.modelValue && typeof this.modelValue === 'object') {
        return this.resolveValue(this.modelValue) === val
      }
      return false
    },

    toggle() {
      if (this.disabled) return
      if (this.isOpen || this.mobileOpen) {
        this.close()
      } else {
        this.open()
      }
    },

    open() {
      if (this.disabled) return
      this.filterText = ''
      this.focusedIndex = -1
      if (this.isMobile) {
        this.mobileOpen = true
        this.isOpen = true
      } else {
        this.isOpen = true
        // nextTick: Vue flushes the v-if, dropdown DOM exists.
        // rAF: layout complete, safe to measure trigger position.
        nextTick(() => {
          requestAnimationFrame(() => {
            this.repositionDropdown()
            this.$refs.filterInput?.focus({ preventScroll: true })
          })
        })
      }
    },

    close() {
      this.isOpen = false
      this.mobileOpen = false
      this.filterText = ''
      this.focusedIndex = -1
    },

    selectOption(opt) {
      const val = this.emitValue ? this.resolveValue(opt) : (typeof opt === 'string' || typeof opt === 'number' ? opt : opt)
      this.$emit('update:modelValue', val)
      this.close()
    },

    repositionDropdown() {
      const trigger = this.$refs.rootRef
      const dropdown = this.$refs.dropdownRef
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - rect.bottom
      const maxH = 280
      // Use actual dropdown height if rendered, otherwise estimate with maxH
      const dropH = dropdown ? Math.min(dropdown.offsetHeight, maxH) : maxH

      let top = rect.bottom + 4
      if (spaceBelow < dropH && rect.top > spaceBelow) {
        top = rect.top - dropH - 4
        if (top < 8) top = 8
      }

      this.dropdownStyle = {
        position: 'fixed',
        top: `${top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: `${maxH}px`,
        zIndex: 8000,
      }
    },


    onTriggerKeydown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.toggle()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!this.isOpen) this.open()
        else this.moveFocus(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (this.isOpen) this.moveFocus(-1)
      } else if (e.key === 'Escape') {
        this.close()
      }
    },

    onFilterKeydown(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.moveFocus(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.moveFocus(-1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (this.focusedIndex >= 0 && this.focusedIndex < this.filteredOptions.length) {
          this.selectOption(this.filteredOptions[this.focusedIndex])
        }
      } else if (e.key === 'Escape') {
        this.close()
      }
    },

    moveFocus(delta) {
      const len = this.filteredOptions.length
      if (len === 0) return
      let next = this.focusedIndex + delta
      if (next < 0) next = len - 1
      if (next >= len) next = 0
      this.focusedIndex = next
      nextTick(() => {
        const container = this.$refs.optionsRef
        if (!container) return
        const items = container.querySelectorAll('.basil-select__option')
        if (items[next]) items[next].scrollIntoView({ block: 'nearest' })
      })
    },
  },
}
</script>
