<template>
  <div class="basil-tabs" role="tablist">
    <slot />
  </div>
</template>

<script>
import { ref, provide, watch } from 'vue'

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

    watch(() => props.modelValue, (val) => {
      activeTab.value = val
    })

    function setActiveTab (name) {
      activeTab.value = name
      emit('update:modelValue', name)
    }

    provide('basilTabsActiveTab', activeTab)
    provide('basilTabsSetActive', setActiveTab)
  },
}
</script>
