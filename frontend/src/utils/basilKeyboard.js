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
  if (!el || !keyboardState.height) return

  const elRect = el.getBoundingClientRect()
  const visibleBottom = window.innerHeight - keyboardState.height
  const margin = 16

  if (elRect.bottom <= visibleBottom - margin) return // already visible

  const scrollParent = findScrollParent(el)
  if (scrollParent) {
    // Inside a tray/dialog — scroll within the container
    const parentRect = scrollParent.getBoundingClientRect()
    const containerVisible = Math.min(parentRect.bottom, visibleBottom)
    scrollParent.scrollBy({ top: elRect.bottom - containerVisible + margin, behavior: 'smooth' })
  } else {
    // Full-page view — add padding to body so content is reachable, then scroll
    document.body.style.paddingBottom = keyboardState.height + 'px'
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
