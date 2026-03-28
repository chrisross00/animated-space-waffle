<template>
  <Teleport to="body">
    <div
      v-if="mounted"
      ref="rootRef"
      class="basil-tray"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      @keydown.esc="onEsc"
    >
      <div
        ref="backdropRef"
        :class="['basil-tray__backdrop', visible && 'basil-tray__backdrop--visible']"
        @click="onBackdropClick"
      ></div>
      <div
        ref="wrapRef"
        :class="[
          'basil-tray__wrap',
          screen.isMobile && 'basil-tray__wrap--mobile',
          visible && screen.isMobile && 'basil-tray__wrap--visible',
        ]"
        :style="[
          !screen.isMobile ? `max-width: ${maxWidth}` : undefined,
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

  savedScrollY = window.scrollY
  const body = document.body
  body.style.position = 'fixed'
  body.style.top = `-${savedScrollY}px`
  body.style.left = '0'
  body.style.right = '0'

  let scrollable = null
  let lastY = 0

  function getScrollParent(node) {
    if (!node) return null
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
    if (!scrollable) {
      e.preventDefault()
      return
    }
    const y = e.changedTouches[0].pageY
    const scrollTop = scrollable.scrollTop
    const bottom = scrollable.scrollHeight - scrollable.clientHeight
    if (bottom === 0) return
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

// --- Vaul constants ---
const TRANSITION_CSS = 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)'
const OPACITY_TRANSITION_CSS = 'opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1)'
const ANIM_DURATION = 500
const VELOCITY_THRESHOLD = 400   // px/s (Vaul uses 0.4 px/ms)
const CLOSE_THRESHOLD = 0.25     // close when dragged > 25% of drawer height

