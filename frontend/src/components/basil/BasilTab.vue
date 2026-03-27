<template>
  <component
    :is="to ? 'router-link' : 'button'"
    :to="to || undefined"
    :type="to ? undefined : 'button'"
    ref="tabEl"
    class="basil-tab"
    :class="{
      'basil-tab--active': isActive,
      'basil-tab--disabled': disabled,
    }"
    role="tab"
    :aria-selected="isActive"
    :tabindex="disabled ? -1 : 0"
    @click="onClick"
  >
    <span v-if="icon" class="basil-tab__icon-wrap">
      <BasilIcon :name="icon" class="basil-tab__icon" />
    </span>
    <span v-if="label" class="basil-tab__label">{{ label }}</span>
  </component>
</template>

<script>
import { inject } from 'vue'
import BasilIcon from './BasilIcon.vue'

export default {
  name: 'BasilTab',

  components: { BasilIcon },

  props: {
    name: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: null,
    },
    icon: {
      type: String,
      default: null,
    },
    to: {
      type: String,
      default: null,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['click'],

  setup () {
    const activeTab = inject('basilTabsActiveTab', null)
    const setActiveTab = inject('basilTabsSetActive', null)
    return { activeTab, setActiveTab }
  },

  computed: {
    isActive () {
      if (this.to) {
        // Route-based active detection — exact match or nested route
        const path = this.$route?.path
        if (!path) return false
        return path === this.to || path.startsWith(this.to + '/')
      }
      // Name-based: compare to parent BasilTabs active ref
      return this.activeTab?.value === this.name
    },
  },

  methods: {
    onClick (e) {
      if (this.disabled) {
        e.preventDefault()
        return
      }
      this.ripple(e)
      if (this.setActiveTab) {
        this.setActiveTab(this.name)
      }
      this.$emit('click', e)
    },

    ripple (e) {
      const el = this.$refs.tabEl?.$el || this.$refs.tabEl
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const size = Math.max(rect.width, rect.height) * 2

      const circle = document.createElement('span')
      circle.className = 'basil-ripple'
      circle.style.width = circle.style.height = size + 'px'
      circle.style.left = x - size / 2 + 'px'
      circle.style.top = y - size / 2 + 'px'
      el.appendChild(circle)
      circle.addEventListener('animationend', () => circle.remove())
    },
  },
}
</script>
