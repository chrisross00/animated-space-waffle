# BasilDatePicker — Design Spec

## Overview

A custom date picker component replacing the native `<input type="date">` across the app. Follows the same dual-mode pattern as BasilSelect: dropdown on desktop, BasilTray bottom sheet on mobile. No native date inputs anywhere — fully controlled rendering to avoid iOS autofocus issues and maintain visual consistency with the Basil design language.

## Trigger Field

Visually identical to other Basil input-like components (BasilInput, BasilSelect):

- Container: `border: 1px solid var(--basil-border)`, `border-radius: var(--basil-radius-sm)`, `background: var(--basil-surface)`, `padding: var(--basil-space-2) var(--basil-space-3)`, `min-height: 44px`, flex row
- Floating label: same `top: -8px` animation pattern as BasilInput/BasilSelect
- Display text: formatted date ("Mar 26, 2026") in `--basil-font-ui`, 14px
- Right icon: `calendar_today` material icon (like BasilSelect's chevron)
- Focus state: `border-color: var(--basil-green)` via `:focus-within` or open state class
- Placeholder when no value: "Select date" in `--basil-text-muted`

## Calendar Grid

### Header
- Month/year display: "March 2026" in `--basil-font-display` (DM Serif Display) — matches card headers
- Left/right arrows: BasilButton icon variant, navigate months
- Tap month/year text: no action (keep it simple v1; could add year picker later)

### Day Labels
- Single row: S M T W T F S
- `--basil-text-muted`, `--basil-font-ui`, 0.75rem, uppercase

### Day Grid
- 7 columns, 6 rows max (covers all month layouts)
- Each cell: square-ish, min 40px tap target, centered day number
- `--basil-font-ui` for day numbers, 14px
- States:
  - **Default**: `color: var(--basil-text)`, transparent background
  - **Outside month**: `color: var(--basil-text-muted)`, tappable (navigates to that month and selects)
  - **Today**: `border: 1px solid var(--basil-green-subtle)`, subtle ring
  - **Selected**: `background: var(--basil-green)`, `color: var(--basil-text-inverse)`, `border-radius: 50%`
  - **Hover (desktop)**: `background: var(--basil-hover)`
  - **Tap**: neutral ripple (same as BasilListItem)
- Transitions: background/color use `--basil-t-fast` / `--basil-ease`

## Desktop Mode — Dropdown

Same pattern as BasilSelect desktop dropdown:
- Teleport to nearest `<dialog>` if inside one, otherwise `body`
- Position below the trigger field, left-aligned
- `border-radius: var(--basil-radius-md)`, `box-shadow: var(--basil-shadow-md)`, `background: var(--basil-surface)`
- Width: ~280px (fixed, enough for 7 columns)
- Click outside or select a day → closes
- Escape key → closes

## Mobile Mode — BasilTray

Same pattern as BasilSelect mobile tray:
- Opens `BasilTray` bottom sheet
- Calendar grid inside tray with label header
- Tap a day → selects and closes tray
- Swipe down → dismisses without changing value

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | String | `''` | ISO date string `YYYY-MM-DD` |
| `label` | String | `''` | Floating label text |
| `disabled` | Boolean | `false` | Disables interaction |
| `dense` | Boolean | `false` | Compact mode (36px height) |

## Emits

| Event | Payload | When |
|-------|---------|------|
| `update:modelValue` | String (`YYYY-MM-DD`) | Day selected |

## Data Format

- Internal: `YYYY-MM-DD` string (same as `<input type="date">`)
- Display: formatted via `toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` → "Mar 26, 2026"

## File Structure

- **Component**: `frontend/src/components/BasilDatePicker.vue`
- **Registration**: add to `frontend/src/components/basil/index.js` for global availability
- **CSS**: scoped `<style>` inside the component, BEM naming `basil-date-picker__*`
- **No external dependencies** — pure Vue + existing Basil components (BasilTray, BasilButton, BasilIcon)

## Integration

Replace the current date field in `DialogComponent.vue`:

```html
<!-- Before -->
<div class="basil-date-field" @click="openDatePicker">
  <input type="date" ... />
  <span v-else ...>{{ formatDateDisplay(dialogBody.date) }}</span>
  <label ...>Date</label>
</div>

<!-- After -->
<BasilDatePicker v-model="dialogBody.date" label="Date" @update:model-value="isFormSubmittable()" />
```

Remove: `openDatePicker()`, `formatDateDisplay()`, `isMobile` computed, all `.basil-date-field*` CSS from DialogComponent.

## Dark Mode

Automatic via tokens — no special handling needed. `--basil-surface`, `--basil-text`, `--basil-green`, `--basil-border` all have dark theme overrides in `tokens.css`.

## Accessibility

- Trigger: `role="combobox"`, `aria-expanded`, `aria-haspopup="dialog"`
- Calendar: `role="grid"`, day cells `role="gridcell"`, `aria-selected` on current selection
- Arrow key navigation between days (desktop)
- Escape closes the picker
