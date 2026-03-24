import { reactive } from 'vue'

export const keyboardState = reactive({
  isOpen: false,
  mode: 'qwerty',
  height: 0,
})

let activeCallbacks = null

export function requestKeyboard({ mode, onKey, onBackspace, onDone, inputEl }) {
  activeCallbacks = { onKey, onBackspace, onDone, inputEl }
  keyboardState.mode = mode
  keyboardState.isOpen = true
}

export function dismissKeyboard() {
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
