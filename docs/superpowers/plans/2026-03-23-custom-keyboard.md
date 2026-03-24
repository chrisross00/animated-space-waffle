# Custom Keyboard System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native iOS keyboard with a custom on-screen keyboard on mobile, giving the app full viewport control and eliminating Safari keyboard quirks.

**Architecture:** App-level singleton keyboard (`BasilKeyboard.vue`) mounted in `App.vue`, communicating with `BasilInput.vue` instances through a reactive singleton module (`basilKeyboard.js`). On desktop, `BasilInput` renders a native `<input>` — no custom keyboard. On mobile, it renders a non-focusable `div` and routes all input through the custom keyboard.

**Tech Stack:** Vue 3 (Options API), Quasar 2 (for layout/platform detection only), CSS custom properties (Basil design tokens), Vitest + Vue Test Utils + happy-dom

**Spec:** `docs/superpowers/specs/2026-03-23-custom-keyboard-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/utils/basilKeyboard.js` | Create | Reactive singleton — keyboard state, request/dismiss/emit functions |
| `frontend/src/components/BasilKeyboard.vue` | Create | Keyboard UI — QWERTY + numpad layouts, slide animation, key rendering |
| `frontend/src/components/BasilInput.vue` | Create | Unified input component — mobile div / desktop native input, variant system |
| `frontend/src/styles/basil-keyboard.css` | Create | Keyboard + input styling using Basil tokens |
| `frontend/src/tests/basilKeyboard.test.js` | Create | Unit tests for the reactive singleton module |
| `frontend/src/tests/BasilInput.test.js` | Create | Component tests for BasilInput variants |
| `frontend/src/App.vue` | Modify | Mount BasilKeyboard, replace keyboardOpen logic, add router dismiss guard |
| `frontend/src/main.js` | Modify | Add router afterEach guard to dismiss keyboard on navigation |
| `frontend/src/views/BudgetPlannerView.vue` | Modify | Pilot migration — replace 4 q-inputs with BasilInput |
| `frontend/src/components/DialogComponent.vue` | Modify | Replace 7 q-inputs with BasilInput |
| `frontend/src/components/RuleEditorDialog.vue` | Modify | Replace 6 q-inputs with BasilInput |
| `frontend/src/views/BudgetView.vue` | Modify | Replace 5 q-inputs with BasilInput |
| `frontend/src/views/MerchantBrowser.vue` | Modify | Replace 2 q-inputs with BasilInput |
| `frontend/src/views/AccountsView.vue` | Modify | Replace 5 q-inputs with BasilInput |
| `frontend/src/components/TagPicker.vue` | Modify | Replace 1 q-input with BasilInput |
| `frontend/src/styles/quasar-overrides.css` | Modify | Remove dead q-field overrides after migration |
| `DESIGN.md` | Modify | Remove iOS keyboard rule, add BasilInput usage rules |
| `CLAUDE.md` | Modify | Add BasilInput to shared utilities table |

---

## Task 1: Reactive Singleton Module (`basilKeyboard.js`)

**Files:**
- Create: `frontend/src/utils/basilKeyboard.js`
- Test: `frontend/src/tests/basilKeyboard.test.js`

This is the communication backbone. All keyboard ↔ input coordination flows through this module. It must work with Options API components (no composable pattern).

- [ ] **Step 1: Write failing tests for the singleton module**

Create `frontend/src/tests/basilKeyboard.test.js`:

```js
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
    // Should not throw
    emitKey('a')
    emitBackspace()
    emitDone()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/tests/basilKeyboard.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the singleton module**

Create `frontend/src/utils/basilKeyboard.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/tests/basilKeyboard.test.js`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/basilKeyboard.js frontend/src/tests/basilKeyboard.test.js
git commit -m "feat: add basilKeyboard reactive singleton module with tests"
```

---

## Task 2: Keyboard Styles (`basil-keyboard.css`)

**Files:**
- Create: `frontend/src/styles/basil-keyboard.css`

All styling for both `BasilKeyboard` and `BasilInput` lives here. Uses Basil design tokens exclusively.

- [ ] **Step 1: Create the stylesheet**

Create `frontend/src/styles/basil-keyboard.css`. Reference the design spec for token mapping. Key requirements:
- `.basil-keyboard` — fixed bottom, z-index 7000, slide-up transform, surface-dialog background
- `.basil-keyboard__row` — flex row with gap
- `.basil-keyboard__key` — min 44px height, surface background, shadow-sm, radius-sm, active scale(0.95)
- `.basil-keyboard__key--modifier` — border background (shift, backspace)
- `.basil-keyboard__key--action` — accent background, white text (Done)
- `.basil-keyboard__key--space` — flex-grow for spacebar
- `.basil-keyboard--hidden` — transform translateY(100%)
- `.basil-input` — outlined input appearance matching existing q-field styling
- `.basil-input__display` — the value display area with blinking cursor
- `.basil-input__label` — floating label that shrinks when value is present
- `.basil-input--focused` — accent border color
- `.basil-input--dense` — compact variant
- `.basil-input__clear` — clear button for search variant
- Safe area: `padding-bottom: env(safe-area-inset-bottom)` on keyboard
- Dark mode: all automatic via token system, no explicit overrides needed