// Vaul's rubber-band dampening: 8 * (Math.log(v + 1) - 2)
function dampenValue(v) {
  return 8 * (Math.log(v + 1) - 2)
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
      mounted: false,
      visible: false,
      dragging: false,
      screen,
    }
  },

  watch: {
    modelValue(val) {
      if (val) this.open()
      else this.close()
    },
  },

  mounted() {
    if (this.modelValue) this.open(true)
    this.stopGesture = null
    this._closeTimer = null
    this._closing = false
  },

  beforeUnmount() {
    if (this.stopGesture) {
      this.stopGesture()
      this.stopGesture = null
    }
    clearTimeout(this._closeTimer)
    if (this.mounted) {
      trayStack.splice(trayStack.indexOf(this), 1)
      unlockScroll()
      this.mounted = false
      this.visible = false
    }
  },

  methods: {
    // ── Open ──────────────────────────────────────────────
    open(skipAnimation = false) {
      if (this.mounted) return

      clearTimeout(this._closeTimer)
      this._closing = false
      this._previousFocus = document.activeElement
      this.$emit('before-show')
      trayStack.push(this)
      lockScroll()

      this.mounted = true

      nextTick(() => {
        if (skipAnimation || !this.screen.isMobile) {
          this.visible = true
          this.$refs.rootRef?.focus()
          this.$emit('show')
          this.setupGesture()
        } else {
          // Force reflow so browser registers off-screen position before transition
          // eslint-disable-next-line no-unused-expressions
          this.$refs.wrapRef?.offsetHeight
          this.visible = true
          this.$refs.rootRef?.focus()
          this.$emit('show')
          this.setupGesture()
        }
      })
    },

    // ── Close (programmatic — from v-model, ESC, backdrop click, Cancel button) ──
    close() {
      if (!this.mounted || this._closing) return
      this._closing = true
      this.$emit('before-hide')

      if (this.stopGesture) {
        this.stopGesture()
        this.stopGesture = null
      }

      trayStack.splice(trayStack.indexOf(this), 1)
      unlockScroll()

      if (this.screen.isMobile) {
        this.visible = false
        this._waitForTransitionEnd(() => this._finishClose())
      } else {
        this.visible = false
        this._finishClose()
      }
    },

    // ── Animated close (from drag release — tray is already at a drag offset) ──
    _animateClose() {
      this._closing = true
      this.$emit('before-hide')

      if (this.stopGesture) {
        this.stopGesture()
        this.stopGesture = null
      }

      trayStack.splice(trayStack.indexOf(this), 1)
      unlockScroll()

      const wrapEl = this.$refs.wrapRef
      const backdropEl = this.$refs.backdropRef
      if (wrapEl) {
        wrapEl.style.transition = TRANSITION_CSS
        wrapEl.style.transform = 'translateY(100%)'
      }
      if (backdropEl) {
        backdropEl.style.transition = OPACITY_TRANSITION_CSS
        backdropEl.style.opacity = '0'
      }

      this._waitForTransitionEnd(() => {
        // Clear inline styles so CSS classes take over on next open
        if (wrapEl) { wrapEl.style.transition = ''; wrapEl.style.transform = '' }
        if (backdropEl) { backdropEl.style.transition = ''; backdropEl.style.opacity = '' }
        this.visible = false
        this._finishClose()
      })
    },

    // ── Animated reset (snap back to open after insufficient drag) ──
    _animateReset() {
      const wrapEl = this.$refs.wrapRef
      const backdropEl = this.$refs.backdropRef
      if (wrapEl) {
        wrapEl.style.transition = TRANSITION_CSS
        wrapEl.style.transform = 'translateY(0)'
      }
      if (backdropEl) {
        backdropEl.style.transition = OPACITY_TRANSITION_CSS
        backdropEl.style.opacity = '1'
      }

      this._waitForTransitionEnd(() => {
        // Clear inline styles so CSS classes resume control
        if (wrapEl) { wrapEl.style.transition = ''; wrapEl.style.transform = '' }
        if (backdropEl) { backdropEl.style.transition = ''; backdropEl.style.opacity = '' }
        this.dragging = false
      })
    },

    _waitForTransitionEnd(callback) {
      const wrapEl = this.$refs.wrapRef
      const onEnd = (e) => {
        if (e.target !== wrapEl) return // ignore child transitions
        wrapEl?.removeEventListener('transitionend', onEnd)
        clearTimeout(this._closeTimer)
        callback()
      }
      wrapEl?.addEventListener('transitionend', onEnd)
      // Fallback if transitionend doesn't fire
      this._closeTimer = setTimeout(() => {
        wrapEl?.removeEventListener('transitionend', onEnd)
        callback()
      }, ANIM_DURATION + 50)
    },

    _finishClose() {
      if (!this._closing) return
      this._closing = false
      this.mounted = false

      this.$emit('hide')

      nextTick(() => {
        this._previousFocus?.focus()
        this._previousFocus = null
      })

      if (this.modelValue) {
        this.$emit('update:modelValue', false)
      }
    },

    // ── Event handlers ───────────────────────────────────
    onEsc() {
      if (this.persistent) return
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

    // ── Gesture ──────────────────────────────────────────
    setupGesture() {
      if (this.stopGesture) {
        this.stopGesture()
        this.stopGesture = null
      }

      if (!screen.isMobile) return

      const wrapEl = this.$refs.wrapRef
      const backdropEl = this.$refs.backdropRef
      if (!wrapEl) return

      this.stopGesture = useGesture(wrapEl, {
        direction: 'vertical',

        onMove: (state) => {
          if (!this.isTopmostTray()) return

          const wrapHeight = wrapEl.offsetHeight
          const deltaY = state.deltaY

          if (deltaY > 0) {
            // ── Dragging DOWN (toward close) ──
            this.dragging = true
            wrapEl.style.transition = 'none'
            wrapEl.style.transform = `translateY(${deltaY}px)`
            // Sync backdrop opacity
            if (backdropEl) {
              const opacity = Math.max(0, 1 - (deltaY / wrapHeight))
              backdropEl.style.transition = 'none'
              backdropEl.style.opacity = String(opacity)
            }
          } else if (deltaY < 0) {
            // ── Dragging UP (past open — rubber-band) ──
            this.dragging = true
            const dampened = dampenValue(Math.abs(deltaY))
            const translateValue = Math.min(dampened * -1, 0)
            wrapEl.style.transition = 'none'
            wrapEl.style.transform = `translateY(${translateValue}px)`
          }
        },

        onEnd: (state) => {
          if (!this.isTopmostTray()) return
          if (!this.dragging) return

          const wrapHeight = wrapEl.offsetHeight
          const dragDistance = state.deltaY
          const velocity = Math.abs(state.velocityY) // px/s

          // ── Close decision (matching Vaul) ──
          // 1. If dragged upward (toward open), always reset
          if (dragDistance <= 0) {
            this._animateReset()
            return
          }

          // 2. If persistent, always reset
          if (this.persistent) {
            this._animateReset()
            return
          }

          // 3. Fast flick → close
          if (velocity > VELOCITY_THRESHOLD) {
            this._animateClose()
            return
          }

          // 4. Dragged past 25% of drawer height → close
          if (dragDistance >= wrapHeight * CLOSE_THRESHOLD) {
            this._animateClose()
            return
          }

          // 5. Otherwise → snap back to open
          this._animateReset()
        },
      })
    },
  },
}
</script>
