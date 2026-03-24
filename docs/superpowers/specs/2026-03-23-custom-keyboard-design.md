# Custom Keyboard System

**Date:** 2026-03-23
**Branch:** `feature/custom-keyboard`
**Status:** Design

## Problem

iOS Safari's virtual keyboard causes persistent UX issues throughout the app:

- **Viewport unpredictability** — the keyboard takes an unknown amount of screen space that varies by device, orientation, and whether the predictive bar is showing. Every tray/dialog layout is defensive against this uncertainty.
- **Content jitter** — `position: fixed; bottom: 0` (used by BasilTray) conflicts with Safari's scroll-into-view algorithm when text inputs gain focus, causing visible layout jumps.
- **Blur-before-tap sequencing** — tapping a submit button while a Quasar `q-select` has focus requires two taps on mobile (first blurs the dropdown, second fires the button).
- **Inconsistent `inputmode` behavior** — Safari doesn't reliably respect `inputmode="numeric"` vs `inputmode="decimal"`, leading to wrong keyboard layouts for amount entry.
- **Design constraints** — the DESIGN.md "iOS keyboard rule" forces inputs to be placed high in trays with 260px+ padding below to avoid jitter. This limits layout flexibility.

A custom keyboard replaces the native keyboard entirely on mobile, giving the app full control over viewport layout and input behavior.

## Prior art

The crossword keyboard in `/projects/ktrlabs/src/components/crossword/crossword-keyboard.tsx` proves the pattern works. Core technique: render keys as `div` elements with `onPointerDown={(e) => e.preventDefault()}` to prevent native focus, route taps through callbacks. ~90 lines of code for a full QWERTY layout with haptic feedback.

## Solution

### Architecture

**App-level singleton keyboard** — one `BasilKeyboard` instance mounts in `App.vue` below the router-view, fixed to the bottom of the viewport. This mirrors how iOS's native keyboard works: a system-level surface that the app's content sits above.

