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

**Mobile only** — the keyboard renders only on mobile devices (touch detection). Desktop users type with their physical keyboard; `BasilInput` listens for native `keydown` events when focused on desktop.

**No content compression** — when the keyboard opens, the app's content does not resize or reflow. Instead, the focused input is scrolled into the visible area above the keyboard if it would otherwise be obscured. Layout stays stable.

### Components

#### `BasilKeyboard.vue`

App-level singleton mounted in `App.vue`. Contains:

- **QWERTY layout** — letters, space, period, backspace, shift toggle, Done key
- **Numpad layout** — 0-9, decimal point, backspace, Done key
- **Layout mode system** — extensible for future layouts (symbols, etc.) without architectural changes
- **Slide-up animation** — CSS transform transition (~250ms) from below viewport
- **CSS variable** — sets `--basil-keyboard-height` on `:root` when open (transitions to `0` when closed). Used by bottom nav and scroll-into-view logic.
- **Haptic feedback** — `navigator.vibrate(10)` on each keypress (same as crossword keyboard)
- **Press feedback** — `active:scale-95` transform on key tap for visual confirmation
- **Tap targets** — minimum 44px height per key (Apple HIG)
- **Safe area** — respects `env(safe-area-inset-bottom)` for home indicator

Keyboard is dismissed by: tapping "Done", tapping outside any `BasilInput`, or navigating to a different view.

#### `BasilInput.vue`

Single input component replacing all `q-input` usage. Renders a styled `div` with `role="textbox"` and `tabindex="0"` — no native `<input>` element exists, so there is nothing for iOS to attach a keyboard to.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `String \| Number` | `''` | v-model binding |
| `variant` | `String` | `'text'` | One of: `text`, `amount`, `search`, `note` |
| `label` | `String` | `''` | Input label |
| `prefix` | `String` | `''` | Display prefix (e.g. `$`) |
| `dense` | `Boolean` | `false` | Compact mode |
| `disabled` | `Boolean` | `false` | Disables input |
| `action` | `String` | `'done'` | Action key label (`done`, `next`, `search`, `go`) — ships as `done` everywhere, extensible for future use |

**Variant behaviors:**

| Variant | Keyboard mode | Prefix | Formatting | Notes |
|---------|--------------|--------|------------|-------|
| `amount` | numpad | `$` | Decimal handling, cents formatting | Replaces all `type="number"` amount inputs |
| `search` | qwerty | none | None | Clear button, debounced emit |
| `text` | qwerty | none | None | General short text (names, labels) |
| `note` | qwerty | none | None | Longer text, may support multi-line later |

**Visual behavior:**
- Styled to match existing `q-input outlined` appearance using Basil design tokens
- Blinking cursor when focused
- Label floats above value (same as Quasar outlined pattern)
- All colors, spacing, and borders use `var(--basil-*)` tokens — dark mode works automatically

**Desktop behavior:**
- No on-screen keyboard rendered
- Listens for native `keydown` events when focused
- Behaves like a normal input from the user's perspective

#### Thin wrappers (convenience components)

Preset-variant components for template readability. Each is a thin wrapper over `BasilInput` with a default `variant` prop:

- `BasilAmount` — `variant="amount"`
- `BasilSearch` — `variant="search"`
- `BasilText` — `variant="text"`
- `BasilNote` — `variant="note"`

Using `<BasilInput variant="amount">` directly also works.

#### `useBasilKeyboard.js` composable

Bridge between inputs and the keyboard singleton.

**API:**

```js
const { requestKeyboard, dismissKeyboard, isOpen, activeInput } = useBasilKeyboard()

// Called by BasilInput on tap
requestKeyboard({
  mode: 'qwerty' | 'numpad',
  onKey: (char) => { /* append to value */ },
  onBackspace: () => { /* delete last char */ },
  onDone: () => { /* dismiss, blur */ },
  inputEl: ref  // for scroll-into-view calculation
})
```

Only one input can hold keyboard focus at a time. Requesting the keyboard from a new input dismisses/transfers from the previous one.

### Scroll-into-view

When the keyboard opens, the composable checks whether the focused `BasilInput` element is below the visible area (viewport height minus keyboard height). If obscured, the nearest scrollable ancestor is smooth-scrolled so the input sits approximately 20% from the top of the visible area. If the input is already visible, nothing moves.

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
| Key shadow | `0 1px 2px rgba(0,0,0,0.08)` |
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
