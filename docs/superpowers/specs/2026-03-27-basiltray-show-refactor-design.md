# BasilTray Refactor: showModal() → dialog.show()

## Problem

`showModal()` creates a browser "top layer" that isolates everything outside the dialog. This causes three PWA bugs that can't be fixed within the current architecture:

1. **Keyboard orphaning** — The custom keyboard must `appendChild` itself into whichever dialog is topmost. This breaks Vue refs, causes stale `isOpen` state when trays close, and leaves the keyboard invisible inside closed dialogs.
2. **Parent tray shifting** — When a child tray opens with the keyboard, `--basil-keyboard-height` affects all trays (the CSS variable is on `:root`), causing the parent tray to shift up.
3. **Scroll-behind** — iOS PWA ignores `overflow: hidden` on body, and the top layer makes it harder to control scroll containment.

Additionally, `BasilSelect` and `BasilDatePicker` must detect dialog context and teleport their dropdowns inside the dialog — complexity that exists solely because of the top layer.

## Solution

Switch `BasilTray` from `dialog.showModal()` to `dialog.show()`. The dialog element stays (for semantics and escape handling) but no longer enters the top layer. A custom backdrop `<div>` provides the scrim. Focus trapping is implemented manually.

**The key win:** Without the top layer, `position: fixed` elements (keyboard, dropdowns, toasts) are visible above the dialog via normal z-index stacking. No DOM moving needed.

## Design

### BasilTray.vue

**Template:**
```html
<Teleport to="body">
  <div v-if="isVisible" class="basil-tray__backdrop" @click="onBackdropClick" />
</Teleport>
<dialog
  ref="dialogRef"
  class="basil-tray"
  :aria-modal="isVisible"
  @close="onNativeClose"
  @cancel="onCancel"
  @keydown="onKeydown"
>
  <div ref="wrapRef" :class="wrapClasses" :style="wrapStyle">
    <slot />
  </div>
</dialog>
```

**open() method:**
```javascript
open() {
  const dialog = this.$refs.dialogRef
  if (!dialog || dialog.open) return

  this.$emit('before-show')
  this._previousFocus = document.activeElement
  this.lockBodyScroll()
  dialog.show()  // NOT showModal()

  nextTick(() => {
    this.focusFirstElement()
    this.$emit('show')
    this.setupGesture()
  })
}
```

**Focus trapping (onKeydown):**
```javascript
onKeydown(e) {
  if (e.key !== 'Tab') return
  const focusable = this.getFocusableElements()
  if (!focusable.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
```

**close() method:**
```javascript
close() {
  const dialog = this.$refs.dialogRef
  if (!dialog || !dialog.open) return

  this.$emit('before-hide')
  dialog.close()
  this.unlockBodyScroll()
  this.$emit('hide')

  // Restore focus to element that was focused before tray opened
  if (this._previousFocus && this._previousFocus.focus) {
    this._previousFocus.focus()
    this._previousFocus = null
  }
}
```

**Helper:**
```javascript
getFocusableElements() {
  const dialog = this.$refs.dialogRef
  if (!dialog) return []
  return [...dialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )]
}

focusFirstElement() {
  const focusable = this.getFocusableElements()
  if (focusable.length) {
    focusable[0].focus()
  } else {
    // Focus the wrap div as fallback
    this.$refs.wrapRef?.focus()
  }
}
```

**Removed from close():**
- Keyboard dismiss logic (`keyboardState.isOpen` check, `dismissKeyboard()` call)
- `getActiveInputEl` import

**Props/emits/data:** Unchanged. `persistent`, `maxWidth`, `modelValue` all work the same.

**Escape handling:** `dialog.show()` still fires the `cancel` event on Escape. The existing `onCancel` handler works unchanged.

**Body scroll lock:** Keep existing `lockBodyScroll`/`unlockBodyScroll` (already manual with `overflow: hidden`).

**Nested tray detection:** `hasChildDialogOpen()` still works — `dialog.show()` sets `dialog.open = true` and the `[open]` attribute.

**Gesture handling:** Unchanged — `useGesture` on the wrap element, `hasChildDialogOpen` check.

### BasilKeyboard.vue

