<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="basil-tray"
      :class="{ 'basil-tray--visible': backdropVisible }"
      :aria-modal="isVisible ? 'true' : undefined"
      @close="onNativeClose"
      @keydown="onKeydown"
      @click="onDialogClick"
    >
      <div
        ref="wrapRef"
        tabindex="-1"
        :class="[
          'basil-tray__wrap',
          screen.isMobile && 'basil-tray__wrap--mobile',
          entered && 'basil-tray__wrap--entered',
          dragging && 'basil-tray__wrap--dragging',
        ]"
        :style="[
          !screen.isMobile ? `max-width: ${maxWidth}` : undefined,
          dragStyle,
        ]"
      >
        <slot />
      </div>
    </dialog>
  </Teleport>
</template>

<script>
import { screen } from '@/composables/useScreen'
import { useGesture } from '@/composables/useGesture'
import { nextTick } from 'vue'
import { keyboardState, dismissKeyboard } from '@/utils/basilKeyboard'

// Global scroll lock counter — prevents child tray unlock from reverting parent lock
let scrollLockCount = 0
let savedOverflow = ''

// Parse the sheet duration token at module level so we can use it in JS timeouts.
// Falls back to 500ms if the CSS variable isn't available yet.
function getSheetDuration() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--basil-duration-sheet').trim()
  return parseInt(raw, 10) || 500
}

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
      isVisible: false,
      entered: false,         // true once the slide-in transition has been triggered
      backdropVisible: false, // controls backdrop opacity separately for exit timing
      closing: false,         // guard flag to prevent re-entrant close
    }
  },

  computed: {
    dragStyle() {
      if (this.dragging && this.dragOffset > 0) {
        return `transform: translate3d(0, ${this.dragOffset}px, 0)`
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
    if (this._exitTimer) clearTimeout(this._exitTimer)
  },

  methods: {
    open() {
      const dialog = this.$refs.dialogRef
      if (!dialog) return

      // Cancel any pending exit animation from a previous close
      if (this._exitTimer) {
        clearTimeout(this._exitTimer)
        this._exitTimer = null
      }

      if (dialog.open && !this.closing) return

      this.closing = false
      this.$emit('before-show')
      this._previousFocus = document.activeElement
      this.lockBodyScroll()
      this.isVisible = true

      // Ensure the wrap starts offscreen before the dialog is painted
      this.entered = false
      this.backdropVisible = false

      dialog.show()

      // After the browser paints the dialog in its offscreen position,
      // flip the entered flag to trigger the CSS transition.
      nextTick(() => {
        // Force a layout so the initial translate(100%) is committed
        // before we add the entered class (otherwise the browser may batch
        // both into a single frame and skip the transition).
        // eslint-disable-next-line no-unused-expressions
        this.$refs.wrapRef?.offsetHeight

        this.entered = true
        this.backdropVisible = true
        this.focusFirstElement()
        this.$emit('show')
        // Re-setup gesture in case refs changed
        this.setupGesture()
      })
    },

    close() {
      const dialog = this.$refs.dialogRef
      if (!dialog || !dialog.open) return
      if (this.closing) return // prevent re-entrant calls during exit animation
      this.closing = true

      // Dismiss the keyboard if it's open
      if (keyboardState.isOpen) {
        dismissKeyboard()
      }

      this.$emit('before-hide')

      if (screen.isMobile) {
        // Animate out: slide wrap down + fade backdrop
        this.entered = false
        this.backdropVisible = false

        const duration = getSheetDuration()
        // Wait for the transition to finish, then close the dialog element
        this._exitTimer = setTimeout(() => {
          this._exitTimer = null
          this._finalizeClose(dialog)
        }, duration)
      } else {
        // Desktop: close immediately (no slide animation)
        this._finalizeClose(dialog)
      }
    },

    _finalizeClose(dialog) {
      // Set isVisible false BEFORE dialog.close() so onNativeClose
      // (which fires synchronously from dialog.close()) can detect
      // that _finalizeClose already handled cleanup and skip it.
      this.isVisible = false
      if (dialog.open) dialog.close()
      this.backdropVisible = false
      this.entered = false
      this.closing = false
      this.dragOffset = 0
      this.dragging = false
      // Clean up gesture so stale internal state doesn't affect next open
      if (this.stopGesture) {
        this.stopGesture()
        this.stopGesture = null
      }
      // Clear any inline backdrop color from drag
      if (dialog) dialog.style.backgroundColor = ''
      this.unlockBodyScroll()
      this.$emit('hide')

      // Restore focus to element that was focused before tray opened
      if (this._previousFocus && this._previousFocus.focus) {
        this._previousFocus.focus()
        this._previousFocus = null
      }
    },

    onNativeClose() {
      // If _finalizeClose already handled cleanup, skip to avoid
      // double-decrementing the scroll lock counter.
      if (!this.isVisible) return

      this.isVisible = false
      this.backdropVisible = false
      this.entered = false
      this.closing = false
      this.unlockBodyScroll()
      if (this.modelValue) {
        this.$emit('update:modelValue', false)
      }
    },

    onKeydown(e) {
      // Escape handling — dialog.show() does NOT fire cancel on Escape
      if (e.key === 'Escape') {
        if (this.persistent) {
          e.preventDefault()
          return
        }
        e.preventDefault()
        this.$emit('update:modelValue', false)
        return
      }

      // Focus trapping on Tab
      if (e.key === 'Tab') {
        const focusable = this.getFocusableElements()
        if (!focusable.length) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },

    getFocusableElements() {
      const dialog = this.$refs.dialogRef
      if (!dialog) return []
      return [...dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )]
    },

    focusFirstElement() {
      const focusable = this.getFocusableElements()
      if (focusable.length) {
        focusable[0].focus()
      } else {
        // Focus the wrap div as fallback
        this.$refs.wrapRef?.focus()
      }
    },

    onDialogClick(e) {
      // Only treat clicks directly on the dialog element as backdrop clicks.
      // Clicks on the wrap or its children have a different target.
      if (e.target !== this.$refs.dialogRef) return
      if (this.persistent) return
      this.$emit('update:modelValue', false)
    },

    lockBodyScroll() {
      if (scrollLockCount === 0) {
        savedOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }
      scrollLockCount++
    },

    unlockBodyScroll() {
      scrollLockCount = Math.max(0, scrollLockCount - 1)
      if (scrollLockCount === 0) {
        document.body.style.overflow = savedOverflow
      }
    },

    hasChildDialogOpen() {
      // With Teleport, dialogs are siblings at body level. Check if any OTHER
      // open dialog exists that was rendered after this one (higher in DOM order = on top).
      const dialog = this.$refs.dialogRef
      if (!dialog) return false
      const allOpen = document.querySelectorAll('dialog.basil-tray[open]')
      const myIndex = [...allOpen].indexOf(dialog)
      return myIndex >= 0 && myIndex < allOpen.length - 1
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
          // Ignore gestures if another dialog is stacked on top of this one
          if (this.hasChildDialogOpen()) return
          // Only allow dragging downward
          if (state.deltaY > 0) {
            this.dragOffset = state.deltaY
            this.dragging = true

            // Sync backdrop opacity: fade out proportionally to drag progress
            const wrapHeight = wrapEl.offsetHeight || 1
            const progress = Math.min(state.deltaY / wrapHeight, 1)
            const dialog = this.$refs.dialogRef
            if (dialog) {
              const opacity = 0.5 * (1 - progress)
              dialog.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`
            }
          }
        },
        onEnd: (state) => {
          if (this.hasChildDialogOpen()) return

          const wrapHeight = wrapEl.offsetHeight || 1
          // Velocity in px/s from useGesture; convert to px/ms for comparison
          const velocityPxMs = Math.abs(state.velocityY) / 1000
          const draggedPastThreshold = state.deltaY > wrapHeight * 0.25
          const fastSwipe = velocityPxMs > 0.4

          if ((fastSwipe || draggedPastThreshold) && !this.persistent) {
            // Dismiss: let CSS transition animate from current position to offscreen
            this.dragging = false
            this.dragOffset = 0
            // Clear the inline backdrop color so CSS transition takes over
            const dialog = this.$refs.dialogRef
            if (dialog) dialog.style.backgroundColor = ''
            this.$emit('update:modelValue', false)
          } else {
            // Snap back: remove dragging state so CSS transition animates to translateY(0)
            this.dragging = false
            this.dragOffset = 0
            // Reset backdrop to full opacity via CSS
            const dialog = this.$refs.dialogRef
            if (dialog) dialog.style.backgroundColor = ''
          }
        },
      })
    },
  },
}
</script>
