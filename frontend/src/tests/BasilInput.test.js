import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BasilInput from '@/components/BasilInput.vue'
import { keyboardState, dismissKeyboard } from '@/utils/basilKeyboard'

// happy-dom doesn't have ontouchstart, so BasilInput detects as desktop
describe('BasilInput (desktop mode)', () => {
  it('renders a native input element on desktop', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', label: 'Name' } })
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('emits update:modelValue on native input', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', label: 'Name' } })
    await wrapper.find('input').setValue('hello')
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['hello'])
  })

  it('emits submit on Enter key', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 'test' } })
    await wrapper.find('input').trigger('keyup.enter')
    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('displays label', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', label: 'Amount' } })
    expect(wrapper.text()).toContain('Amount')
  })

  it('shows prefix', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '42', label: 'Amount', prefix: '$' } })
    expect(wrapper.text()).toContain('$')
  })

  it('shows hint text', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', hint: 'Enter a value' } })
    expect(wrapper.text()).toContain('Enter a value')
  })

  it('applies dense class when dense prop is true', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', dense: true } })
    expect(wrapper.find('.basil-input--dense').exists()).toBe(true)
  })

  it('disables input when disabled prop is true', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', disabled: true } })
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })
})

describe('BasilInput (mobile mode)', () => {
  beforeEach(() => {
    window.ontouchstart = null
    dismissKeyboard()
  })

  afterEach(() => {
    delete window.ontouchstart
  })

  it('renders a div, not a native input, on mobile', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '' } })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('.basil-input__display').exists()).toBe(true)
  })

  it('calls requestKeyboard on tap', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '' } })
    await wrapper.find('.basil-input').trigger('click')
    expect(keyboardState.isOpen).toBe(true)
    expect(keyboardState.mode).toBe('qwerty')
  })

  it('updates value when onKey callback is called', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 'hel' } })
    await wrapper.find('.basil-input').trigger('click')
    const { emitKey } = await import('@/utils/basilKeyboard')
    emitKey('l')
    expect(wrapper.emitted('update:modelValue').pop()).toEqual(['hell'])
  })

  it('removes last character on backspace', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 'hello' } })
    await wrapper.find('.basil-input').trigger('click')
    const { emitBackspace } = await import('@/utils/basilKeyboard')
    emitBackspace()
    expect(wrapper.emitted('update:modelValue').pop()).toEqual(['hell'])
  })

  it('emits submit and blur on Done', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 'test' } })
    await wrapper.find('.basil-input').trigger('click')
    const { emitDone } = await import('@/utils/basilKeyboard')
    emitDone()
    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('blur')).toBeTruthy()
  })

  it('exposes a focus() method that opens the keyboard', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '' } })
    wrapper.vm.focus()
    expect(keyboardState.isOpen).toBe(true)
  })
})
