<template>
  <dialog
    ref="dialogRef"
    class="basil-tray"
    @close="onNativeClose"
    @cancel="onCancel"
    @click="onBackdropClick"
  >
    <div
      ref="wrapRef"
      :class="['basil-tray__wrap', screen.isMobile && 'basil-tray__wrap--mobile']"
      :style="[
        !screen.isMobile ? `max-width: ${maxWidth}` : undefined,
        dragStyle,
      ]"
    >
      <slot />
    </div>
  </dialog>
</template>

<script>
import { screen } from '@/composables/useScreen'
import { useGesture } from '@/composables/useGesture'
import { nextTick } from 'vue'

export default {
  name: 'BasilTray',
  props: {
    modelValue:  { type: Boolean, default: false },
    maxWidth:    { type: String, default: '480px' },
    persistent:  { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'before-show', 'show', 'before-hide', 'hide'],

  data() {
    return {
      dragOffset: 0,
      dragging: false,
      screen,
    }
  },

  computed: {
    dragStyle() {
      if (this.dragOffset > 0) {
        return `transform: translateY(${this.dragOffset}px); transition: none`
      }
      return undefined
    },
  },

  watch: {
    modelValue(val) {
      if (val) {
        this.open()
      } else {
        this.close()
      }
    },
  },

  mounted() {
    // If initially open, show immediately
    if (this.modelValue) {
      this.open()
    }

    // Set up gesture for drag-to-dismiss
    this.stopGesture = null
    this.setupGesture()
  },

  beforeUnmount() {
    if (this.stopGesture) {
      this.stopGesture()
      this.stopGesture = null
    }
    this.unlockBodyScroll()
  },

  methods: {
    open() {
      const dialog = this.$refs.dialogRef
      if (!dialog || dialog.open) return

      this.$emit('before-show')
      this.lockBodyScroll()
      dialog.showModal()

      nextTick(() => {
        this.$emit('show')
        // Re-setup gesture in case refs changed
        this.setupGesture()
      })
    },

    close() {
      const dialog = this.$refs.dialogRef
      if (!dialog || !dialog.open) return

      this.$emit('before-hide')
      dialog.close()
      this.unlockBodyScroll()
      this.$emit('hide')
    },

    onNativeClose() {
      // The dialog was closed (either by us or by the browser)
      this.unlockBodyScroll()
      if (this.modelValue) {
        this.$emit('update:modelValue', false)
      }
    },

    onCancel(e) {
      // Native cancel event fires on Escape key press
      if (this.persistent) {
        e.preventDefault()
        return
      }
      // Allow close — onNativeClose will fire next and emit update:modelValue
    },

    onBackdropClick(e) {
      // Native <dialog> backdrop is the dialog element itself.
      // Clicks on child elements (the wrap) won't have target === dialog.
      if (e.target !== this.$refs.dialogRef) return
      if (this.persistent) return
      this.$emit('update:modelValue', false)
    },

    lockBodyScroll() {
      this._prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    },

    unlockBodyScroll() {
      if (this._prevOverflow !== undefined) {
        document.body.style.overflow = this._prevOverflow
        this._prevOverflow = undefined
      }
    },

    setupGesture() {
      // Clean up any existing gesture
      if (this.stopGesture) {
        this.stopGesture()
        this.stopGesture = null
      }

      if (!screen.isMobile) return

      const wrapEl = this.$refs.wrapRef
      if (!wrapEl) return

      this.stopGesture = useGesture(wrapEl, {
        direction: 'vertical',
        onMove: (state) => {
          // Only allow dragging downward
          if (state.deltaY > 0) {
            this.dragOffset = state.deltaY
            this.dragging = true
          }
        },
        onEnd: (state) => {
          if (state.swipedDown && !this.persistent) {
            this.$emit('update:modelValue', false)
          }
          this.dragOffset = 0
          this.dragging = false
        },
      })
    },
  },
}
</script>
