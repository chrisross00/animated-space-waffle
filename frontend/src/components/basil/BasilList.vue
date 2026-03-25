<template>
  <div class="basil-list" :class="{ 'basil-list--separator': separator }" role="list">
    <slot />
  </div>
</template>

<script>
export default {
  name: 'BasilList',

  props: {
    separator: {
      type: Boolean,
      default: false,
    },
  },
}
</script>
