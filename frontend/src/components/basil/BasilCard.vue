<template>
  <div :class="classes">
    <div v-if="$slots.header" class="basil-card__header">
      <slot name="header" />
    </div>
    <slot />
    <div v-if="$slots.actions" class="basil-card__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script>
export default {
  name: 'BasilCard',
  props: {
    flat:     { type: Boolean, default: false },
    bordered: { type: Boolean, default: false },
  },
  computed: {
    classes() {
      return [
        'basil-card',
        this.flat && 'basil-card--flat',
        this.bordered && 'basil-card--bordered',
      ]
    },
  },
}
</script>
