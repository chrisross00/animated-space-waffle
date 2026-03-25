import { reactive } from 'vue'

let id = 0
export const toastState = reactive({ items: [] })

function show({ message, type = 'info', timeout = 3000, actions }) {
  const toast = { id: ++id, message, type, timeout, actions }
  toastState.items.push(toast)
  if (timeout > 0) {
    setTimeout(() => dismiss(toast.id), timeout)
  }
  if (toastState.items.length > 3) {
    toastState.items.shift()
  }
}

function dismiss(toastId) {
  const idx = toastState.items.findIndex(t => t.id === toastId)
  if (idx !== -1) toastState.items.splice(idx, 1)
}

export const toast = {
  show,
  dismiss,
  success: (m) => show({ message: m, type: 'positive', timeout: 1500 }),
  error: (m) => show({ message: m, type: 'negative', timeout: 4000 }),
}

export function useToast() { return toast }
