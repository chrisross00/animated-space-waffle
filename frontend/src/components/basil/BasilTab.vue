<template>
  <component
    :is="to ? 'router-link' : 'button'"
    :to="to || undefined"
    :type="to ? undefined : 'button'"
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
      if (this.setActiveTab) {
        this.setActiveTab(this.name)
      }
      this.$emit('click', e)
    },
  },
}
</script>
