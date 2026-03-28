<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="rootRef"
      class="basil-tray"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      @keydown.esc="onEsc"
    >
      <div class="basil-tray__backdrop" @click="onBackdropClick"></div>
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
    </div>
  </Teleport>
</template>

<script>
import { screen } from '@/composables/useScreen'
import { useGesture } from '@/composables/useGesture'
import { nextTick } from 'vue'

// Module-level tray stack for nested tray detection
const trayStack = []

// Scroll lock reference counting — only restore when last tray closes
let scrollLockCount = 0
let savedScrollY = 0
let scrollLockCleanup = null

function lockScroll() {
  scrollLockCount++
  if (scrollLockCount > 1) return

  // Save scroll position and fix the body in place
  savedScrollY = window.scrollY
  const body = document.body
  body.style.position = 'fixed'
  body.style.top = `-${savedScrollY}px`
  body.style.left = '0'
  body.style.right = '0'

  // iOS touch interception (from Vaul's preventScrollMobileSafari)
  let scrollable = null
  let lastY = 0

  function getScrollParent(node) {
    if (!node) return null
    // If node itself is scrollable, start from parent
    if (isScrollable(node)) node = node.parentElement
    while (node) {
      if (isScrollable(node)) return node
      node = node.parentElement
    }
    return null
  }

  function isScrollable(el) {
    if (!el || el === document.documentElement || el === document.body) return false
    const style = window.getComputedStyle(el)
    return /(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)
  }

  function onTouchStart(e) {
    scrollable = getScrollParent(e.target)
    lastY = e.changedTouches[0].pageY
  }

  function onTouchMove(e) {
    // No scrollable parent — block touch entirely (prevents viewport scroll)
    if (!scrollable) {
      e.preventDefault()
      return
    }

    const y = e.changedTouches[0].pageY
    const scrollTop = scrollable.scrollTop
    const bottom = scrollable.scrollHeight - scrollable.clientHeight

    // Element has no scrollable range
    if (bottom === 0) {
      return
    }

    // At top scrolling down, or at bottom scrolling up — block to prevent
    // iOS from scrolling the viewport instead of the nested element
    if ((scrollTop <= 0 && y > lastY) || (scrollTop >= bottom && y < lastY)) {
      e.preventDefault()
    }

    lastY = y
  }

  document.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })

  scrollLockCleanup = () => {
    document.removeEventListener('touchstart', onTouchStart, { capture: true })
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
  }
}

function unlockScroll() {
  scrollLockCount--
  if (scrollLockCount > 0) return

  if (scrollLockCleanup) {
    scrollLockCleanup()
    scrollLockCleanup = null
  }

  const body = document.body
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  window.scrollTo(0, savedScrollY)
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
      isOpen: false,
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
    if (this.modelValue) {
      this.open()
    }
    this.stopGesture = null
  },

  beforeUnmount() {
    if (this.stopGesture) {
      this.stopGesture()
      this.stopGesture = null
    }
    if (this.isOpen) {
      trayStack.splice(trayStack.indexOf(this), 1)
      unlockScroll()
      this.isOpen = false
    }
  },

  methods: {
    open() {
      if (this.isOpen) return

      this._previousFocus = document.activeElement
      this.$emit('before-show')
      this.isOpen = true
      trayStack.push(this)
      lockScroll()

      nextTick(() => {
        this.$refs.rootRef?.focus()
        this.$emit('show')
        this.setupGesture()
      })
    },

    close() {
      if (!this.isOpen) return

      this.$emit('before-hide')

      if (this.stopGesture) {
        this.stopGesture()
        this.stopGesture = null
      }

      trayStack.splice(trayStack.indexOf(this), 1)
      unlockScroll()
      this.isOpen = false

      this.$emit('hide')

      // Restore focus to previously focused element
      nextTick(() => {
        this._previousFocus?.focus()
        this._previousFocus = null
      })

      // Sync v-model if not already false
      if (this.modelValue) {
        this.$emit('update:modelValue', false)
      }
    },

    onEsc() {
      if (this.persistent) return
      // Only close the topmost tray
      if (trayStack[trayStack.length - 1] !== this) return
      this.$emit('update:modelValue', false)
    },

    onBackdropClick() {
      if (this.persistent) return
      this.$emit('update:modelValue', false)
    },

    isTopmostTray() {
      return trayStack[trayStack.length - 1] === this
    },

    setupGesture() {
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
          if (!this.isTopmostTray()) return
          if (state.deltaY > 0) {
            this.dragOffset = state.deltaY
            this.dragging = true
          }
        },
        onEnd: (state) => {
          if (!this.isTopmostTray()) return
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
