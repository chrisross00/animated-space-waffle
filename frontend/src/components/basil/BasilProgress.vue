<template>
  <div
    class="basil-progress"
    :class="{ 'basil-progress--indeterminate': indeterminate }"
    :style="trackStyle"
    role="progressbar"
    :aria-valuenow="indeterminate ? undefined : Math.round(value * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="basil-progress__bar" :style="barStyle" />
  </div>
</template>

<script>
const COLOR_MAP = {
  primary:  'var(--basil-green)',
  positive: 'var(--basil-positive)',
  negative: 'var(--basil-negative)',
  warning:  'var(--basil-warning)',
  info:     'var(--basil-info)',
  income:   'var(--basil-income)',
  expense:  'var(--basil-expense)',
  savings:  'var(--basil-savings)',
  payment:  'var(--basil-payment)',
}

export default {
  name: 'BasilProgress',

  props: {
    value: {
      type: Number,
      default: 0,
    },
    color: {
      type: String,
      default: 'primary',
    },
    indeterminate: {
      type: Boolean,
      default: false,
    },
    size: {
      type: String,
      default: null,
    },
  },

  computed: {
    resolvedColor () {
      return COLOR_MAP[this.color] ?? this.color
    },

    trackStyle () {
      if (!this.size) return {}
      return { height: this.size }
    },

    barStyle () {
      if (this.indeterminate) {
        return { background: this.resolvedColor }
      }
      const clamped = Math.min(1, Math.max(0, this.value))
      return {
        width: `${clamped * 100}%`,
        background: this.resolvedColor,
      }
    },
  },
}
</script>
