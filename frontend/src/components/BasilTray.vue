<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :position="$q.screen.lt.sm ? 'bottom' : 'standard'"
    :persistent="persistent"
  >
    <div
      ref="wrap"
      :class="['basil-tray__wrap', $q.screen.lt.sm && 'basil-tray__wrap--mobile']"
      :style="[
        !$q.screen.lt.sm ? `max-width: ${maxWidth}` : undefined,
        dragOffset > 0 ? `transform: translateY(${dragOffset}px); transition: none` : undefined,
      ]"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
    >
      <slot />
    </div>
  </q-dialog>
</template>

<script>
const DISMISS_THRESHOLD = 80;

export default {
  name: 'BasilTray',
  props: {
    modelValue:  { type: Boolean, default: false },
    maxWidth:    { type: String, default: '480px' },
    persistent:  { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],

  data() {
    return {
      startY: null,
      dragOffset: 0,
    };
  },

  methods: {
    onTouchStart(e) {
      if (!this.$q.screen.lt.sm) return;
      const wrap = this.$refs.wrap;
      if (!wrap) return;
      const scrollable = wrap.querySelector('.overflow-auto, .basil-re__scroll');
      if (scrollable && scrollable.scrollTop > 0) return;
      this.startY = e.touches[0].clientY;
    },
    onTouchMove(e) {
      if (this.startY === null) return;
      const dy = e.touches[0].clientY - this.startY;
      this.dragOffset = Math.max(0, dy);
    },
    onTouchEnd() {
      if (this.startY === null) return;
      if (this.dragOffset >= DISMISS_THRESHOLD && !this.persistent) {
        this.$emit('update:modelValue', false);
      }
      this.startY = null;
      this.dragOffset = 0;
    },
  },
};
</script>
