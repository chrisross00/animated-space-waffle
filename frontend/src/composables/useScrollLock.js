/**
 * Reference-counted scroll lock for iOS Safari.
 *
 * Uses position:fixed on body to prevent viewport scrolling, combined with
 * touch event interception to prevent overscroll on nested scrollable elements.
 * Based on Vaul's usePositionFixed + usePreventScroll approach.
 *
 * Multiple trays can be open simultaneously — only the first lock takes effect,
 * and scroll is restored only when the last lock is released.
 */

let lockCount = 0
let savedScrollY = 0
let cleanup = null

function isScrollable(el) {
  if (!el || el === document.documentElement || el === document.body) return false
  const style = window.getComputedStyle(el)
  return /(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)
}

function getScrollParent(node) {
  if (!node) return null
  if (isScrollable(node)) node = node.parentElement
  while (node) {
    if (isScrollable(node)) return node
    node = node.parentElement
  }
  return null
}

export function lockScroll() {
  lockCount++
  if (lockCount > 1) return

  savedScrollY = window.scrollY
  const body = document.body
  body.style.position = 'fixed'
  body.style.top = `-${savedScrollY}px`
  body.style.left = '0'
  body.style.right = '0'

  // iOS touch interception: prevent viewport overscroll while allowing
  // nested scrollable elements to scroll within their boundaries.
  let scrollable = null
  let lastY = 0

  function onTouchStart(e) {
    scrollable = getScrollParent(e.target)
    lastY = e.changedTouches[0].pageY
  }

  function onTouchMove(e) {
    if (!scrollable) { e.preventDefault(); return }
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

  cleanup = () => {
    document.removeEventListener('touchstart', onTouchStart, { capture: true })
    document.removeEventListener('touchmove', onTouchMove, { capture: true })
  }
}

export function unlockScroll() {
  if (lockCount <= 0) return
  lockCount--
  if (lockCount > 0) return
  if (cleanup) { cleanup(); cleanup = null }
  const body = document.body
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  window.scrollTo(0, savedScrollY)
}