Consult `frontend/src/styles/quasar-overrides.css:125-142` and `:315-337` for the exact styling the inputs must match (border color, background, label color, dark mode overrides).

Consult `frontend/src/styles/tokens.css` for available tokens. Key tokens:
- Surfaces: `--basil-surface`, `--basil-surface-dialog`, `--basil-surface-alt`
- Text: `--basil-text`, `--basil-text-secondary`, `--basil-text-muted`
- Border: `--basil-border`
- Radius: `--basil-radius-sm` (6px)
- Shadow: `--basil-shadow-sm`
- Motion: `--basil-ease` (cubic-bezier), `--basil-t-base` (220ms)
- Spacing: `--basil-space-1` (4px) through `--basil-space-4` (16px)
- Accent: `--basil-accent`

- [ ] **Step 2: Import the stylesheet**

Check how existing stylesheets are imported: `grep -n "import.*\.css" frontend/src/main.js frontend/src/App.vue`. Follow the same pattern. If CSS is imported in `main.js` (e.g., `import './styles/tokens.css'`), add `import './styles/basil-keyboard.css'` there. If CSS is imported in `App.vue`'s `<style>` section via `@import`, add it there instead.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/basil-keyboard.css
git commit -m "feat: add basil-keyboard.css with keyboard and input styles"
```

---

## Task 3: BasilKeyboard Component

**Files:**
- Create: `frontend/src/components/BasilKeyboard.vue`
- Modify: `frontend/src/App.vue`

The keyboard singleton renders QWERTY and numpad layouts, handles key taps, and communicates via the singleton module.

- [ ] **Step 1: Build the BasilKeyboard component**

Create `frontend/src/components/BasilKeyboard.vue`. This is an Options API component. Key implementation details:

**Template structure:**
- Root div with class `basil-keyboard` and conditional `basil-keyboard--hidden`
- Conditionally render QWERTY or numpad based on `keyboardState.mode`
- QWERTY: 4 rows — `QWERTYUIOP`, `ASDFGHJKL`, `shift + ZXCVBNM + backspace`, `123 + space + Done`
- Numpad: 4 rows — `123`, `456`, `789`, `. + 0 + backspace`, `Done`
- Each key is a `div` with `@pointerdown.prevent` (prevents native focus) and `@click` (fires the key action)
- Shift toggles between uppercase/lowercase letters
- The `123` key on QWERTY is a placeholder (no-op for now, future symbol layer)

**Script:**
- Import `keyboardState`, `emitKey`, `emitBackspace`, `emitDone` from `@/utils/basilKeyboard`
- `data()`: `shifted: false` (shift state for QWERTY)
- `computed`: read `keyboardState.isOpen` and `keyboardState.mode`
- `methods`: `onKey(char)` — calls `emitKey(shifted ? char : char.toLowerCase())`, `onBackspace()` — calls `emitBackspace()`, `onDone()` — calls `emitDone()`
- `mounted()`: Set `keyboardState.height` to the component's `offsetHeight` after first render. Update on window resize.
- `watch`: when `keyboardState.isOpen` changes, update `--basil-keyboard-height` CSS variable on `document.documentElement`

**Haptic feedback:** Wrap `navigator.vibrate?.(10)` in a try-catch in the key tap handler. No-ops on iOS.

**Dismissal listener:** In `mounted`, add a `pointerdown` listener on `document` that checks if the event target is inside `.basil-input` or `.basil-keyboard`. If not, call `dismissKeyboard()`. Remove in `beforeUnmount`.

- [ ] **Step 2: Mount in App.vue**

In `frontend/src/App.vue`:
- Import `BasilKeyboard` and add to `components`
- Add `<BasilKeyboard />` after the `</q-layout>` closing tag (so it's a sibling, not inside the Quasar layout system)
- Import `keyboardState` from `@/utils/basilKeyboard`
- In `computed`, add `isKeyboardOpen() { return keyboardState.isOpen }`
- Replace `v-show="!keyboardOpen"` on the footer (line ~129) with `v-show="!isKeyboardOpen"`
- Remove the `focusin`/`focusout` event listeners from `mounted` (lines ~461-468) and the `onFocusIn`/`onFocusOut` methods
- Remove the `keyboardOpen: false` data field (line ~409)

- [ ] **Step 3: Add router dismiss guard**

In `frontend/src/main.js`, after the router guard block (after line ~107):
- Import `dismissKeyboard` from `@/utils/basilKeyboard`
- Add: `router.afterEach(() => { dismissKeyboard() })`

Use `afterEach` (not `beforeEach`) so the keyboard dismisses after navigation completes, not before.

- [ ] **Step 4: Manual test**

Run the dev server (`cd frontend && npm run dev`), open on mobile or Chrome DevTools mobile emulation. Verify:
- Keyboard does not appear on page load
- No console errors
- Bottom nav is visible
- Existing q-inputs still work with native keyboard (we haven't migrated anything yet)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BasilKeyboard.vue frontend/src/App.vue frontend/src/main.js
git commit -m "feat: add BasilKeyboard singleton component, mount in App.vue"
```

