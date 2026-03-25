<template>
  <div class="basil-list-item" :class="itemClasses" @click="onClick" role="listitem">
    <div v-if="$slots.avatar" class="basil-list-item__avatar"><slot name="avatar" /></div>
    <div class="basil-list-item__content">
      <slot>
        <div v-if="$slots.label" class="basil-list-item__label"><slot name="label" /></div>
        <div v-if="$slots.caption" class="basil-list-item__caption"><slot name="caption" /></div>
      </slot>
    </div>
    <div v-if="$slots.side" class="basil-list-item__side"><slot name="side" /></div>
  </div>
</template>

<script>
export default {
  name: 'BasilListItem',

  props: {
    clickable: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    dense: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['click'],

  computed: {
    itemClasses() {
      return {
        'basil-list-item--clickable': this.clickable,
        'basil-list-item--active': this.active,
        'basil-list-item--disabled': this.disabled,
        'basil-list-item--dense': this.dense,
      }
    },
  },

  methods: {
    onClick(e) {
      if (!this.disabled && this.clickable) {
        this.$emit('click', e)
      }
    },
  },
}
</script>
