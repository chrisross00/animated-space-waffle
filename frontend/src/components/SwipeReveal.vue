<template>
  <div class="basil-swipe" ref="container">
    <div
      v-show="offset < 0"
      class="basil-swipe__action"
      :style="{ width: actionWidth + 'px' }"
      @click="$emit('action')"
    >
      <slot name="action">
        <BasilIcon name="delete" style="font-size: 24px; color: white;" />
      </slot>
    </div>
    <div
      class="basil-swipe__content"
      :class="{ 'basil-swipe__content--animating': animating }"
      :style="{ transform: `translateX(${offset}px)` }"
      @click="onClick"
    >
      <slot />
    </div>
  </div>
</template>

<script>
import { useGesture } from '@/composables/useGesture'

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
      startOffset: 0,
    };
  },

  mounted() {
    this._stopGesture = useGesture(this.$refs.container, {
      direction: 'horizontal',
      onStart: () => {
        if (this.disabled) return;
        this.animating = false;
        this.startOffset = this.offset;
      },
      onMove: (state) => {
        if (this.disabled) return;
        const raw = this.startOffset + state.deltaX;
        // Clamp: no right swipe past 0, elastic overshoot past action width
        const maxSwipe = -this.actionWidth * 1.2;
        this.offset = Math.max(maxSwipe, Math.min(0, raw));
      },
      onEnd: (state) => {
        if (this.disabled) return;
        this.animating = true;
        // Snap open if past 40% threshold or fast swipe left, otherwise snap closed
        this.offset = (Math.abs(this.offset) > this.actionWidth * 0.4 || state.swipedLeft)
          ? -this.actionWidth
          : 0;
      },
    });
  },

  beforeUnmount() {
    if (this._stopGesture) this._stopGesture();
  },

  methods: {
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
