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

describe('BasilInput amount variant', () => {
  beforeEach(() => {
    window.ontouchstart = null
    dismissKeyboard()
  })
  afterEach(() => { delete window.ontouchstart })

  it('opens numpad mode for amount variant', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 0, variant: 'amount' } })
    await wrapper.find('.basil-input').trigger('click')
    expect(keyboardState.mode).toBe('numpad')
  })

  it('emits Number type for amount variant', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 0, variant: 'amount' } })
    await wrapper.find('.basil-input').trigger('click')
    const { emitKey } = await import('@/utils/basilKeyboard')
    emitKey('4')
    emitKey('7')
    const emitted = wrapper.emitted('update:modelValue').pop()[0]
    expect(typeof emitted).toBe('number')
    expect(emitted).toBe(47)
  })

  it('allows max 2 decimal places', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 0, variant: 'amount' } })
    await wrapper.find('.basil-input').trigger('click')
    const { emitKey } = await import('@/utils/basilKeyboard')
    emitKey('1')
    emitKey('.')
    emitKey('2')
    emitKey('3')
    emitKey('4') // should be ignored
    const emitted = wrapper.emitted('update:modelValue').pop()[0]
    expect(emitted).toBe(1.23)
  })

  it('rejects second decimal point', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 0, variant: 'amount' } })
    await wrapper.find('.basil-input').trigger('click')
    const { emitKey } = await import('@/utils/basilKeyboard')
    emitKey('1')
    emitKey('.')
    emitKey('5')
    emitKey('.') // should be ignored
    emitKey('3')
    const emitted = wrapper.emitted('update:modelValue').pop()[0]
    expect(emitted).toBe(1.53)
  })

  it('rejects values exceeding 999999.99', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 99999, variant: 'amount' } })
    await wrapper.find('.basil-input').trigger('click')
    const { emitKey } = await import('@/utils/basilKeyboard')
    emitKey('9')
    emitKey('9') // would make 9999999, should be ignored
    const last = wrapper.emitted('update:modelValue').pop()[0]
    expect(last).toBeLessThanOrEqual(999999.99)
  })

  it('shows $ prefix by default for amount variant', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 42, variant: 'amount' } })
    expect(wrapper.text()).toContain('$')
  })
})

describe('BasilInput search variant', () => {
  it('renders a clear button when value is non-empty', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 'test', variant: 'search' } })
    expect(wrapper.find('.basil-input__clear').exists()).toBe(true)
  })

  it('hides clear button when value is empty', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', variant: 'search' } })
    expect(wrapper.find('.basil-input__clear').exists()).toBe(false)
  })

  it('emits empty string when clear is clicked', async () => {
    const wrapper = mount(BasilInput, { props: { modelValue: 'test', variant: 'search' } })
    await wrapper.find('.basil-input__clear').trigger('click')
    expect(wrapper.emitted('update:modelValue').pop()).toEqual([''])
  })

  it('renders a search icon', () => {
    const wrapper = mount(BasilInput, { props: { modelValue: '', variant: 'search' } })
    expect(wrapper.find('.basil-input__search-icon').exists()).toBe(true)
  })
})
