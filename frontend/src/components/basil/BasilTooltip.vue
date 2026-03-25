<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="tooltipEl"
      class="basil-tooltip"
      :class="`basil-tooltip--${position}`"
      :style="tooltipStyle"
    >
      <slot />
    </div>
  </Teleport>
</template>

<script>
export default {
  name: 'BasilTooltip',

  props: {
    delay:    { type: Number, default: 400 },
    position: { type: String, default: 'top' },
  },

  data () {
    return {
      visible: false,
      tooltipStyle: {},
      timer: null,
    }
  },

  mounted () {
    const trigger = this.$el?.parentElement
    if (!trigger) return

    this._trigger = trigger
    this._onEnter = () => this.show()
    this._onLeave = () => this.hide()

    trigger.addEventListener('mouseenter', this._onEnter)
    trigger.addEventListener('mouseleave', this._onLeave)
    trigger.addEventListener('focusin', this._onEnter)
    trigger.addEventListener('focusout', this._onLeave)
  },

  beforeUnmount () {
    this.hide()
    if (this._trigger) {
      this._trigger.removeEventListener('mouseenter', this._onEnter)
      this._trigger.removeEventListener('mouseleave', this._onLeave)
      this._trigger.removeEventListener('focusin', this._onEnter)
      this._trigger.removeEventListener('focusout', this._onLeave)
    }
  },

  methods: {
    show () {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.visible = true
        this.$nextTick(() => this.positionTooltip())
      }, this.delay)
    },

    hide () {
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      this.visible = false
    },

    positionTooltip () {
      const trigger = this._trigger
      const tooltip = this.$refs.tooltipEl
      if (!trigger || !tooltip) return

      const tr = trigger.getBoundingClientRect()
      const tt = tooltip.getBoundingClientRect()
      const gap = 8
      let top, left

      switch (this.position) {
        case 'bottom':
          top = tr.bottom + gap
          left = tr.left + tr.width / 2 - tt.width / 2
          break
        case 'left':
          top = tr.top + tr.height / 2 - tt.height / 2
          left = tr.left - tt.width - gap
          break
        case 'right':
          top = tr.top + tr.height / 2 - tt.height / 2
          left = tr.right + gap
          break
        default: // top
          top = tr.top - tt.height - gap
          left = tr.left + tr.width / 2 - tt.width / 2
      }

      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - tt.width - 8))
      top = Math.max(8, Math.min(top, window.innerHeight - tt.height - 8))

      this.tooltipStyle = {
        top: `${top}px`,
        left: `${left}px`,
      }
    },
  },
}
</script>
