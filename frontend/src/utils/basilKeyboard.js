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
