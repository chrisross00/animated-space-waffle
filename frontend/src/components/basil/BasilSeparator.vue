<template>
  <hr :class="['basil-separator', vertical && 'basil-separator--vertical']" />
</template>

<script>
export default {
  name: 'BasilSeparator',
  props: {
    vertical: { type: Boolean, default: false },
  },
}
</script>
