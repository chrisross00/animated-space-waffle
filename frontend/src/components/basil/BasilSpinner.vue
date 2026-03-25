<template>
  <span
    class="basil-spinner"
    :style="spinnerStyle"
    role="status"
    aria-label="Loading"
  />
</template>

<script>
const COLOR_MAP = {
  primary:  'var(--basil-green)',
  positive: 'var(--basil-positive)',
  negative: 'var(--basil-negative)',
  warning:  'var(--basil-warning)',
  info:     'var(--basil-info)',
}

export default {
  name: 'BasilSpinner',

  props: {
    size: {
      type: String,
      default: '1.5rem',
    },
    color: {
      type: String,
      default: 'primary',
    },
  },

  computed: {
    spinnerStyle () {
      const resolvedColor = COLOR_MAP[this.color] ?? this.color
      return {
        width: this.size,
        height: this.size,
        borderColor: `${resolvedColor} transparent transparent transparent`,
      }
    },
  },
}
</script>