**Mobile only** — the keyboard renders only on mobile devices (touch detection via `'ontouchstart' in window` or Quasar's `$q.platform.is.mobile`). Desktop users type with their physical keyboard into a real native `<input>` — no custom keyboard, no reimplemented key handling.

**No content compression** — when the keyboard opens, the app's content does not resize or reflow. Instead, the focused input is scrolled into the visible area above the keyboard if it would otherwise be obscured. The page's scroll container gets `padding-bottom` equal to the keyboard height so all content remains reachable by scrolling. Layout stays stable.

### Components

#### `BasilKeyboard.vue`

App-level singleton mounted in `App.vue`. Contains:

- **QWERTY layout** — letters, space, period, backspace, shift toggle, Done key
- **Numpad layout** — 0-9, decimal point, backspace, Done key
- **Layout mode system** — extensible for future layouts (symbols, etc.) without architectural changes
- **Slide-up animation** — CSS transform transition (~250ms) from below viewport
- **CSS variable** — sets `--basil-keyboard-height` on `:root` when open (transitions to `0` when closed). Used by bottom nav and scroll-into-view logic.
- **Haptic feedback** — `navigator.vibrate(10)` where supported (Android only — iOS Safari does not implement the Vibration API). Gracefully no-ops on unsupported platforms.
- **Press feedback** — CSS `active` state with `scale(0.95)` transform + accent background color on key tap. This is the primary feedback mechanism on all platforms.
- **Tap targets** — minimum 44px height per key (Apple HIG)
- **Safe area** — respects `env(safe-area-inset-bottom)` for home indicator

**Dismissal behavior:**
- Tapping "Done" key
- Any `pointerdown` on an element that is not inside a `.basil-input` or `.basil-keyboard` element (this includes tapping category rows, buttons, empty space, etc.)
- Navigating to a different view (Vue Router `afterEach` guard calls `dismissKeyboard()`)
- Scrolling does **not** dismiss — users may need to scroll to see other content while an input is focused

**Z-index ordering:** The keyboard must render above Quasar dialog overlays (z-index 6000). Keyboard uses `z-index: 7000` to ensure it sits above trays and dialogs.

#### `BasilInput.vue`

Single input component replacing all `q-input` usage. Renders differently on mobile vs desktop:

- **Mobile:** styled `div` with `role="textbox"` and `tabindex="0"` — no native `<input>` element exists, so there is nothing for iOS to attach a keyboard to. All input comes through the custom keyboard.
- **Desktop:** renders a real native `<input>` element. No custom keyboard, no reimplemented key handling. Users get full native behavior (selection, copy/paste, undo, IME, etc.).

This split is internal to `BasilInput` — consuming components use the same API regardless of platform.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `String \| Number` | `''` | v-model binding. Amount variant emits `Number`; others emit `String`. |
| `variant` | `String` | `'text'` | One of: `text`, `amount`, `search`, `note` |
| `label` | `String` | `''` | Floating input label |
| `hint` | `String` | `''` | Help text displayed below the input |
| `placeholder` | `String` | `''` | Placeholder text when value is empty |
| `prefix` | `String` | `''` | Display prefix (e.g. `$`). Amount variant defaults to `$`. |
| `dense` | `Boolean` | `false` | Compact mode |
| `disabled` | `Boolean` | `false` | Disables input |
| `action` | `String` | `'done'` | Action key label (`done`, `next`, `search`, `go`) — ships as `done` everywhere, extensible for future use |
| `debounce` | `Number` | `0` | Debounce delay in ms. Search variant defaults to `300` if not set. |

**Events:** `update:modelValue`, `focus`, `blur`, `submit` (fires on Enter key / Done tap — replaces `@keyup.enter` in consuming components)

**Public methods:** `focus()` — opens the custom keyboard on mobile, focuses the native input on desktop. Used by `this.$refs.x.focus()` callers.

**Variant behaviors:**

| Variant | Keyboard mode | Prefix | Formatting | Notes |
|---------|--------------|--------|------------|-------|
| `amount` | numpad | `$` | Dollar-first entry (typing `47.00` shows `$47.00`). Max 2 decimal places. Backspace removes last digit. Max value bounded by reasonable limit (e.g. 999999.99). | Replaces all `type="number"` amount inputs |
| `search` | qwerty | none | None | Clear button, debounced emit |
| `text` | qwerty | none | None | General short text (names, labels) |
| `note` | qwerty | none | None | Longer text, may support multi-line later |

**Visual behavior:**
- Styled to match existing `q-input outlined` appearance using Basil design tokens
- Blinking cursor when focused (mobile only — desktop uses native cursor)
- Label floats above value (same as Quasar outlined pattern)
- All colors, spacing, and borders use `var(--basil-*)` tokens — dark mode works automatically

#### Thin wrappers (convenience components)

Preset-variant components for template readability. Each is a thin wrapper over `BasilInput` with a default `variant` prop:

- `BasilAmount` — `variant="amount"`
- `BasilSearch` — `variant="search"`
- `BasilText` — `variant="text"`
- `BasilNote` — `variant="note"`

Using `<BasilInput variant="amount">` directly also works.

#### `basilKeyboard.js` reactive singleton module

Bridge between inputs and the keyboard singleton. This is a plain ES module exporting Vue reactive refs — **not** a composable. This is intentional: the entire codebase uses Options API, so the module must be importable via `import { keyboardState } from './basilKeyboard'` and used in `computed`, `methods`, and `watch` blocks without requiring a `setup()` function.

**Why a singleton module, not provide/inject or Vuex:** The keyboard state is transient UI state (which input is focused, what mode to show) that doesn't belong in the app store. A reactive singleton is the simplest pattern that works across the Options API component tree without requiring any component hierarchy coupling.

**Exports:**

```js
import { reactive, ref } from 'vue'

// Reactive state — readable by any component
export const keyboardState = reactive({
  isOpen: false,
  mode: 'qwerty', // 'qwerty' | 'numpad'
  height: 0,       // current keyboard height in px
})

// Methods — called by BasilInput and BasilKeyboard
export function requestKeyboard({ mode, onKey, onBackspace, onDone, inputEl }) { ... }
export function dismissKeyboard() { ... }
export function emitKey(char) { ... }    // called by BasilKeyboard when a key is tapped
export function emitBackspace() { ... }  // called by BasilKeyboard
export function emitDone() { ... }       // called by BasilKeyboard
```

**Data flow:**
1. User taps a `BasilInput` → input calls `requestKeyboard({ mode, onKey, ... })`
2. Singleton sets `keyboardState.isOpen = true`, stores callbacks
3. `BasilKeyboard.vue` (mounted in App.vue) watches `keyboardState` and slides in with the right layout
4. User taps a key in `BasilKeyboard` → keyboard calls `emitKey('a')` → singleton calls the stored `onKey` callback → `BasilInput` updates its value
5. User taps Done → `emitDone()` → singleton calls stored `onDone`, sets `isOpen = false`

Only one input can hold keyboard focus at a time. Requesting the keyboard from a new input dismisses/transfers from the previous one.

### Scroll-into-view

When the keyboard opens, the singleton module checks whether the focused `BasilInput` element is below the visible area (viewport height minus keyboard height). If obscured, the input's scroll container is smooth-scrolled so the input sits approximately 20% from the top of the visible area. If the input is already visible, nothing moves.

**Inside BasilTray:** The tray itself does not move or resize. The tray's internal scroll container (`.basil-tray__scroll` or the element with `overflow-y: auto`) is the scroll target. If the tray's content is shorter than the visible area above the keyboard (i.e., all content fits without scrolling), no scroll is needed — the input is already visible.

**On full-page views:** The page's main scroll container gets temporary `padding-bottom` equal to the keyboard height, ensuring all content at the bottom of the page is scrollable into the visible area above the keyboard.

This replaces Safari's aggressive scroll-into-view behavior with a controlled, predictable version.

### Integration with existing systems

**Bottom nav** — currently hides via `v-show="!keyboardOpen"` using a `focusin`/`focusout` listener in App.vue. This is replaced by reading `--basil-keyboard-height` or the composable's `isOpen` state. The existing listener is removed.

**BasilTray** — trays do not resize when the keyboard opens. The tray's content scrolls to keep the focused input visible. The "iOS keyboard rule" in DESIGN.md (260px padding below inputs) becomes unnecessary and is removed.

**`q-select` components** — not replaced in this project. They don't trigger a keyboard, so no conflict. The blur-swallows-tap bug is a separate issue unrelated to keyboard behavior.

### Styling

All styling uses existing Basil design tokens:

| Element | Token |
|---------|-------|
| Keyboard background | `--basil-surface-dialog` |
| Key surface | `--basil-surface` |
| Key shadow | `var(--basil-shadow-sm)` (or new `--basil-shadow-xs` token if existing is too heavy) |
| Modifier keys (shift, backspace) | `--basil-border` background |
| Done key | `--basil-accent` background, white text |
| Key text | `--basil-text` |
| Pressed state | `scale(0.95)` + `--basil-accent` background |

CSS class names follow project convention: `basil-keyboard`, `basil-keyboard__key`, `basil-keyboard__key--modifier`, `basil-keyboard__key--action`, `basil-input`, `basil-input__display`, `basil-input__label`, etc.

## Migration plan

Each view migrates fully in one step — no view has mixed native/custom inputs.

**Phase 1 — Foundation:**
Build `BasilKeyboard`, `BasilInput`, `useBasilKeyboard`. Test in isolation.

**Phase 2 — Pilot:**
Migrate `BudgetPlannerView` (numeric + text inputs, simpler view, lower risk).

**Phase 3 — Roll through remaining views:**
1. `DialogComponent` — transaction edit, category edit, add category
2. `RuleEditorDialog` — rule label, name value, amount values, note
3. `BudgetView` — search, amount filters, triage split/note
4. `MerchantBrowser` — search
5. `AccountsView` — manual account fields
6. `TagPicker` — tag name

**Phase 4 — Cleanup:**
- Remove `keyboardOpen` focus detection from `App.vue`
- Remove dead `q-input` CSS overrides from `quasar-overrides.css`
- Update DESIGN.md: remove iOS keyboard rule, add BasilInput usage rules
- Update CLAUDE.md: add `BasilInput` to shared utilities table

## Not in scope

- **`BasilSelect`** — replacing `q-select` is a separate project
- **Symbols/special characters layout** — architecture supports it, not building it now
- **Date picker replacement** — `type="date"` stays native
- **File upload** — stays native (`VenmoEnrichmentDialog`)
- **`q-select` blur-swallows-tap fix** — unrelated to keyboard, stays in backlog

## DESIGN.md updates

Add to the component rules section:

> **Inputs: use `BasilInput` (or variant wrappers) for all user text/number entry on mobile.**
> Never use `q-input` for new inputs. `BasilInput` suppresses the native keyboard and
> routes input through the app's custom keyboard. Variants: `amount` (numpad, $ prefix),
> `search` (QWERTY, clear button), `text` (QWERTY, short strings), `note` (QWERTY, longer text).
> Thin wrappers available: `<BasilAmount>`, `<BasilSearch>`, `<BasilText>`, `<BasilNote>`.

Remove the "iOS keyboard rule" section (no longer needed with custom keyboard).
