import { reactive } from 'vue'

const mql = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 599px)')
  : { matches: false, addEventListener() {} }

export const screen = reactive({
  isMobile: mql.matches,
  isDesktop: !mql.matches,
  width: typeof window !== 'undefined' ? window.innerWidth : 1024,
})

mql.addEventListener('change', (e) => {
  screen.isMobile = e.matches
  screen.isDesktop = !e.matches
})

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    screen.width = window.innerWidth
  })
}

export function useScreen() {
  return screen
}
