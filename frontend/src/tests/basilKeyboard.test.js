import { describe, it, expect, vi, beforeEach } from 'vitest'
import { keyboardState, requestKeyboard, dismissKeyboard, emitKey, emitBackspace, emitDone } from '@/utils/basilKeyboard'

describe('basilKeyboard', () => {
  beforeEach(() => {
    dismissKeyboard()
  })

  it('starts with keyboard closed', () => {
    expect(keyboardState.isOpen).toBe(false)
    expect(keyboardState.mode).toBe('qwerty')
    expect(keyboardState.height).toBe(0)
  })

  it('opens keyboard with requestKeyboard', () => {
    const callbacks = { mode: 'numpad', onKey: vi.fn(), onBackspace: vi.fn(), onDone: vi.fn(), inputEl: null }
    requestKeyboard(callbacks)
    expect(keyboardState.isOpen).toBe(true)
    expect(keyboardState.mode).toBe('numpad')
  })

  it('closes keyboard with dismissKeyboard', () => {
    requestKeyboard({ mode: 'qwerty', onKey: vi.fn(), onBackspace: vi.fn(), onDone: vi.fn(), inputEl: null })
    dismissKeyboard()
    expect(keyboardState.isOpen).toBe(false)
  })

  it('routes emitKey to active input callback', () => {
    const onKey = vi.fn()
    requestKeyboard({ mode: 'qwerty', onKey, onBackspace: vi.fn(), onDone: vi.fn(), inputEl: null })
    emitKey('a')
    expect(onKey).toHaveBeenCalledWith('a')
  })

  it('routes emitBackspace to active input callback', () => {
    const onBackspace = vi.fn()
    requestKeyboard({ mode: 'qwerty', onKey: vi.fn(), onBackspace, onDone: vi.fn(), inputEl: null })
    emitBackspace()
    expect(onBackspace).toHaveBeenCalled()
  })

  it('calls onDone and closes keyboard on emitDone', () => {
    const onDone = vi.fn()
    requestKeyboard({ mode: 'qwerty', onKey: vi.fn(), onBackspace: vi.fn(), onDone, inputEl: null })
    emitDone()
    expect(onDone).toHaveBeenCalled()
    expect(keyboardState.isOpen).toBe(false)
  })

  it('transfers focus when a new input requests the keyboard', () => {
    const onDone1 = vi.fn()
    const onKey2 = vi.fn()
    requestKeyboard({ mode: 'qwerty', onKey: vi.fn(), onBackspace: vi.fn(), onDone: onDone1, inputEl: null })
    requestKeyboard({ mode: 'numpad', onKey: onKey2, onBackspace: vi.fn(), onDone: vi.fn(), inputEl: null })
    expect(keyboardState.mode).toBe('numpad')
    emitKey('5')
    expect(onKey2).toHaveBeenCalledWith('5')
  })

  it('does nothing when emitting with no active input', () => {
    emitKey('a')
    emitBackspace()
    emitDone()
  })
})
