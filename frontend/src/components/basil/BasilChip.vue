<template>
  <span
    :class="[
      'basil-chip',
      color && `basil-chip--${color}`,
      dense && 'basil-chip--dense',
      clickable && 'basil-chip--clickable',
    ]"
    @click="clickable ? $emit('click', $event) : undefined"
  >
    <slot>{{ label }}</slot>
    <button
      v-if="removable"
      class="basil-chip__remove"
      type="button"
      aria-label="Remove"
      @click.stop="$emit('remove')"
    >
      <span class="basil-chip__remove-icon" aria-hidden="true">×</span>
    </button>
  </span>
</template>

<script>
export default {
  name: 'BasilChip',
  props: {
    label:     { type: String,  default: '' },
    color:     { type: String,  default: null },
    removable: { type: Boolean, default: false },
    dense:     { type: Boolean, default: false },
    clickable: { type: Boolean, default: false },
  },
  emits: ['remove', 'click'],
}
</script>