---

## Task 4a: BasilInput Core — Text Variant + Desktop/Mobile Split

**Files:**
- Create: `frontend/src/components/BasilInput.vue`
- Test: `frontend/src/tests/BasilInput.test.js`

Core input component with the text variant. Mobile renders a div (no native input); desktop renders a native `<input>`. Other variants are added in subsequent tasks.

- [ ] **Step 1: Write failing tests for BasilInput**

Create `frontend/src/tests/BasilInput.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    // Simulate mobile by adding ontouchstart to window
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
    // Simulate keyboard sending a key via the singleton
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/tests/BasilInput.test.js`
Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Implement BasilInput core**

Create `frontend/src/components/BasilInput.vue`. Options API component. Key details:

**Props:**

| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `modelValue` | `[String, Number]` | `''` | v-model binding |
| `variant` | `String` | `'text'` | `text`, `amount`, `search`, `note` |
| `label` | `String` | `''` | Floating label |
| `prefix` | `String` | `''` | Display prefix (e.g. `$`) |
| `hint` | `String` | `''` | Help text below the input |
| `placeholder` | `String` | `''` | Placeholder when empty |
| `dense` | `Boolean` | `false` | Compact mode |
| `disabled` | `Boolean` | `false` | Disables input |
| `action` | `String` | `'done'` | Action key label (extensible) |
| `debounce` | `Number` | `0` | Debounce delay in ms for emitting updates (search variant defaults to 300) |

**Emits:** `update:modelValue`, `focus`, `blur`, `submit`

The `submit` event fires when: Enter key is pressed (desktop) or Done key is tapped (mobile). This replaces `@keyup.enter` handlers in consuming components — they should use `@submit` instead.

**Data:** `isFocused: false`, `isMobile: false`, `debounceTimer: null`

**Mounted:** Detect mobile via `'ontouchstart' in window`. Store in `this.isMobile`.

**Template (mobile — `isMobile` is true):**
- `.basil-input` wrapper div with `@click="onTap"`, conditional classes `--focused`, `--dense`, `--disabled`
- `.basil-input__label` — floating label (add `--float` class when value is non-empty or focused)
- `.basil-input__prefix` — renders prefix when provided
- `.basil-input__display` — shows `modelValue` text with blinking cursor `<span>` when focused
- `.basil-input__hint` — renders hint text below input when provided
- No native `<input>` element — nothing for iOS to attach a keyboard to

**Template (desktop — `!isMobile`):**
- `.basil-input` wrapper div with conditional classes
- `.basil-input__label`
- `.basil-input__prefix`
- Native `<input>` with `:value="modelValue"`, `@input="onDesktopInput"`, `@focus`, `@blur`, `@keyup.enter="$emit('submit')"`
- `.basil-input__hint`

**Methods:**
- `onTap()` — if disabled, return. Set `isFocused = true`. Call `requestKeyboard` with mode based on variant (`amount` → `numpad`, others → `qwerty`), `onKey` / `onBackspace` / `onDone` callbacks, `inputEl: this.$el`. Emit `focus`.
- `onKey(char)` — append char to string value of modelValue. Call `emitValue()`.
- `onBackspace()` — remove last character from string value. Call `emitValue()`.
- `onDone()` — set `isFocused = false`. Emit `submit`, then `blur`.
- `onDesktopInput(e)` — call `emitValue()` with `e.target.value`.
- `emitValue(val)` — if `debounce > 0` (or variant is `search` and debounce not explicitly set → default 300ms), debounce the emit. Otherwise emit immediately. Emit `update:modelValue` with the value.
- `focus()` — **public method** exposed for `this.$refs.x.focus()`. On mobile: calls `onTap()`. On desktop: calls `this.$el.querySelector('input')?.focus()`.

**Amount variant emits `Number` type:** The `amount` variant internally tracks a string for display (to handle intermediate states like `"47."`) but always emits a parsed `Number` via `parseFloat()`. If the string is empty or unparseable, emits `0` or `null`. This preserves backward compatibility with code that expects numeric values from amount inputs (arithmetic, comparisons, API payloads).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/tests/BasilInput.test.js`
Expected: All 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BasilInput.vue frontend/src/tests/BasilInput.test.js
git commit -m "feat: add BasilInput core component with text variant, mobile/desktop modes, tests"
```

