import { onUnmounted, getCurrentInstance, unref } from 'vue'

/**
 * Generalized pointer-gesture composable.
 *
 * Extracts the common pattern from BasilTray (drag-to-dismiss), PullToRefresh
 * (vertical pull), and SwipeReveal (horizontal swipe) into a reusable hook.
 *
 * @param {import('vue').Ref<HTMLElement> | HTMLElement} elOrRef — Vue ref or raw DOM element
 * @param {Object} opts
 * @param {'vertical'|'horizontal'|'both'} [opts.direction='both'] — axis lock after threshold
 * @param {number}  [opts.threshold=10]   — px of movement before gesture activates
 * @param {Function} [opts.onStart]  — called when gesture activates (threshold crossed)
 * @param {Function} [opts.onMove]   — called on every pointermove while active
 * @param {Function} [opts.onEnd]    — called on pointerup / pointercancel
 * @returns {Function} stop — removes all listeners; called automatically via onUnmounted
 *                             when used inside setup()
 */
export function useGesture(elOrRef, opts = {}) {
  const {
    direction = 'both',
    threshold = 10,
    onStart,
    onMove,
    onEnd,
  } = opts

  // --- velocity tracking ---------------------------------------------------
  const VELOCITY_WINDOW = 5
  let history = [] // [{ x, y, t }]

  function pushHistory(x, y) {
    history.push({ x, y, t: Date.now() })
    if (history.length > VELOCITY_WINDOW) history.shift()
  }

  function computeVelocity() {
    if (history.length < 2) return { vx: 0, vy: 0 }
    const first = history[0]
    const last = history[history.length - 1]
    const dt = (last.t - first.t) / 1000 // seconds
    if (dt === 0) return { vx: 0, vy: 0 }
    return {
      vx: (last.x - first.x) / dt,
      vy: (last.y - first.y) / dt,
    }
  }

  // --- state ----------------------------------------------------------------
  let startX = 0
  let startY = 0
  let active = false       // threshold crossed, gesture in progress
  let decided = false      // axis lock decided (for single-axis modes)
  let lockedAxis = null    // 'x' | 'y' | null
  let prevTouchAction = '' // restore original touch-action on end
  let pointerId = null

  function resolveEl() {
    return unref(elOrRef)
  }

  // --- scrollable-child check -----------------------------------------------
  // If the pointer starts inside a child that has already been scrolled, the
  // user probably intends to scroll that child — not perform our gesture.
  function startsOnScrolledChild(target) {
    const root = resolveEl()
    let node = target
    while (node && node !== root) {
      if (node.scrollTop > 0) return true
      node = node.parentElement
    }
    return false
  }

  // --- build state object ---------------------------------------------------
  function buildState(x, y, extra) {
    const deltaX = x - startX
    const deltaY = y - startY
    const { vx, vy } = computeVelocity()
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    return {
      startX,
      startY,
      deltaX,
      deltaY,
      velocityX: vx,
      velocityY: vy,
      direction: lockedAxis === 'x' ? 'horizontal'
        : lockedAxis === 'y' ? 'vertical'
        : Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical',
      distance,
      // swipe booleans — meaningful only in onEnd
      swipedDown: false,
      swipedUp: false,
      swipedLeft: false,
      swipedRight: false,
      ...extra,
    }
  }

  function withSwipeBooleans(state) {
    const VELOCITY_THRESH = 300  // px/s
    const DISTANCE_THRESH = 80   // px

    const fastX = Math.abs(state.velocityX) > VELOCITY_THRESH
    const fastY = Math.abs(state.velocityY) > VELOCITY_THRESH
    const farX = Math.abs(state.deltaX) > DISTANCE_THRESH
    const farY = Math.abs(state.deltaY) > DISTANCE_THRESH

    state.swipedRight = (fastX || farX) && state.deltaX > 0
    state.swipedLeft  = (fastX || farX) && state.deltaX < 0
    state.swipedDown  = (fastY || farY) && state.deltaY > 0
    state.swipedUp    = (fastY || farY) && state.deltaY < 0

    return state
  }

  // --- pointer handlers -----------------------------------------------------
  function onPointerDown(e) {
    // Only track primary pointer (ignore multi-touch after first)
    if (pointerId !== null) return

    if (startsOnScrolledChild(e.target)) return

    pointerId = e.pointerId
    startX = e.clientX
    startY = e.clientY
    active = false
    decided = false
    lockedAxis = null
    history = []
    pushHistory(e.clientX, e.clientY)

    // Don't capture pointer here — capturing on pointerdown prevents click
    // events from firing on child elements (desktop mouse + narrow viewport).
    // Capture is deferred to activation (threshold crossed) in onPointerMove.
  }

  function onPointerMove(e) {
    if (e.pointerId !== pointerId) return

    const x = e.clientX
    const y = e.clientY
    pushHistory(x, y)

    const dx = x - startX
    const dy = y - startY

    // --- pre-activation: decide axis lock -----------------------------------
    if (!active) {
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < threshold) return

      // Decide axis lock for single-axis modes
      if (direction !== 'both') {
        if (!decided) {
          const dominantIsX = Math.abs(dx) > Math.abs(dy)
          decided = true

          if (direction === 'horizontal') {
            if (!dominantIsX) {
              // User is moving vertically — not our gesture, release capture
              cleanup(e)
              return
            }
            lockedAxis = 'x'
          } else { // vertical
            if (dominantIsX) {
              cleanup(e)
              return
            }
            lockedAxis = 'y'
          }
        }
      }

      // Activate
      active = true

      // Now that gesture is confirmed, capture pointer and suppress scrolling
      const el = resolveEl()
      if (el) {
        if (pointerId !== null) {
          try { el.setPointerCapture(pointerId) } catch (_) {}
        }
        prevTouchAction = el.style.touchAction || ''
        el.style.touchAction = 'none'
      }

      const state = buildState(x, y)
      if (onStart) onStart(state)
    }

    // --- active: fire onMove ------------------------------------------------
    if (active) {
      const state = buildState(x, y)
      if (onMove) onMove(state)
    }
  }

  function onPointerUp(e) {
    if (e.pointerId !== pointerId) return

    pushHistory(e.clientX, e.clientY)

    if (active) {
      const state = withSwipeBooleans(buildState(e.clientX, e.clientY))
      if (onEnd) onEnd(state)
    }

    cleanup(e)
  }

  function onPointerCancel(e) {
    if (e.pointerId !== pointerId) return

    if (active) {
      const state = withSwipeBooleans(buildState(e.clientX, e.clientY))
      if (onEnd) onEnd(state)
    }

    cleanup(e)
  }

  function cleanup(e) {
    const el = resolveEl()
    if (el && pointerId !== null) {
      try { el.releasePointerCapture(pointerId) } catch (_) { /* already released */ }
      el.style.touchAction = prevTouchAction
    }
    pointerId = null
    active = false
    decided = false
    history = []
  }

  // --- bind / unbind --------------------------------------------------------
  let bound = false

  function bind() {
    const el = resolveEl()
    if (!el || bound) return
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    bound = true
  }

  function unbind() {
    const el = resolveEl()
    if (!el || !bound) return
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('pointercancel', onPointerCancel)

    // Restore touch-action if we left it dirty
    if (active) {
      el.style.touchAction = prevTouchAction
    }
    bound = false
    pointerId = null
    active = false
  }

  // --- init -----------------------------------------------------------------
  // If the ref resolves immediately (raw element or already mounted ref), bind now.
  // Otherwise the consumer is responsible for calling bind after mount, but we'll
  // try on next microtick in case the ref is populated after setup() returns.
  if (resolveEl()) {
    bind()
  } else {
    Promise.resolve().then(() => {
      if (!bound) bind()
    })
  }

  // Auto-cleanup when used inside setup()
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(unbind)
  }

  // Return stop function for manual cleanup (Options API mounted, etc.)
  return unbind
}