**Remove entirely:**
- `originalParent` data property
- All `appendChild` / DOM-moving logic in the `isOpen` watcher
- The `classList.add/remove('basil-keyboard--hidden')` reflow hack

**Simplified watcher:**
```javascript
isOpen: {
  handler(val) {
    if (val) {
      this.$nextTick(() => {
        keyboardState.height = this.$el.offsetHeight
        document.documentElement.style.setProperty(
          '--basil-keyboard-height', keyboardState.height + 'px'
        )
      })
    } else {
      document.documentElement.style.setProperty('--basil-keyboard-height', '0px')
    }
  },
  immediate: true,
}
```

The keyboard stays in `App.vue` at `position: fixed; bottom: 0; z-index: 7000`. It's always visible above everything because nothing is in the top layer.

### BasilSelect.vue

**Remove:**
- `mounted()` dialog detection logic (`this.$el.closest('dialog')`)
- `teleportTarget` data property (or simplify to always `'body'`)

Dropdown always teleports to `body`. Z-index handles stacking.

### BasilDatePicker.vue

**Remove:**
- Same dialog detection logic as BasilSelect
- `teleportTarget` simplification

### CSS Changes

**Remove from `basil-components.css`:**
```css
dialog.basil-tray::backdrop {
  background: rgba(0, 0, 0, 0.5);
}
```

**Add to `basil-components.css`:**
```css
.basil-tray__backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.5);
}
```

**Update `dialog.basil-tray`:**
```css
dialog.basil-tray {
  /* Existing resets stay */
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  max-width: none;
  max-height: none;
  width: 100%;
  height: 100%;
  overflow: visible;
  /* Add z-index for stacking above backdrop */
  z-index: 1000;
  position: fixed;
  inset: 0;
}
```

**Keyboard CSS:** Unchanged. `z-index: 7000` already higher than dialog's 1000.

### Z-Index Stack

| Layer | Z-Index | Element |
|-------|---------|---------|
| Page content | auto | `.basil-main` |
| Header | 100 | `.basil-header` |
| Footer/nav | 100 | `.basil-footer` |
| Tray backdrop | 999 | `.basil-tray__backdrop` |
| Tray dialog | 1000 | `dialog.basil-tray` |
| Select dropdown | 9000 | `.basil-select__dropdown` (via Teleport to body) |
| Keyboard | 7000 | `.basil-keyboard` |
| Toast | 9999 | `.basil-toast-container` |

For nested trays, each subsequent tray renders its own backdrop + dialog. Since they're all `z-index: 1000` with `position: fixed`, later-rendered ones naturally stack on top (DOM order within same z-index).

### What Gets Deleted

| File | Removed | Lines |
|------|---------|-------|
| `BasilKeyboard.vue` | `appendChild` logic, `originalParent`, reflow hack | ~25 lines |
| `BasilSelect.vue` | Dialog detection in `mounted()`, `teleportTarget` | ~5 lines |
| `BasilDatePicker.vue` | Dialog detection in `mounted()`, `teleportTarget` | ~5 lines |
| `BasilTray.vue` | Keyboard dismiss in `close()`, keyboard imports | ~8 lines |
| `basil-components.css` | `::backdrop` rule | ~3 lines |

### What Gets Added

| File | Added | Lines |
|------|-------|-------|
| `BasilTray.vue` | Backdrop div, focus trap, focus restore, `onKeydown` | ~35 lines |
| `basil-components.css` | `.basil-tray__backdrop` | ~6 lines |

### Bugs Fixed

1. **Keyboard orphaning** — Keyboard never moves. Stays in App.vue. `isOpen` state is the only thing that matters.
2. **Parent tray shifting** — Keyboard height only affects the page behind the tray, not the tray's own layout. The tray is `position: fixed` with its own stacking context.
3. **Scroll-behind** — No top layer means no special iOS behavior to fight. `overflow: hidden` on body + the backdrop div blocking pointer events should suffice.
4. **Select/DatePicker teleport complexity** — Eliminated. Always teleport to body.

### Testing

- All existing unit tests should pass (no API changes to BasilTray props/emits)
- E2e regression suite covers dialog interactions (edit transaction, split, rules CRUD)
- Manual PWA testing required for: keyboard in nested trays, swipe-to-dismiss, backdrop click, escape key, scroll containment
