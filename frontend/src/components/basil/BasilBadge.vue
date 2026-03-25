<template>
  <span
    :class="[
      'basil-badge',
      `basil-badge--${color}`,
      floating && 'basil-badge--floating',
      !value && value !== 0 && 'basil-badge--dot',
    ]"
  >
    <template v-if="value || value === 0">{{ value }}</template>
  </span>
</template>

<script>
export default {
  name: 'BasilBadge',
  props: {
    value:    { type: [Number, String], default: null },
    color:    { type: String,           default: 'negative' },
    floating: { type: Boolean,          default: false },
  },
}
</script>
