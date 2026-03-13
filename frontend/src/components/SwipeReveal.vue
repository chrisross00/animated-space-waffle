<template>
  <div class="basil-swipe" ref="container">
    <div
      v-show="offset < 0"
      class="basil-swipe__action"
      :style="{ width: actionWidth + 'px' }"
      @click="$emit('action')"
    >
      <slot name="action">
        <q-icon name="delete" color="white" size="24px" />
      </slot>
    </div>
    <div
      class="basil-swipe__content"
      :class="{ 'basil-swipe__content--animating': animating }"
      :style="{ transform: `translateX(${offset}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
      @click="onClick"
    >
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: 'SwipeReveal',
  props: {
    actionWidth: { type: Number, default: 72 },
    disabled: { type: Boolean, default: false },
  },
  emits: ['action', 'click'],

  data() {
    return {
      offset: 0,
      animating: false,
      startX: 0,
      startY: 0,
      startOffset: 0,
      swiping: null, // null = undecided, true = horizontal, false = vertical
    };
  },

  methods: {
    onTouchStart(e) {
      if (this.disabled) return;
      this.animating = false;
      this.startX = e.touches[0].clientX;
      this.startY = e.touches[0].clientY;
      this.startOffset = this.offset;
      this.swiping = null;
    },

    onTouchMove(e) {
      if (this.disabled || this.swiping === false) return;
      const dx = e.touches[0].clientX - this.startX;
      const dy = e.touches[0].clientY - this.startY;

      // Decide direction on first significant movement
      if (this.swiping === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        this.swiping = Math.abs(dx) > Math.abs(dy);
        if (!this.swiping) return;
      }

      const raw = this.startOffset + dx;
      // Clamp: no right swipe past 0, elastic overshoot past action width
      const maxSwipe = -this.actionWidth * 1.2;
      this.offset = Math.max(maxSwipe, Math.min(0, raw));
    },

    onTouchEnd() {
      if (this.disabled || this.swiping !== true) {
        this.swiping = null;
        return;
      }
      this.animating = true;
      // Snap open if past 40% threshold, otherwise snap closed
      this.offset = Math.abs(this.offset) > this.actionWidth * 0.4
        ? -this.actionWidth
        : 0;
      this.swiping = null;
    },

    onClick() {
      // If revealed, close it; otherwise emit click
      if (this.offset < 0) {
        this.reset();
      } else {
        this.$emit('click');
      }
    },

    reset() {
      this.animating = true;
      this.offset = 0;
    },

    isOpen() {
      return this.offset < 0;
    },
  },
};
</script>

<style scoped>
.basil-swipe {
  position: relative;
  overflow: hidden;
}

.basil-swipe__action {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--basil-negative, #f87171);
  color: white;
  cursor: pointer;
}

.basil-swipe__content {
  position: relative;
  background-color: var(--basil-surface);
}

.basil-swipe__content--animating {
  transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
