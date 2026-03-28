<template>
  <dialog
    ref="dialogRef"
    class="basil-tray"
    :class="{ 'basil-tray--visible': isVisible }"
    :aria-modal="isVisible ? 'true' : undefined"
    @close="onNativeClose"
    @keydown="onKeydown"
    @click="onDialogClick"
  >
    <div
      ref="wrapRef"
      tabindex="-1"
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
import { keyboardState, dismissKeyboard } from '@/utils/basilKeyboard'

// Global scroll lock — counter prevents child tray unlock from reverting parent lock.
// iOS Safari ignores overflow:hidden on body. The only reliable prevention is
// intercepting touchmove events with { passive: false } and calling preventDefault().
// This is the same technique used by Vaul, body-scroll-lock, and React Aria.
let scrollLockCount = 0
let savedBodyStyles = {}
let scrollPreventCleanup = null

function preventScrolliOS() {
  let scrollable, lastY

  function isScrollable(node) {
    const style = window.getComputedStyle(node)
    return /(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)
  }

  function getScrollParent(node) {
    while (node && node !== document.body && node !== document.documentElement) {
      if (isScrollable(node)) return node
      node = node.parentElement
    }
    return null
  }

  function onTouchStart(e) {
    scrollable = getScrollParent(e.target)
    lastY = e.changedTouches[0].pageY
  }

  function onTouchMove(e) {
    // No scrollable ancestor inside the tray — block the scroll entirely
    if (!scrollable) {
      e.preventDefault()
      return
    }
    // Inside a scrollable element — allow scrolling within but block at boundaries
    // (at boundaries, iOS would "escape" and scroll the page behind)
    const y = e.changedTouches[0].pageY
    const top = scrollable.scrollTop
    const bottom = scrollable.scrollHeight - scrollable.clientHeight
    if (bottom > 0 && ((top <= 0 && y > lastY) || (top >= bottom && y < lastY))) {
      e.preventDefault()
    }
    lastY = y
  }

  document.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })

  return () => {
    document.removeEventListener('touchstart', onTouchStart, true)
    document.removeEventListener('touchmove', onTouchMove, true)
  }
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
      hasScrollLock: false,
      screen,
      isVisible: false,
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
      this._previousFocus = document.activeElement
      this.lockBodyScroll()
      this.isVisible = true

      dialog.show()

      nextTick(() => {
        this.focusFirstElement()
        this.$emit('show')
        // Re-setup gesture in case refs changed
        this.setupGesture()
      })
    },

    close() {
      const dialog = this.$refs.dialogRef
      if (!dialog || !dialog.open) return

      // Dismiss the keyboard if it's open
      if (keyboardState.isOpen) {
        dismissKeyboard()
      }

      this.$emit('before-hide')
      // Set isVisible false BEFORE dialog.close() so onNativeClose
      // (which fires synchronously) can skip its own cleanup.
      this.isVisible = false
      dialog.close()
      this.unlockBodyScroll()
      this.$emit('hide')

      // Restore focus to element that was focused before tray opened
      if (this._previousFocus && this._previousFocus.focus) {
        this._previousFocus.focus()
        this._previousFocus = null
      }
    },

    onNativeClose() {
      // If close() already handled cleanup, skip to avoid double-decrementing
      // the scroll lock counter.
      if (!this.isVisible) return

      this.isVisible = false
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
        savedBodyStyles = { overflow: document.body.style.overflow }
        document.body.style.overflow = 'hidden'
        scrollPreventCleanup = preventScrolliOS()
      }
      scrollLockCount++
      this.hasScrollLock = true
    },

    unlockBodyScroll() {
      if (!this.hasScrollLock) return
      this.hasScrollLock = false
      scrollLockCount = Math.max(0, scrollLockCount - 1)
      if (scrollLockCount === 0) {
        if (scrollPreventCleanup) {
          scrollPreventCleanup()
          scrollPreventCleanup = null
        }
        Object.assign(document.body.style, savedBodyStyles)
      }
    },

    hasChildDialogOpen() {
      // Check if another dialog is open on top of this one (e.g. date picker tray inside edit tray)
      const dialog = this.$refs.dialogRef
      if (!dialog) return false
      return dialog.querySelector('dialog[open]') !== null
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
          }
        },
        onEnd: (state) => {
          if (this.hasChildDialogOpen()) return
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