---

## Task 4b: BasilInput — Amount Variant

**Files:**
- Modify: `frontend/src/components/BasilInput.vue`
- Test: `frontend/src/tests/BasilInput.test.js` (add tests)

Add amount-specific behavior to BasilInput: numpad mode, decimal validation, `$` prefix, `Number` emit type.

- [ ] **Step 1: Add amount variant tests**

Append to `frontend/src/tests/BasilInput.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd frontend && npx vitest run src/tests/BasilInput.test.js`
Expected: New amount tests FAIL (amount logic not yet implemented).

- [ ] **Step 3: Implement amount variant logic**

In `BasilInput.vue`, add to `onKey(char)`:
- If variant is `amount`: maintain an internal `displayString` (data field) that tracks the raw typed characters (e.g. `"47."`, `"47.0"`, `"47.00"`)
- If char is `.` and `displayString` already contains `.`, return (ignore)
- If `displayString` has a `.` and already has 2 chars after it, return (ignore)
- Append char to `displayString`
- Parse with `parseFloat(displayString)` — if result > 999999.99, revert and return
- Emit `update:modelValue` with the parsed `Number`

In `onBackspace()` for amount: remove last char from `displayString`, re-parse and emit.

In the `computed` or template: for amount variant, auto-set `prefix` to `'$'` if not explicitly provided.

