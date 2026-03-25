<template>
  <div class="basil-skeleton" :class="`basil-skeleton--${type}`" :style="computedStyle" />
</template>

<script>
export default {
  name: 'BasilSkeleton',

  props: {
    type: {
      type: String,
      default: 'text',
      validator: (v) => ['text', 'rect', 'circle'].includes(v),
    },
    width: {
      type: String,
      default: null,
    },
    height: {
      type: String,
      default: null,
    },
    size: {
      type: String,
      default: null,
    },
  },

  computed: {
    computedStyle () {
      const style = {}

      if (this.type === 'circle') {
        const dim = this.size || '40px'
        style.width = this.width || dim
        style.height = this.height || dim
      } else if (this.type === 'rect') {
        if (this.width)  style.width  = this.width
        if (this.height) style.height = this.height
      } else {
        // text
        if (this.width) style.width = this.width
      }

      return style
    },
  },
}
</script>
