import { reactive } from 'vue'

export const keyboardState = reactive({
  isOpen: false,
  mode: 'qwerty',
  height: 0,
})

let activeCallbacks = null

export function requestKeyboard({ mode, onKey, onBackspace, onDone, inputEl }) {
  // Blur the previously focused input (if any) before switching
  if (activeCallbacks && activeCallbacks.onDone !== onDone) {
    activeCallbacks.onBlur?.()
  }
  activeCallbacks = { onKey, onBackspace, onDone, onBlur: null, inputEl }
  keyboardState.mode = mode
  keyboardState.isOpen = true
}

export function setActiveBlur(onBlur) {
  if (activeCallbacks) activeCallbacks.onBlur = onBlur
}

export function dismissKeyboard() {
  activeCallbacks?.onBlur?.()
  activeCallbacks = null
  keyboardState.isOpen = false
  keyboardState.height = 0
  // Clean up full-page body padding added by scrollActiveInputIntoView
  document.body.style.paddingBottom = ''
}

export function emitKey(char) {
  activeCallbacks?.onKey(char)
}

export function emitBackspace() {
  activeCallbacks?.onBackspace()
}

export function emitDone() {
  activeCallbacks?.onDone()
  dismissKeyboard()
}

export function getActiveInputEl() {
  return activeCallbacks?.inputEl ?? null
}

/**
 * Smooth-scroll a container by a given amount over ~250ms.
 */
function smoothScrollBy(container, distance) {
  const start = container.scrollTop
  const startTime = performance.now()
  // Scale duration with distance: min 300ms, max 500ms
  const duration = Math.min(500, Math.max(300, distance * 2))

  function step(now) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / duration, 1)
    // ease-out cubic
    const ease = 1 - Math.pow(1 - t, 3)
    container.scrollTop = start + distance * ease
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/**
 * Find the closest scrollable ancestor of an element.
 */
function findScrollParent(el) {
  let parent = el.parentElement
  while (parent && parent !== document.body) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

/**
 * After the keyboard opens, scroll the active input into view
 * within its nearest scrollable ancestor (e.g. tray body).
 */
export function scrollActiveInputIntoView() {
  const el = activeCallbacks?.inputEl
  if (!el) return

  // If height isn't set yet (watcher pending), retry shortly
  if (!keyboardState.height) {
    setTimeout(() => scrollActiveInputIntoView(), 50)
    return
  }

  const elRect = el.getBoundingClientRect()
  const visibleBottom = window.innerHeight - keyboardState.height
  const padding = 40 // breathing room above the keyboard

  const scrollParent = findScrollParent(el)
  if (scrollParent) {
    // Inside a tray/dialog — scroll within the container
    const parentRect = scrollParent.getBoundingClientRect()
    const containerVisible = Math.min(parentRect.bottom, visibleBottom)
    const overflow = elRect.bottom - containerVisible + padding
    if (overflow > 0) smoothScrollBy(scrollParent, overflow)
  } else {
    // Full-page view — add padding to body so content is reachable, then scroll
    document.body.style.paddingBottom = keyboardState.height + 'px'
    const overflow = elRect.bottom - visibleBottom + padding
    if (overflow > 0) smoothScrollBy(document.documentElement, overflow)
  }
}
