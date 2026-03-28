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
        :class="['basil-tray__backdrop', visible && (!hasSnapPoints || !screen.isMobile) && 'basil-tray__backdrop--visible']"
        @click="onBackdropClick"
      ></div>
      <div
        ref="wrapRef"
        :class="[
          'basil-tray__wrap',
          screen.isMobile && 'basil-tray__wrap--mobile',
          visible && screen.isMobile && !hasSnapPoints && 'basil-tray__wrap--visible',
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
import { lockScroll, unlockScroll } from '@/composables/useScrollLock'
import { keyboardState, getActiveInputEl } from '@/utils/basilKeyboard'
import { nextTick, watch } from 'vue'

// Module-level tray stack for nested tray detection
const trayStack = []

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
    modelValue:    { type: Boolean, default: false },
    maxWidth:      { type: String, default: '480px' },
    persistent:    { type: Boolean, default: false },
    // Snap points: array of fractions (0-1) of viewport height, least → most visible.
    // E.g. [0.4, 0.9] = peek at 40%, full at 90%.
    snapPoints:    { type: Array, default: null },
    activeSnapPoint: { type: Number, default: null },
    // Snap point index at/above which backdrop becomes visible. Default: last snap point.
    fadeFromIndex:   { type: Number, default: null },
  },
  emits: ['update:modelValue', 'update:activeSnapPoint', 'before-show', 'show', 'before-hide', 'hide'],

  data() {
    return {
      mounted: false,
      visible: false,
      dragging: false,
      screen,
    }
  },

  computed: {
    hasSnapPoints() {
      return this.snapPoints && this.snapPoints.length > 0
    },
    // Effective fadeFromIndex: default to last snap point
    _fadeFromIndex() {
      if (this.fadeFromIndex != null) return this.fadeFromIndex
      return this.hasSnapPoints ? this.snapPoints.length - 1 : 0
    },
  },

  watch: {
    modelValue(val) {
      if (val) this.open()
      else this.close()
    },
    activeSnapPoint(val) {
      if (!this.hasSnapPoints || !this.mounted || val == null) return
      const idx = this.snapPoints.indexOf(val)
      if (idx !== -1 && idx !== this._snapIndex) {
        this._snapIndex = idx
        this._snapToIndex(idx)
      }
    },
  },

  mounted() {
    if (this.modelValue) this.open(true)

    // Non-reactive private state (not in data() — no need for Vue proxying)
    this.stopGesture = null
    this._closeTimer = null
    this._closing = false
    this._transitionGen = 0
    this._snapIndex = 0
    this._keyboardShift = 0

    // When keyboard opens inside this tray, adapt:
    // - Snap point trays: expand to full (and stay there)
    // - Standard trays: shift up so keyboard doesn't cover the input
    // Watch height (not isOpen) because height is set after isOpen on nextTick.
    this._stopKeyboardWatch = watch(
      () => keyboardState.height,
      (height) => {
        if (!this.mounted || !this.isTopmostTray()) return
        if (!this.screen.isMobile) return

        const wrapEl = this.$refs.wrapRef
        if (!wrapEl) return

        if (this.hasSnapPoints) {
          // Snap point tray: expand to full and stay there
          if (height > 0) {
            const lastIdx = this.snapPoints.length - 1
            if (this._snapIndex < lastIdx) this._snapToIndex(lastIdx)
          }
        } else {
          // Standard tray: shift up just enough so focused input clears the keyboard
          if (height > 0) {
            const inputEl = getActiveInputEl()
            if (inputEl) {
              const inputBottom = inputEl.getBoundingClientRect().bottom
              const keyboardTop = window.innerHeight - height
              const padding = 40
              const overlap = inputBottom - keyboardTop + padding
              if (overlap > 0) {
                this._keyboardShift = overlap
                wrapEl.style.transition = TRANSITION_CSS
                wrapEl.style.transform = `translateY(-${overlap}px)`
              }
            }
          } else if (this._keyboardShift > 0) {
            this._keyboardShift = 0
            wrapEl.style.transition = TRANSITION_CSS
            wrapEl.style.transform = 'translateY(0)'
            this._waitForTransitionEnd(() => {
              this._clearInlineStyles()
            })
          }
        }
      },
    )
  },

  beforeUnmount() {
    if (this._stopKeyboardWatch) { this._stopKeyboardWatch(); this._stopKeyboardWatch = null }
    if (this.stopGesture) { this.stopGesture(); this.stopGesture = null }
    clearTimeout(this._closeTimer)
    if (this.mounted) {
      trayStack.splice(trayStack.indexOf(this), 1)
      unlockScroll()
      this.mounted = false
      this.visible = false
    }
  },

  methods: {
    // ── Snap point helpers ─────────────────────────────────
    _getSnapOffsets() {
      // Convert snap point fractions to translateY pixel offsets.
      // The largest snap point = translateY(0) (fully visible).
      // Smaller snap points are pushed down relative to the largest.
      // E.g. [0.45, 0.9] on 900px viewport:
      //   0.9 → translateY(0)    — tray fully visible
      //   0.45 → translateY(405) — top 45% of viewport visible
      const vh = window.innerHeight
      const maxFrac = this.snapPoints[this.snapPoints.length - 1]
      return this.snapPoints.map(frac => (maxFrac - frac) * vh)
    },

    _snapToIndex(idx, animate = true) {
      const offsets = this._getSnapOffsets()
      const offset = offsets[idx]
      if (offset == null) return

      const wrapEl = this.$refs.wrapRef
      const backdropEl = this.$refs.backdropRef
      if (!wrapEl) return

      if (animate) {
        wrapEl.style.transition = TRANSITION_CSS
      }
      wrapEl.style.transform = `translateY(${offset}px)`

      // Backdrop: visible at/above fadeFromIndex
      if (backdropEl) {
        if (animate) backdropEl.style.transition = OPACITY_TRANSITION_CSS
        backdropEl.style.opacity = idx >= this._fadeFromIndex ? '1' : '0'
      }

      this._snapIndex = idx
      this.$emit('update:activeSnapPoint', this.snapPoints[idx])
    },

    // ── Open ──────────────────────────────────────────────
    open(skipAnimation = false) {
      if (this.mounted && !this._closing) return

      // If closing animation is in progress, cancel it and reopen
      if (this._closing) {
        this._closing = false
        this._transitionGen++
        clearTimeout(this._closeTimer)
        this._clearInlineStyles()
        this.visible = true
        this.setupGesture()
        return
      }
      this._previousFocus = document.activeElement
      this.$emit('before-show')
      trayStack.push(this)
      lockScroll()

      this.mounted = true

      nextTick(() => {
        if (this.hasSnapPoints && this.screen.isMobile) {
          // Snap point tray: start off-screen, animate to first snap point
          const wrapEl = this.$refs.wrapRef
          if (wrapEl) {
            wrapEl.style.transform = 'translateY(100%)'
            // eslint-disable-next-line no-unused-expressions
            wrapEl.offsetHeight // force reflow
          }
          const initialIndex = this.activeSnapPoint != null
            ? Math.max(this.snapPoints.indexOf(this.activeSnapPoint), 0)
            : 0
          this._snapToIndex(initialIndex, !skipAnimation)
          this.visible = true
          this.$refs.rootRef?.focus()
          this.$emit('show')
          this.setupGesture()
        } else if (skipAnimation || !this.screen.isMobile) {
          this.visible = true
          this.$refs.rootRef?.focus()
          this.$emit('show')
          this.setupGesture()
        } else {
          // eslint-disable-next-line no-unused-expressions
          this.$refs.wrapRef?.offsetHeight
          this.visible = true
          this.$refs.rootRef?.focus()
          this.$emit('show')
          this.setupGesture()
        }
      })
    },

    // ── Close ─────────────────────────────────────────────
    close() {
      if (!this.mounted || this._closing) return
      this._closing = true
      this.$emit('before-hide')

      if (this.stopGesture) { this.stopGesture(); this.stopGesture = null }

      // Clear any in-progress drag/reset inline styles so the CSS
      // class transition can take effect for the close animation
      this._clearInlineStyles()

      if (this.screen.isMobile) {
        if (this.hasSnapPoints) {
          // Snap point tray: animate off-screen from current position
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
            this._clearInlineStyles()
            this.visible = false
            this._finishClose()
          })
        } else {
          this.visible = false
          this._waitForTransitionEnd(() => this._finishClose())
        }
      } else {
        this.visible = false
        this._finishClose()
      }
    },

    // ── Animated close (from drag release) ───────────────
    _animateClose() {
      this._closing = true
      this.$emit('before-hide')

      if (this.stopGesture) { this.stopGesture(); this.stopGesture = null }

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
        this._clearInlineStyles()
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
        if (!this.hasSnapPoints) this._clearInlineStyles()
        this.dragging = false
      })
    },

    _clearInlineStyles() {
      const wrapEl = this.$refs.wrapRef
      const backdropEl = this.$refs.backdropRef
      if (wrapEl) { wrapEl.style.transition = ''; wrapEl.style.transform = '' }
      if (backdropEl) { backdropEl.style.transition = ''; backdropEl.style.opacity = '' }
    },

    _waitForTransitionEnd(callback) {
      // Generation counter prevents stale callbacks from firing.
      // Each call increments the generation; if a newer call arrives
      // before the old one resolves, the old callback is silently dropped.
      this._transitionGen++
      const gen = this._transitionGen

      const invoke = () => {
        if (this._transitionGen !== gen) return
        callback()
      }

      const wrapEl = this.$refs.wrapRef
      const onEnd = (e) => {
        if (e.target !== wrapEl) return
        wrapEl?.removeEventListener('transitionend', onEnd)
        clearTimeout(this._closeTimer)
        invoke()
      }
      wrapEl?.addEventListener('transitionend', onEnd)
      this._closeTimer = setTimeout(() => {
        wrapEl?.removeEventListener('transitionend', onEnd)
        invoke()
      }, ANIM_DURATION + 50)
    },

    _finishClose() {
      if (!this._closing) return
      this._closing = false
      trayStack.splice(trayStack.indexOf(this), 1)
      unlockScroll()
      this.mounted = false
      this.$emit('hide')
      nextTick(() => {
        this._previousFocus?.focus()
        this._previousFocus = null
      })
      if (this.modelValue) this.$emit('update:modelValue', false)
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
      if (this.stopGesture) { this.stopGesture(); this.stopGesture = null }
      if (!screen.isMobile) return

      const wrapEl = this.$refs.wrapRef
      const backdropEl = this.$refs.backdropRef
      if (!wrapEl) return

      if (this.hasSnapPoints) {
        this._setupSnapGesture(wrapEl, backdropEl)
      } else {
        this._setupStandardGesture(wrapEl, backdropEl)
      }
    },

    // ── Standard gesture (no snap points) ────────────────
    _setupStandardGesture(wrapEl, backdropEl) {
      this.stopGesture = useGesture(wrapEl, {
        direction: 'vertical',

        onMove: (state) => {
          if (!this.isTopmostTray()) return
          const deltaY = state.deltaY

          if (deltaY > 0) {
            this.dragging = true
            const wrapHeight = wrapEl.offsetHeight
            wrapEl.style.transition = 'none'
            wrapEl.style.transform = `translateY(${deltaY}px)`
            if (backdropEl) {
              backdropEl.style.transition = 'none'
              backdropEl.style.opacity = String(Math.max(0, 1 - (deltaY / wrapHeight)))
            }
          } else if (deltaY < 0) {
            this.dragging = true
            const dampened = dampenValue(Math.abs(deltaY))
            wrapEl.style.transition = 'none'
            wrapEl.style.transform = `translateY(${Math.min(dampened * -1, 0)}px)`
          }
        },

        onEnd: (state) => {
          if (!this.isTopmostTray() || !this.dragging) return

          const wrapHeight = wrapEl.offsetHeight
          const dragDistance = state.deltaY
          const velocity = Math.abs(state.velocityY)

          if (dragDistance <= 0) { this._animateReset(); return }
          if (this.persistent) { this._animateReset(); return }
          if (velocity > VELOCITY_THRESHOLD) { this._animateClose(); return }
          if (dragDistance >= wrapHeight * CLOSE_THRESHOLD) { this._animateClose(); return }
          this._animateReset()
        },
      })
    },

    // ── Snap point gesture ───────────────────────────────
    _setupSnapGesture(wrapEl, backdropEl) {
      this.stopGesture = useGesture(wrapEl, {
        direction: 'vertical',

        onMove: (state) => {
          if (!this.isTopmostTray()) return

          const offsets = this._getSnapOffsets()
          const activeOffset = offsets[this._snapIndex]
          const deltaY = state.deltaY
          const draggedDistance = -deltaY
          const newPosition = activeOffset - draggedDistance

          // Clamp: don't go past the last (most visible) snap point
          const lastOffset = offsets[offsets.length - 1]
          const clampedPosition = Math.max(newPosition, lastOffset)

          this.dragging = true
          wrapEl.style.transition = 'none'
          wrapEl.style.transform = `translateY(${clampedPosition}px)`

          // Backdrop opacity: interpolate based on position relative to fadeFromIndex
          if (backdropEl) {
            const fadeOffset = offsets[this._fadeFromIndex] || offsets[offsets.length - 1]
            const firstOffset = offsets[0]
            if (clampedPosition <= fadeOffset) {
              backdropEl.style.opacity = '1'
            } else if (clampedPosition >= firstOffset) {
              backdropEl.style.opacity = '0'
            } else {
              const pct = (clampedPosition - fadeOffset) / (firstOffset - fadeOffset)
              backdropEl.style.opacity = String(Math.max(0, Math.min(1, 1 - pct)))
            }
            backdropEl.style.transition = 'none'
          }
        },

        onEnd: (state) => {
          if (!this.isTopmostTray() || !this.dragging) return

          const offsets = this._getSnapOffsets()
          const activeOffset = offsets[this._snapIndex]
          const draggedDistance = -state.deltaY
          const currentPosition = activeOffset - draggedDistance
          const velocity = Math.abs(state.velocityY)
          const draggingDown = state.deltaY > 0

          // Fast flick down → close from any snap point
          if (velocity > VELOCITY_THRESHOLD && draggingDown && !this.persistent) {
            this._animateClose()
            return
          }

          // Fast flick up → jump to last (most visible) snap point
          if (velocity > VELOCITY_THRESHOLD && !draggingDown) {
            this._snapToIndex(this.snapPoints.length - 1)
            this.dragging = false
            return
          }

          // Find closest snap point to current position
          let closestIdx = 0
          let closestDist = Infinity
          for (let i = 0; i < offsets.length; i++) {
            const dist = Math.abs(offsets[i] - currentPosition)
            if (dist < closestDist) {
              closestDist = dist
              closestIdx = i
            }
          }

          // If dragged below first snap point past close threshold, dismiss
          if (currentPosition > offsets[0] && !this.persistent) {
            const overshoot = currentPosition - offsets[0]
            const wrapHeight = wrapEl.offsetHeight
            if (overshoot >= wrapHeight * CLOSE_THRESHOLD) {
              this._animateClose()
              return
            }
          }

          this._snapToIndex(closestIdx)
          this.dragging = false
        },
      })
    },
  },
}
</script>
