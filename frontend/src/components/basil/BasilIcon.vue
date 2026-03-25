<template>
  <span class="basil-icon material-icons" :style="iconStyle">{{ name }}</span>
</template>

<script>
const COLOR_MAP = {
  primary:  'var(--basil-green)',
  positive: 'var(--basil-positive)',
  negative: 'var(--basil-negative)',
  warning:  'var(--basil-warning)',
  info:     'var(--basil-info)',
}

const SIZE_MAP = {
  sm: '18px',
  md: '24px',
  lg: '32px',
}

export default {
  name: 'BasilIcon',

  props: {
    name: {
      type: String,
      required: true,
    },
    size: {
      type: String,
      default: null,
    },
    color: {
      type: String,
      default: null,
    },
  },

  computed: {
    iconStyle () {
      const style = {}

      if (this.size) {
        const resolved = SIZE_MAP[this.size] ?? this.size
        style.fontSize = resolved
        style.width = resolved
        style.height = resolved
      }

      if (this.color) {
        style.color = COLOR_MAP[this.color] ?? this.color
      }

      return style
    },
  },
}
</script>
