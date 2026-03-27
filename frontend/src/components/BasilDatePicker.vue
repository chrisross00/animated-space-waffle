<template>
  <div class="basil-date-picker" :class="rootClasses" ref="rootRef">
    <!-- Trigger -->
    <div class="basil-date-picker__trigger" @click="toggle" @keydown="onTriggerKeydown" tabindex="0" role="combobox" :aria-expanded="isOpen" aria-haspopup="dialog">
      <span class="basil-date-picker__value" :class="{ 'basil-date-picker__value--placeholder': !hasValue }">
        {{ displayText }}
      </span>
      <BasilIcon name="calendar_today" size="sm" class="basil-date-picker__icon" />
      <span v-if="label" class="basil-date-picker__label" :class="{ 'basil-date-picker__label--float': hasValue || isOpen }">{{ label }}</span>
    </div>

    <!-- Desktop dropdown -->
    <Teleport to="body">
      <div v-if="isOpen && !isMobile" ref="dropdownRef" class="basil-date-picker__dropdown" :style="dropdownStyle" @mousedown.prevent>
        <div class="basil-date-picker__calendar" role="grid">
          <!-- Month header -->
          <div class="basil-date-picker__header">
            <BasilButton variant="icon" icon="chevron_left" dense @click="prevMonth" aria-label="Previous month" />
            <span class="basil-date-picker__month-label basil-display">{{ monthYearLabel }}</span>
            <BasilButton variant="icon" icon="chevron_right" dense @click="nextMonth" aria-label="Next month" />
          </div>
          <!-- Day-of-week labels -->
          <div class="basil-date-picker__weekdays">
            <span v-for="d in dayLabels" :key="d" class="basil-date-picker__weekday">{{ d }}</span>
          </div>
          <!-- Day grid -->
          <div class="basil-date-picker__grid">
            <div
              v-for="(day, i) in calendarDays"
              :key="i"
              class="basil-date-picker__day"
              :class="dayClasses(day)"
              role="gridcell"
              :aria-selected="day.iso === modelValue"
              @click="selectDay(day)"
              @mouseenter="hoveredDay = day.iso"
              @mouseleave="hoveredDay = null"
            >
              <span class="basil-date-picker__day-num">{{ day.day }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Mobile tray -->
    <BasilTray v-model="mobileOpen" v-if="isMobile">
      <div class="basil-date-picker__tray">
        <div class="basil-date-picker__tray-top">
          <span v-if="label" class="basil-date-picker__tray-header">{{ label }}</span>
          <BasilButton variant="icon" icon="close" dense tabindex="-1" @click="mobileOpen = false" aria-label="Cancel" />
        </div>
        <div class="basil-date-picker__calendar" role="grid">
          <!-- Month header -->
          <div class="basil-date-picker__header">
            <BasilButton variant="icon" icon="chevron_left" dense @click="prevMonth" aria-label="Previous month" />
            <span class="basil-date-picker__month-label basil-display">{{ monthYearLabel }}</span>
            <BasilButton variant="icon" icon="chevron_right" dense @click="nextMonth" aria-label="Next month" />
          </div>
          <!-- Day-of-week labels -->
          <div class="basil-date-picker__weekdays">
            <span v-for="d in dayLabels" :key="d" class="basil-date-picker__weekday">{{ d }}</span>
          </div>
          <!-- Day grid -->
          <div class="basil-date-picker__grid">
            <div
              v-for="(day, i) in calendarDays"
              :key="i"
              class="basil-date-picker__day"
              :class="dayClasses(day)"
              role="gridcell"
              :aria-selected="day.iso === modelValue"
              @click="selectDay(day)"
            >
              <span class="basil-date-picker__day-num">{{ day.day }}</span>
            </div>
          </div>
        </div>
      </div>
    </BasilTray>
  </div>
</template>

<script>
import { nextTick } from 'vue'
import { screen } from '@/composables/useScreen'
import BasilTray from '@/components/BasilTray.vue'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function toIso(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayIso() {
  const now = new Date()
  return toIso(now.getFullYear(), now.getMonth(), now.getDate())
}

export default {
  name: 'BasilDatePicker',
  components: { BasilTray },

  props: {
    modelValue: { type: String, default: '' },
    label:      { type: String, default: '' },
    disabled:   { type: Boolean, default: false },
    dense:      { type: Boolean, default: false },
  },

  emits: ['update:modelValue'],

  data() {
    return {
      isOpen: false,
      mobileOpen: false,
      viewYear: new Date().getFullYear(),
      viewMonth: new Date().getMonth(),
      hoveredDay: null,
      dropdownStyle: {},
    }
  },

  computed: {
    isMobile() {
      return screen.isMobile
    },
    rootClasses() {
      return {
        'basil-date-picker--open': this.isOpen || this.mobileOpen,
        'basil-date-picker--dense': this.dense,
        'basil-date-picker--disabled': this.disabled,
        'basil-date-picker--has-value': this.hasValue,
      }
    },
    hasValue() {
      return !!this.modelValue
    },
    displayText() {
      if (!this.hasValue) return ''
      const [y, m, d] = this.modelValue.split('-')
      const date = new Date(Number(y), Number(m) - 1, Number(d))
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    },
    dayLabels() {
      return DAY_LABELS
    },
    monthYearLabel() {
      return `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}`
    },
    todayIso() {
      return todayIso()
    },
    calendarDays() {
      const year = this.viewYear
      const month = this.viewMonth
      // First day of the month (0=Sun)
      const firstDay = new Date(year, month, 1).getDay()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const daysInPrevMonth = new Date(year, month, 0).getDate()
      const days = []

      // Previous month trailing days
      for (let i = firstDay - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i
        const pm = month === 0 ? 11 : month - 1
        const py = month === 0 ? year - 1 : year
        days.push({ day: d, iso: toIso(py, pm, d), outside: true })
      }

      // Current month
      for (let d = 1; d <= daysInMonth; d++) {
        days.push({ day: d, iso: toIso(year, month, d), outside: false })
      }

      // Next month leading days — fill to 42 cells (6 rows)
      const remaining = 42 - days.length
      for (let d = 1; d <= remaining; d++) {
        const nm = month === 11 ? 0 : month + 1
        const ny = month === 11 ? year + 1 : year
        days.push({ day: d, iso: toIso(ny, nm, d), outside: true })
      }

      return days
    },
  },

  watch: {
    mobileOpen(val) {
      if (!val) {
        this.isOpen = false
      }
    },
    modelValue: {
      handler(val) {
        if (val) {
          const [y, m] = val.split('-')
          this.viewYear = Number(y)
          this.viewMonth = Number(m) - 1
        }
      },
      immediate: true,
    },
  },

  mounted() {
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
    this._onKeydown = (e) => {
      if (!this.isOpen || this.isMobile) return
      if (e.key === 'Escape') {
        this.close()
      }
    }
    document.addEventListener('mousedown', this._onClickOutside)
    window.addEventListener('scroll', this._onScroll, { passive: true, capture: true })
    document.addEventListener('keydown', this._onKeydown)
  },

  beforeUnmount() {
    document.removeEventListener('mousedown', this._onClickOutside)
    window.removeEventListener('scroll', this._onScroll, { capture: true })
    document.removeEventListener('keydown', this._onKeydown)
  },

  methods: {
    dayClasses(day) {
      return {
        'basil-date-picker__day--outside': day.outside,
        'basil-date-picker__day--today': day.iso === this.todayIso,
        'basil-date-picker__day--selected': day.iso === this.modelValue,
        'basil-date-picker__day--hover': day.iso === this.hoveredDay && day.iso !== this.modelValue,
      }
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
      // Sync view to current value
      if (this.modelValue) {
        const [y, m] = this.modelValue.split('-')
        this.viewYear = Number(y)
        this.viewMonth = Number(m) - 1
      }
      if (this.isMobile) {
        this.mobileOpen = true
        this.isOpen = true
      } else {
        this.isOpen = true
        nextTick(() => {
          requestAnimationFrame(() => {
            this.repositionDropdown()
          })
        })
      }
    },

    close() {
      this.isOpen = false
      this.mobileOpen = false
      this.hoveredDay = null
    },

    selectDay(day) {
      // If outside month, navigate to that month
      if (day.outside) {
        const [y, m] = day.iso.split('-')
        this.viewYear = Number(y)
        this.viewMonth = Number(m) - 1
      }
      this.$emit('update:modelValue', day.iso)
      this.close()
    },

    prevMonth() {
      if (this.viewMonth === 0) {
        this.viewMonth = 11
        this.viewYear--
      } else {
        this.viewMonth--
      }
    },

    nextMonth() {
      if (this.viewMonth === 11) {
        this.viewMonth = 0
        this.viewYear++
      } else {
        this.viewMonth++
      }
    },

    repositionDropdown() {
      const trigger = this.$refs.rootRef
      const dropdown = this.$refs.dropdownRef
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - rect.bottom
      const dropH = dropdown ? dropdown.offsetHeight : 340

      let top = rect.bottom + 4
      if (spaceBelow < dropH && rect.top > spaceBelow) {
        top = rect.top - dropH - 4
        if (top < 8) top = 8
      }

      this.dropdownStyle = {
        position: 'fixed',
        top: `${top}px`,
        left: `${rect.left}px`,
        width: '280px',
        zIndex: 8000,
      }
    },

    onTriggerKeydown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.toggle()
      } else if (e.key === 'Escape') {
        this.close()
      }
    },
  },
}
</script>
