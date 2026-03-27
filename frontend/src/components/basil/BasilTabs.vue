<template>
  <div ref="container" class="basil-tabs" role="tablist">
    <slot />
    <span class="basil-tabs__indicator" :style="indicatorStyle" />
  </div>
</template>

<script>
import { ref, provide, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'

export default {
  name: 'BasilTabs',

  props: {
    modelValue: {
      type: String,
      default: null,
    },
  },

  emits: ['update:modelValue'],

  setup (props, { emit }) {
    const activeTab = ref(props.modelValue)
    const container = ref(null)
    const indicatorStyle = ref({ opacity: 0 })
    const route = useRoute()

    watch(() => props.modelValue, (val) => {
      activeTab.value = val
    })

    function setActiveTab (name) {
      activeTab.value = name
      emit('update:modelValue', name)
    }

    provide('basilTabsActiveTab', activeTab)
    provide('basilTabsSetActive', setActiveTab)

    function updateIndicator () {
      const el = container.value
      if (!el) return
      const active = el.querySelector('.basil-tab--active')
      if (!active) {
        indicatorStyle.value = { opacity: 0 }
        return
      }
      indicatorStyle.value = {
        opacity: 1,
        width: active.offsetWidth + 'px',
        transform: `translateX(${active.offsetLeft}px)`,
      }
    }

    // Watch route changes for router-link based tabs
    watch(() => route.path, () => {
      nextTick(updateIndicator)
    })

    // Watch modelValue changes for name-based tabs
    watch(activeTab, () => {
      nextTick(updateIndicator)
    })

    let ro
    onMounted(() => {
      // Initial position (slight delay for layout)
      nextTick(updateIndicator)
      // Recalc on resize
      ro = new ResizeObserver(updateIndicator)
      ro.observe(container.value)
    })

    onBeforeUnmount(() => {
      if (ro) ro.disconnect()
    })

    return { container, indicatorStyle }
  },
}
</script>