Sync `displayString` from `modelValue` prop on mount and when prop changes externally (watch `modelValue`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/tests/BasilInput.test.js`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BasilInput.vue frontend/src/tests/BasilInput.test.js
git commit -m "feat: add amount variant to BasilInput — numpad, decimal validation, Number emit"
```

---

## Task 4c: BasilInput — Search Variant + Clear Button

**Files:**
- Modify: `frontend/src/components/BasilInput.vue`
- Test: `frontend/src/tests/BasilInput.test.js` (add tests)

Add search-specific behavior: clear button, built-in search icon, 300ms default debounce.

- [ ] **Step 1: Add search variant tests**

Append to `frontend/src/tests/BasilInput.test.js`:

```js
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
```

- [ ] **Step 2: Implement search variant**

In `BasilInput.vue`:
- When variant is `search`, render a search icon (SVG magnifying glass) in `.basil-input__search-icon` before the display/input area
- When variant is `search` and value is non-empty, render a clear button (`.basil-input__clear`) with an `×` or clear icon. `@click.stop="onClear"` (`.stop` prevents triggering `onTap`)
- `onClear()`: emit `update:modelValue` with `''`
- Default debounce for search variant: if `debounce` prop is not explicitly set, use `300`ms

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest run src/tests/BasilInput.test.js`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BasilInput.vue frontend/src/tests/BasilInput.test.js
git commit -m "feat: add search variant to BasilInput — clear button, search icon, debounce"
```

---

## Task 4d: BasilInput — Scroll-into-View

**Files:**
- Modify: `frontend/src/components/BasilInput.vue`

Add scroll-into-view logic that runs when the keyboard opens on mobile.

- [ ] **Step 1: Implement scroll-into-view**

In `BasilInput.vue`, in the `onTap()` method, after calling `requestKeyboard`:

```js
this.$nextTick(() => {
  setTimeout(() => {
    const el = this.$el
    const keyboardHeight = keyboardState.height
    if (!keyboardHeight) return
    const rect = el.getBoundingClientRect()
    const visibleBottom = window.innerHeight - keyboardHeight
    if (rect.bottom > visibleBottom) {
      // Find nearest scrollable ancestor
      let scrollParent = el.parentElement
      while (scrollParent) {
        const style = getComputedStyle(scrollParent)
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') break
        if (scrollParent.classList.contains('basil-tray__scroll') ||
            scrollParent.classList.contains('overflow-auto') ||
            scrollParent.classList.contains('basil-re__scroll')) break
        scrollParent = scrollParent.parentElement
      }
      if (scrollParent) {
        // Scroll within the container (tray or page section)
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } else {
        // Full-page fallback — add padding-bottom to body, then scroll
        document.body.style.paddingBottom = keyboardHeight + 'px'
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, 280) // Wait for keyboard slide animation (250ms + buffer)
})
```

**Inside BasilTray:** The tray's internal scroll container (`.basil-tray__scroll`, `.basil-re__scroll`, or `.overflow-auto`) is the scroll target. `scrollIntoView` on the element will scroll within the nearest overflow container automatically.

**Full-page views:** Add temporary `padding-bottom` on `document.body` equal to keyboard height so content at the bottom is reachable. Remove this padding in `dismissKeyboard` — add a cleanup listener in `basilKeyboard.js` that resets `document.body.style.paddingBottom` on dismiss.

- [ ] **Step 2: Add padding cleanup to basilKeyboard.js**

In `frontend/src/utils/basilKeyboard.js`, in `dismissKeyboard()`:
```js
document.body.style.paddingBottom = ''
```

- [ ] **Step 3: Manual test**

Test scroll-into-view in both a BasilTray dialog (e.g., DialogComponent) and a full-page view (e.g., BudgetPlannerView). Verify:
- Input near bottom of tray scrolls up when keyboard opens
- Input already visible does not scroll
- Body padding is cleaned up when keyboard dismisses

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BasilInput.vue frontend/src/utils/basilKeyboard.js
git commit -m "feat: add scroll-into-view when keyboard opens on mobile"
```

---

## Task 5: Thin Wrappers (Convenience Components)

**Files:**
- Create: `frontend/src/components/BasilAmount.js`
- Create: `frontend/src/components/BasilSearch.js`
- Create: `frontend/src/components/BasilText.js`
- Create: `frontend/src/components/BasilNote.js`

- [ ] **Step 1: Create the four thin wrappers**

Each uses `extends` (the idiomatic Options API way to create derived components) rather than object spread, which is fragile with compiled SFCs.

`frontend/src/components/BasilAmount.js`:
```js
import BasilInput from './BasilInput.vue'
export default {
  extends: BasilInput,
  name: 'BasilAmount',
  props: { variant: { type: String, default: 'amount' } }
}
```

`frontend/src/components/BasilSearch.js`:
```js
import BasilInput from './BasilInput.vue'
export default {
  extends: BasilInput,
  name: 'BasilSearch',
  props: { variant: { type: String, default: 'search' } }
}
```

`frontend/src/components/BasilText.js`:
```js
import BasilInput from './BasilInput.vue'
export default {
  extends: BasilInput,
  name: 'BasilText',
  props: { variant: { type: String, default: 'text' } }
}
```

`frontend/src/components/BasilNote.js`:
```js
import BasilInput from './BasilInput.vue'
export default {
  extends: BasilInput,
  name: 'BasilNote',
  props: { variant: { type: String, default: 'note' } }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Basil{Amount,Search,Text,Note}.js
git commit -m "feat: add thin wrapper convenience components for BasilInput variants"
```

---

## Task 6: Pilot Migration — BudgetPlannerView

**Files:**
- Modify: `frontend/src/views/BudgetPlannerView.vue`

This view has 4 `q-input` instances — 2 amount inputs (guided income, guided limits) and 2 inline form inputs (add category name + limit). Good mix of variants.

- [ ] **Step 1: Import BasilInput components**

Add imports at the top of the `<script>` section:
```js
import BasilAmount from '@/components/BasilAmount'
import BasilText from '@/components/BasilText'
```

Register in `components: { ... }`.

- [ ] **Step 2: Replace guided income input (line ~52)**

Replace:
```vue
<q-input
  :model-value="formatWithCommas(guidedIncome)"
  @update:model-value="guidedIncome = parseAmount($event)"
  outlined inputmode="numeric" prefix="$"
  label="Monthly income" :hint="incomeHint"
  @keypress="$event.key.match(/[^0-9]/) && $event.preventDefault()"
/>
```

With:
```vue
<BasilAmount
  :model-value="guidedIncome"
  @update:model-value="guidedIncome = $event"
  label="Monthly income" :hint="incomeHint"
/>
```

Note: The `formatWithCommas` / `parseAmount` / `@keypress` filtering logic is no longer needed — the `amount` variant handles decimal formatting and digit-only input internally.

- [ ] **Step 3: Replace guided category limit inputs (line ~72)**

Replace:
```vue
<q-input
  :model-value="formatWithCommas(guidedLimits[cat.category])"
  @update:model-value="guidedLimits[cat.category] = parseAmount($event)"
  outlined inputmode="numeric" prefix="$"
  @keypress="$event.key.match(/[^0-9]/) && $event.preventDefault()"
  :label="cat.category" :hint="cat.spendingHint"
/>
```

With:
```vue
<BasilAmount
  :model-value="guidedLimits[cat.category]"
  @update:model-value="guidedLimits[cat.category] = $event"
  :label="cat.category" :hint="cat.spendingHint"
/>
```

- [ ] **Step 4: Replace add category inputs (lines ~200-217)**

Replace the two inline inputs:
```vue
<q-input v-model="addName" placeholder="Category name" dense outlined ... />
<q-input v-model.number="addLimit" type="number" placeholder="Monthly limit" dense outlined ... />
```

With:
```vue
<BasilText v-model="addName" placeholder="Category name" dense @submit="confirmAdd(sectionType)" />
<BasilAmount v-model="addLimit" placeholder="Monthly limit" dense @submit="confirmAdd(sectionType)" />
```

The `@keyup.enter` handlers are replaced by `@submit` — BasilInput emits `submit` when Enter is pressed (desktop) or Done is tapped (mobile). The `@keyup.esc` handler for `cancelAdd` can be removed (the keyboard doesn't have an Escape key, and on desktop users can just tap away).

**CSS class compatibility note:** Some migrated inputs pass CSS classes like `basil-planner-add-name`. After migration, verify these classes still style correctly — any CSS rules that targeted Quasar internals (e.g., `.basil-planner-add-name .q-field__native`) will need updating to target BasilInput's DOM structure instead.

- [ ] **Step 5: Manual test on mobile**

Run the dev server. Open BudgetPlannerView on mobile (or Chrome DevTools mobile emulation):
- Tap the income field → custom numpad should slide up
- Type digits → value updates in the field
- Tap Done → keyboard dismisses
- Tap a category limit field → numpad opens
- Tap the add category name field → QWERTY keyboard opens
- Tap outside → keyboard dismisses
- Bottom nav hides when keyboard is open, reappears when closed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/BudgetPlannerView.vue
git commit -m "feat: migrate BudgetPlannerView to BasilInput (pilot)"
```

---

## Task 7: Migrate DialogComponent

**Files:**
- Modify: `frontend/src/components/DialogComponent.vue`

7 `q-input` instances: transaction date (skip — stays native), transaction note, category name (x2), monthly limit (x2), split amount. The `q-select` instances stay as-is (not in scope).

- [ ] **Step 1: Import components**

Add imports and register `BasilAmount`, `BasilText`, `BasilNote`.

- [ ] **Step 2: Replace transaction note input (line ~69)**

```vue
<!-- Before -->
<q-input type="text" outlined v-model="dialogBody.note" label="Note" @change="isFormSubmittable()" />

<!-- After -->
<BasilNote v-model="dialogBody.note" label="Note" @blur="isFormSubmittable()" />
```

Note: `@change` on native input fires on blur. With BasilInput, use `@blur` for the same timing.

- [ ] **Step 3: Replace edit category inputs (lines ~186-200)**

```vue
<!-- Category name -->
<BasilText v-model="dialogBody.categoryName" label="Category Name" @blur="isFormSubmittable()" />

<!-- Monthly limit -->
<BasilAmount v-model="dialogBody.monthly_limit" label="Monthly Limit" @blur="isFormSubmittable()" />
```

Remove the `:rules` prop — BasilInput doesn't implement Quasar validation. The submit button is already gated by `isFormSubmittable()`.

- [ ] **Step 4: Replace add category inputs (lines ~304-318)**

Same pattern as edit category — `BasilText` for name, `BasilAmount` for limit.

- [ ] **Step 5: Replace split amount input (line ~113)**

```vue
<!-- Before -->
<q-input outlined dense type="number" :model-value="row.amount"
  @update:model-value="updateSplitAmount(i, $event)" prefix="$" class="basil-split__amount" step="0.01" min="0.01" />

<!-- After -->
<BasilAmount :model-value="row.amount" @update:model-value="updateSplitAmount(i, $event)" dense class="basil-split__amount" />
```

- [ ] **Step 6: Leave date input and q-selects as-is**

The `<q-input type="date">` (line ~55) stays native — date picker replacement is out of scope. All `q-select` instances stay unchanged.

- [ ] **Step 7: Manual test**

Open any transaction edit dialog on mobile. Test:
- Note field opens QWERTY
- Split amount opens numpad
- Category name + limit open correctly
- q-selects still work
- Date picker still works
- Keyboard dismisses on "Done" and on tapping outside

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/DialogComponent.vue
git commit -m "feat: migrate DialogComponent to BasilInput"
```

---

## Task 8: Migrate RuleEditorDialog

**Files:**
- Modify: `frontend/src/components/RuleEditorDialog.vue`

6 `q-input` instances: rule label, transaction name value, amount value, amount min, amount max, note. The `q-select` instances stay as-is.

- [ ] **Step 1: Import components**

Add imports and register `BasilAmount`, `BasilText`, `BasilNote`.

- [ ] **Step 2: Replace rule label (line ~28)**

```vue
<BasilText v-model="form.label" dense placeholder="e.g. Venmo food" class="basil-re__condition-input" @update:model-value="onLabelInput" />
```

- [ ] **Step 3: Replace transaction name value (line ~80)**

```vue
<BasilText v-model="form.name.value" dense placeholder="e.g. Venmo" class="basil-re__condition-input" />
```

- [ ] **Step 4: Replace amount inputs (lines ~105-128)**

Single amount:
```vue
<BasilAmount v-if="['eq', 'gt', 'lt'].includes(form.amount.op)"
  v-model="form.amount.value" dense placeholder="0.00" class="basil-re__amount-val" />
```

Range amounts:
```vue
<BasilAmount v-model="form.amount.min" dense placeholder="min" class="basil-re__amount-val" />
<BasilAmount v-model="form.amount.max" dense placeholder="max" class="basil-re__amount-val" />
```

- [ ] **Step 5: Replace note input (line ~171)**

```vue
<BasilNote v-model="form.note" dense placeholder="e.g. auto-categorized by rule" class="basil-re__condition-input" />
```

- [ ] **Step 6: Manual test**

Open the rule editor dialog. Test each field type, ensure keyboard mode switches correctly between text and numpad as you tap different fields.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/RuleEditorDialog.vue
git commit -m "feat: migrate RuleEditorDialog to BasilInput"
```

---

## Task 9: Migrate BudgetView

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`

5 `q-input` instances: transaction search (line ~475), amount min filter (line ~499), amount max filter (line ~508), triage split amount (line ~836), triage note (line ~877).

- [ ] **Step 1: Import components**

Add imports and register `BasilSearch`, `BasilAmount`, `BasilNote`.

- [ ] **Step 2: Replace transaction search (line ~475)**

```vue
<BasilSearch v-model="tableSearch" dense placeholder="Search by name or merchant" class="col" />
```

The search variant includes a clear button and debounced emit. The `<template v-slot:prepend>` search icon should be handled by the search variant internally — or kept as a prop if the component supports slots. Check if a slot is needed or if the search variant can render its own icon.

- [ ] **Step 3: Replace amount filter inputs (lines ~499-515)**

```vue
<BasilAmount v-model="amountMin" dense placeholder="Min $" style="width: 90px" class="gt-xs" />
<BasilAmount v-model="amountMax" dense placeholder="Max $" style="width: 90px" class="gt-xs" />
```

- [ ] **Step 4: Replace triage split amount (line ~836)**

```vue
<BasilAmount :model-value="row.amount" @update:model-value="triageUpdateSplitAmount(i, $event)" dense class="basil-split__amount" />
```

- [ ] **Step 5: Replace triage note (line ~877)**

```vue
<BasilNote v-model="triageNote" label="Note" />
```

- [ ] **Step 6: Manual test**

Test the Show All table search, amount filters, and triage flow on mobile.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/BudgetView.vue
git commit -m "feat: migrate BudgetView to BasilInput"
```

---

## Task 10: Migrate MerchantBrowser

**Files:**
- Modify: `frontend/src/views/MerchantBrowser.vue`

2 `q-input` instances: desktop search (line ~33) and mobile search (line ~94). Both are search fields.

- [ ] **Step 1: Import and register BasilSearch**

- [ ] **Step 2: Replace both search inputs**

Desktop (line ~33):
```vue
<BasilSearch dense v-model="filter" placeholder="Search merchants" />
```

Mobile (line ~94):
```vue
<BasilSearch dense v-model="filter" placeholder="Search" />
```

Note: The existing inputs use `debounce="300"` which is a Quasar-specific prop. BasilInput's search variant should handle debouncing internally. Verify the search still works with the component's built-in debounce.

- [ ] **Step 3: Manual test**

Test merchant search on both mobile and desktop.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/MerchantBrowser.vue
git commit -m "feat: migrate MerchantBrowser to BasilInput"
```

---

## Task 11: Migrate AccountsView

**Files:**
- Modify: `frontend/src/views/AccountsView.vue`

5 `q-input` instances: institution name (line ~313), account name (line ~322), balance (line ~334), edit account name (line ~366), edit balance (line ~370).

- [ ] **Step 1: Import and register BasilText, BasilAmount**

- [ ] **Step 2: Replace add manual account inputs (lines ~313-337)**

```vue
<BasilText v-if="manualIsNewInstitution" v-model="manualInstitution" label="Institution name" dense placeholder="e.g. Fidelity, My Credit Union" />
<BasilText v-model="manualAccountName" label="Account name" dense placeholder="e.g. Brokerage, Checking" />
<BasilAmount v-model="manualBalance" label="Current balance" dense />
```

The `q-select` for account type stays as-is.

- [ ] **Step 3: Replace edit manual account inputs (lines ~366-373)**

```vue
<BasilText v-model="editAccountName" label="Account name" dense />
<BasilAmount v-model="editBalance" label="Current balance" dense />
```

- [ ] **Step 4: Manual test**

Test the add and edit manual account flows on mobile.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/AccountsView.vue
git commit -m "feat: migrate AccountsView to BasilInput"
```

---

## Task 12: Migrate TagPicker

**Files:**
- Modify: `frontend/src/components/TagPicker.vue`

1 `q-input` instance: new tag name (line ~31).

- [ ] **Step 1: Import and register BasilText**

- [ ] **Step 2: Replace the input**

```vue
<!-- Before -->
<q-input ref="newTagInput" v-model="newTagName" dense outlined placeholder="Tag name" style="flex: 1" @keyup.enter="addNewTag" />

<!-- After -->
<BasilText ref="newTagInput" v-model="newTagName" dense placeholder="Tag name" style="flex: 1" @submit="addNewTag" />
```

The `@keyup.enter` handler is replaced by `@submit` — fires on Enter (desktop) or Done (mobile).

The `this.$refs.newTagInput?.focus()` call in `openNewTagInput` (line ~73) works as-is — `BasilInput` exposes a public `focus()` method (added in Task 4a) that opens the custom keyboard on mobile or focuses the native input on desktop.

- [ ] **Step 3: Manual test**

Test tag creation flow. Verify the input opens the keyboard, typing works, and confirming creates the tag.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TagPicker.vue
git commit -m "feat: migrate TagPicker to BasilInput"
```

---

## Task 13: Cleanup — Remove Dead Code and Update Docs

**Files:**
- Modify: `frontend/src/styles/quasar-overrides.css`
- Modify: `DESIGN.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Audit q-input references**

Run: `cd frontend && grep -rn 'q-input' src/ --include='*.vue' --include='*.js' | grep -v node_modules`

Verify the only remaining `q-input` is the date input in DialogComponent.vue (line ~55). If any others remain, migrate them.

- [ ] **Step 2: Clean up quasar-overrides.css**

In `frontend/src/styles/quasar-overrides.css`, the `q-field` overrides (lines ~125-142 and dark mode ~315-337) were used to style `q-input`. With all `q-input` instances removed except the date field:
- Keep the q-field overrides — they also apply to `q-select` which is still in use
- Add a comment noting these are primarily for `q-select` now

- [ ] **Step 3: Update DESIGN.md**

Remove the "iOS keyboard rule" section (lines ~277-288).

Add a new section after the component patterns:

```markdown
### Custom keyboard & BasilInput

On mobile, the app uses a custom on-screen keyboard instead of the native iOS/Android
keyboard. This gives the app full control over viewport layout and eliminates Safari
keyboard quirks (jitter, scroll-into-view fighting, unpredictable height).

**Rules:**
- **Never use `q-input` for new inputs.** Use `BasilInput` or a variant wrapper.
- **Variants:** `amount` (numpad, $ prefix, decimal handling), `search` (QWERTY, clear button),
  `text` (QWERTY, short strings), `note` (QWERTY, longer text).
- **Thin wrappers:** `<BasilAmount>`, `<BasilSearch>`, `<BasilText>`, `<BasilNote>`.
- **Desktop:** `BasilInput` renders a native `<input>` — no custom keyboard, full native behavior.
- **Mobile:** `BasilInput` renders a non-focusable div. Input comes through `BasilKeyboard`.
- **The `BasilKeyboard` singleton lives in `App.vue`.** Do not mount it elsewhere.
- **Keyboard state** is managed by `frontend/src/utils/basilKeyboard.js` (reactive singleton).
```

- [ ] **Step 4: Update CLAUDE.md**

Add to the "Shared utilities" table:

```markdown
| `BasilInput` / `BasilAmount` / `BasilSearch` / `BasilText` / `BasilNote` | `frontend/src/components/BasilInput.vue` + wrappers | Custom input with variant system. Replaces `q-input`. See DESIGN.md "Custom keyboard & BasilInput". |
| `keyboardState`, `requestKeyboard`, `dismissKeyboard` | `frontend/src/utils/basilKeyboard.js` | Reactive singleton for keyboard ↔ input communication. |
```

Add to "Before building any new component or UI pattern" section:
```markdown
6. **Inputs: use `BasilInput` or variant wrappers.** Never use `q-input` for new inputs.
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/quasar-overrides.css DESIGN.md CLAUDE.md
git commit -m "chore: remove dead q-input overrides, update DESIGN.md and CLAUDE.md with BasilInput rules"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run the full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass (basilKeyboard.test.js + BasilInput.test.js).

- [ ] **Step 2: Run the build**

```bash
cd frontend && npm run build
```

Expected: Clean build with no errors. Check for warnings about unused imports.

- [ ] **Step 3: End-to-end manual test on mobile**

Test every migrated view on a real mobile device or Chrome DevTools mobile emulation:

1. **BudgetPlannerView** — income input, category limits, add category
2. **DialogComponent** — transaction note, category name/limit, split amount
3. **RuleEditorDialog** — rule label, transaction name, amount fields, note
4. **BudgetView** — search, amount filters, triage split/note
5. **MerchantBrowser** — search (mobile + desktop)
6. **AccountsView** — add + edit manual account
7. **TagPicker** — new tag name

For each: verify keyboard appears with correct layout, typing works, Done dismisses, outside tap dismisses, bottom nav hides/shows correctly, no viewport jitter.

- [ ] **Step 4: Test desktop behavior**

On desktop browser, verify all inputs work with physical keyboard. No on-screen keyboard should appear. All existing functionality preserved.

- [ ] **Step 5: Commit any final fixes**

If any issues found in testing, fix and commit with descriptive messages.
