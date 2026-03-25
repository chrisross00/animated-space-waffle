<template>
  <div class="basil-expansion" :class="{ 'basil-expansion--open': modelValue, 'basil-expansion--dense': dense }">
    <button
      type="button"
      class="basil-expansion__header"
      :class="headerClass"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <BasilIcon v-if="icon" :name="icon" size="sm" />
      <div class="basil-expansion__label-wrap">
        <span class="basil-expansion__label">{{ label }}</span>
        <span v-if="caption" class="basil-expansion__caption">{{ caption }}</span>
      </div>
      <BasilIcon name="expand_more" size="sm" class="basil-expansion__chevron" />
    </button>
    <div v-show="modelValue" class="basil-expansion__body">
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: 'BasilExpansion',

  props: {
    modelValue:  { type: Boolean, default: false },
    label:       { type: String,  default: '' },
    caption:     { type: String,  default: '' },
    icon:        { type: String,  default: null },
    dense:       { type: Boolean, default: false },
    headerClass: { type: [String, Object, Array], default: null },
  },

  emits: ['update:modelValue'],
}
</script>
