# Basil Component Library — Full Quasar Replacement

**Date:** 2026-03-24
**Status:** Approved
**Branch strategy:** Single feature branch, no pushes until complete

---

## Goal

Remove Quasar entirely from the **main frontend app** (`frontend/`). Replace every
Quasar component, directive, CSS utility, and plugin with custom Basil equivalents.
The app boots with Vue + Basil only. One new dependency added: `@tanstack/vue-virtual`
for virtual scrolling.

**Out of scope:** The admin app (`admin/`) is a separate build with its own Quasar
install. It will be migrated separately in a future pass — it has ~51 Quasar instances
across 3 files and can reuse the Basil library once it's proven in the main app.

## Why

- Quasar's mobile behavior fights us (blur-swallows-tap, readonly styling quirks,
  dialog scroll interference)
- Full control over the component stack — no upstream breakage, no Quasar release
  cycle dependency
- Smaller bundle — ship only what we use
- Design system is already token-based (`--basil-*`); Quasar overrides are a
  maintenance tax

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full elimination | Maximum control, no half-measures |
| Shipping strategy | Big bang on feature branch | No time pressure; ship when fully clean |
| App shell | CSS-only (`basil-shell.css`) + semantic HTML | One layout, no component abstraction needed |
| Responsive | CSS classes + `useScreen()` composable | Need both show/hide and JS runtime checks |
| Notifications | Custom `BasilToast` + `useToast()` | Tiny API surface, already defined by `notifyUser()` |
| Icons | Self-hosted Material Icons woff2 | Same icons, no CDN, no `@quasar/extras` |
| Dialog primitive | Native `<dialog>` in BasilTray | Browser gives backdrop + escape for free |
| Virtual scrolling | `@tanstack/vue-virtual` | Edge cases not worth hand-rolling |
| Gestures | `useGesture()` composable | Shared by BasilTray + PullToRefresh + future swipe UX |
| CSS utilities | Absorb into BEM styles + small fallback set | Most spacing belongs in component CSS |
| Select | One `BasilSelect` with optional filter | No multi-select needed; combobox can layer on later |
| Toggle/Checkbox | One `BasilToggle` with variant prop | Identical logic, different visuals |
| Progress/Skeleton | Simple custom components | ~20 lines each, trivial |

---

## Component Inventory

### Existing — keep and evolve

| Component | Change |
|-----------|--------|
| `BasilInput` | Remove residual Quasar CSS dependencies |
| `BasilAmount/Search/Text/Note` | No change |
| `BasilTray` | Rewrite: `q-dialog` → native `<dialog>`, own backdrop, focus trap, consume `useGesture` |
| `BasilConfirmTray` | No change (wraps BasilTray) |
| `BasilKeyboard` | No change |

### New components

| Component | Replaces | ~Instances |
|-----------|----------|------------|
| `BasilButton` | `q-btn` | 100 |
| `BasilIcon` | `q-icon` | 65 |
| `BasilCard` | `q-card`, `q-card-section`, `q-card-actions` | 40 |
| `BasilSelect` | `q-select` | 20 |
| `BasilToggle` | `q-toggle`, `q-checkbox`, `q-btn-toggle` | 22 |
| `BasilList` + `BasilListItem` | `q-list`, `q-item`, `q-item-section`, `q-item-label` | 104 |
| `BasilTabs` + `BasilTab` | `q-tabs`, `q-route-tab` | 13 |
| `BasilTable` | `q-table` | 1 |
| `BasilProgress` | `q-linear-progress` | 4 |
| `BasilSkeleton` | `q-skeleton` | 13 |
| `BasilSpinner` | `q-spinner`, `q-spinner-dots` | 5 |
| `BasilToast` | `Notify` plugin | 6 call sites |
| `BasilChip` | `q-chip` | 5 |
| `BasilBadge` | `q-badge` | 2 |
| `BasilTooltip` | `q-tooltip` | 11 |
| `BasilSeparator` | `q-separator` | 2 |
| `BasilExpansion` | `q-expansion-item` | 1 |

### Not replaced — absorbed into plain HTML/CSS

These Quasar components are too trivial or too niche for a Basil equivalent.
They get replaced with plain markup during migration.

| Quasar component | Replacement | Instances |
|------------------|-------------|-----------|
| `q-banner` | `<div class="basil-banner">` | 2 |
| `q-slide-transition` | Vue `<Transition>` + CSS class | 1 |
| `q-space` | `style="flex: 1"` or `basil-spacer` utility | 1 |
| `q-markup-table` | Plain `<table class="basil-table">` with shared CSS | 3 |
| `q-virtual-scroll` (standalone) | `@tanstack/vue-virtual` used directly as composable | 1 |
| `q-input` (last remaining) | `BasilInput` (already exists) | 1 |

### New composables

| Composable | Replaces | Purpose |
|-----------|----------|---------|
| `useScreen()` | `$q.screen` | Reactive breakpoint booleans (`isMobile`, `isDesktop`, `width`) |
| `useGesture()` | Inline pointer tracking | Shared drag/swipe primitive with velocity + direction |
| `useToast()` | `Notify.create()` / `$q.notify()` | Programmatic toast queue |

### New styles / assets

| File | Replaces | Purpose |
|------|----------|---------|
| `basil-shell.css` | `q-layout` etc. | App layout: header, footer, drawer, main area |
| `basil-components.css` | `quasar-overrides.css` | Styles for all new Basil components |
| `basil-utilities.css` | `q-pa-*`, `q-mb-*`, `gt-xs`, `lt-sm` etc. | Spacing + responsive utilities (see below) |
| `icons.css` + woff2 file | `@quasar/extras` | Self-hosted Material Icons |

---

## API Design

### BasilButton

```html
<BasilButton label="Save" />
<BasilButton label="Cancel" variant="flat" />
<BasilButton icon="add" variant="icon" />
<BasilButton icon="sync" label="Sync" />
<BasilButton label="Save" :loading="saving" />
<BasilButton label="Delete" color="negative" />
<BasilButton label="Edit" dense />
<BasilButton label="Go" to="/budget" />
```

**Props:** `label`, `icon`, `variant` (primary/flat/icon), `color` (primary/negative/positive),
`dense`, `loading`, `disabled`, `to` (router-link), `type` (button/submit)

`to` prop wraps the button in `<router-link>` internally, rendering as an `<a>` with
a proper `href` (preserves right-click → open in new tab, link preview, accessibility).

### BasilCard

```html
<BasilCard>
  <template #header>
    <span class="basil-card-label">Actuals</span>
    <span class="basil-card-period">March 2026</span>
  </template>
  <div>Body content</div>
  <template #actions>
    <BasilButton label="Save" />
  </template>
</BasilCard>
```

**Props:** `flat`, `bordered`
**Slots:** `header`, `default`, `actions`

The `default` slot absorbs all body content. For dialogs with scrollable body regions,
wrap the scrollable content in a `<div class="overflow-auto" style="flex: 1">` inside
the default slot — the card uses `display: flex; flex-direction: column` so this works
naturally. No separate "scrollable section" slot needed.

### BasilSelect

```html
<BasilSelect
  v-model="selectedCategory"
  :options="categories"
  option-label="name"
  option-value="id"
  label="Category"
  filterable
/>
```

**Props:** `modelValue`, `options`, `optionLabel`, `optionValue`, `label`, `placeholder`,
`filterable`, `disabled`, `emitValue`

**Slots:** `option` — optional custom option rendering (for cases like DialogComponent's
category select which shows conflict indicators). When omitted, renders `optionLabel` as text.

**Behavior:**
- Desktop: dropdown positioned below trigger
- Mobile: opens BasilTray bottom sheet with option list
- `filterable`: shows BasilSearch at top of option list

### BasilToggle

```html
<BasilToggle v-model="darkMode" label="Dark mode" />
<BasilToggle v-model="selected" variant="checkbox" />
<BasilToggle v-model="range" variant="button-group"
  :options="[{ label: '6mo', value: 6 }, { label: '12mo', value: 12 }]" />
```

**Props:** `modelValue`, `label`, `variant` (switch/checkbox/button-group),
`options` (button-group only), `dense`, `disabled`
**Slots:** `default` — optional rich label content (replaces `label` prop when used).
Supports slot content for checkbox variant where some `q-checkbox` instances have
inline label markup.

### BasilList + BasilListItem

```html
<BasilList separator>
  <BasilListItem clickable @click="openRule(rule)">
    <template #avatar><BasilIcon name="rule" /></template>
    <template #label>Grocery stores</template>
    <template #caption>merchant_name contains "Kroger"</template>
    <template #side><BasilIcon name="chevron_right" /></template>
  </BasilListItem>
</BasilList>
```

**BasilList props:** `separator`
**BasilListItem props:** `clickable`, `active`, `disabled`, `dense`
**BasilListItem slots:** `avatar`, `default` (or `label` + `caption`), `side`

### BasilTabs + BasilTab

```html
<BasilTabs v-model="activeTab">
  <BasilTab name="budget" icon="account_balance_wallet" label="Budget" to="/budget" />
  <BasilTab name="trends" icon="bar_chart" label="Trends" to="/trends" />
</BasilTabs>
```

**BasilTabs props:** `modelValue`, `vertical`
**BasilTab props:** `name`, `label`, `icon`, `to`, `disabled`

Active tab indicator bar positioned via CSS transform.

### BasilTable

```html
<BasilTable
  :columns="columns"
  :rows="visibleTransactions"
  :virtual-scroll="true"
  row-key="id"
  @row-click="openDialog"
>
  <template #body-cell-merchant="{ row }">
    <span>{{ row.merchant_name }}</span>
  </template>
</BasilTable>
```

**Props:** `columns` (array of `{ name, label, field, align }`), `rows`, `rowKey`,
`virtualScroll`, `rowHeight`
**Slots:** `body-cell-[name]`, `header`, `empty`

Virtual scrolling via `@tanstack/vue-virtual` internally.

### BasilTooltip

```html
<BasilButton icon="delete" variant="icon">
  <BasilTooltip>Delete this rule</BasilTooltip>
</BasilButton>
```

**Props:** `delay` (default 400ms), `position` (top/bottom/left/right, default top)

### Composables

**`useScreen()`**
```js
// Composition API
const { isMobile, isDesktop, width } = useScreen()

// Options API — import the reactive singleton directly
import { screen } from '@/composables/useScreen'
computed: {
  isMobile() { return screen.isMobile }
}
```
`isMobile` is `true` when viewport < 600px. Uses `matchMedia` listener.
Exports both a composable (`useScreen()`) and a reactive singleton (`screen`)
so Options API components (BudgetView, PullToRefresh) can consume it without
refactoring to Composition API.

**`useToast()`**
```js
// Composition API
const toast = useToast()
toast.show({ message: 'Rule saved', type: 'positive', timeout: 1500 })
toast.error('Sync failed')
toast.success('Done')

// Options API / non-component code — import singleton directly
import { toast } from '@/composables/useToast'
toast.success('Rule saved')
```
Exports both a composable and a singleton. The existing `notifyUser()` wrapper in
`frontend/src/api.js` becomes the migration bridge: rewrite its internals from
`Notify.create()` to `toast.show()`, and all call sites that use `notifyUser()`
work unchanged. The ~8 `this.$q.notify()` calls in BudgetView get replaced with
direct `toast.*` calls. Shared utilities that accept a `notify` callback
(e.g., `applyMerchantRuleToStore`) switch to importing the toast singleton.

**`useGesture(el, options)`**
```js
useGesture(trayRef, {
  direction: 'vertical',
  onStart(state) { },
  onMove(state) { /* state.deltaY, state.velocityY */ },
  onEnd(state) { /* state.swipedDown, state.distance */ },
  threshold: 10,
})
```
Handles pointer events, touch vs mouse, velocity calculation, direction locking.

### CSS Utilities (`basil-utilities.css`)

Most Quasar utility classes (~97 spacing + ~16 responsive) get absorbed into
component BEM styles during migration. The following small set remains for
genuinely one-off template-level adjustments:

**Responsive visibility** (replaces `gt-xs`, `lt-sm`, `lt-md`):
```css
@media (max-width: 599px) { .basil-desktop-only { display: none !important; } }
@media (min-width: 600px)  { .basil-mobile-only  { display: none !important; } }
```

**Spacing** (only the most-used, maps to `--basil-space-*` tokens):
```css
.basil-mt-1 { margin-top: var(--basil-space-1); }    /* 4px */
.basil-mt-2 { margin-top: var(--basil-space-2); }    /* 8px */
.basil-mb-2 { margin-bottom: var(--basil-space-2); }
.basil-mb-3 { margin-bottom: var(--basil-space-3); }  /* 12px */
.basil-pa-3 { padding: var(--basil-space-3); }
.basil-pa-4 { padding: var(--basil-space-4); }        /* 16px */
.basil-gap-2 { gap: var(--basil-space-2); }
.basil-gap-3 { gap: var(--basil-space-3); }
```

**Layout:**
```css
.basil-spacer { flex: 1; }
.basil-full-width { width: 100%; }
```

This is intentionally small. If a utility gets used more than 2-3 times for the
same purpose, it should become part of a component's BEM styles instead.

---

## File Organization

```
frontend/src/
├── components/
│   ├── basil/                    ← new: library components
│   │   ├── BasilButton.vue
│   │   ├── BasilCard.vue
│   │   ├── BasilSelect.vue
│   │   ├── BasilToggle.vue
│   │   ├── BasilList.vue
│   │   ├── BasilListItem.vue
│   │   ├── BasilTabs.vue
│   │   ├── BasilTab.vue
│   │   ├── BasilTable.vue
│   │   ├── BasilTooltip.vue
│   │   ├── BasilChip.vue
│   │   ├── BasilBadge.vue
│   │   ├── BasilProgress.vue
│   │   ├── BasilSkeleton.vue
│   │   ├── BasilSpinner.vue
│   │   ├── BasilSeparator.vue
│   │   ├── BasilExpansion.vue
│   │   ├── BasilToast.vue
│   │   └── index.js              ← barrel export
│   ├── BasilInput.vue            ← stays (established)
│   ├── BasilAmount.js            ← stays
│   ├── BasilSearch.js            ← stays
│   ├── BasilText.js              ← stays
│   ├── BasilNote.js              ← stays
│   ├── BasilKeyboard.vue         ← stays
│   ├── BasilTray.vue             ← stays (rewritten internally)
│   ├── BasilConfirmTray.vue      ← stays
│   └── ...
├── composables/                  ← new directory
│   ├── useScreen.js
│   ├── useToast.js
│   └── useGesture.js
├── styles/
│   ├── tokens.css                ← unchanged
│   ├── basil-keyboard.css        ← unchanged
│   ├── basil-components.css      ← new: all basil/ component styles
│   ├── basil-shell.css           ← new: app layout
│   ├── basil-utilities.css       ← new: spacing fallback utilities
│   ├── dialogs.css               ← unchanged
│   ├── icons.css                 ← new: Material Icons @font-face
│   ├── quasar.sass               ← DELETED (phase 5)
│   ├── quasar-overrides.css      ← DELETED (phase 5)
│   └── quasar.variables.sass     ← DELETED (phase 5)
```

Existing Basil components stay in `components/` root — moving them would change
every import path for no functional gain.

---

## Migration Sequence

### Phase 0: Foundation

Build the infrastructure that all subsequent phases depend on.

- `composables/useScreen.js` — reactive breakpoint helper
- `composables/useGesture.js` — shared drag/swipe primitive
- `composables/useToast.js` — toast queue + programmatic API
- `styles/basil-shell.css` — app layout CSS (header, footer, drawer, main)
- `styles/basil-utilities.css` — small fallback spacing classes
- `styles/icons.css` + Material Icons woff2 — self-hosted icon font
- `BasilToast.vue` — toast container, mounted in App.vue

All additive. No Quasar code touched. No risk.

### Phase 1: Leaf components

Components with no children and no dependencies on other new Basil components.
High instance count but mechanically simple per swap.

- `BasilButton` — 100 instances
- `BasilIcon` — 65 instances (near-trivial: `<span class="material-icons">`)
- `BasilSpinner` — 5 instances
- `BasilProgress` — 4 instances
- `BasilSkeleton` — 13 instances
- `BasilSeparator` — 2 instances
- `BasilChip` — 5 instances
- `BasilBadge` — 2 instances

After this phase: all Quasar "atom" components are gone.

### Phase 2: Container components

Components that wrap content via slots.

- `BasilCard` — 40 instances (card + section + actions)
- `BasilList` + `BasilListItem` — 104 instances of nested Quasar list markup.
  **Largest single effort** — collapsing verbose `q-item > q-item-section > q-item-label`
  into flat slot-based API.
- `BasilExpansion` — 1 instance
- `BasilTooltip` — 11 instances

### Phase 3: Interactive components

Components with complex state and behavior. Intertwined — build together.

- `BasilSelect` — 20 instances. Desktop dropdown + mobile BasilTray bottom sheet.
- `BasilToggle` — 22 instances (switch + checkbox + button-group variants).
- `BasilTray` rewrite — swap `q-dialog` for native `<dialog>`. Own backdrop,
  focus trap, escape-to-close, body scroll lock. Wire `useGesture` for drag-to-dismiss.

Order: Tray rewrite first (Select depends on it), then Select, then Toggle.
BasilTray rewrite must wire `useScreen()` (from Phase 0) for mobile/desktop branching —
this replaces the current `$q.screen.lt.sm` dependency.

Also in this phase:
- Refactor `SwipeReveal.vue` to consume `useGesture()` (currently uses inline pointer tracking).
- Migrate the last `q-input` in `DialogComponent.vue` to `BasilInput`.

### Phase 4: Navigation + Table

Highest-risk phase — touches the app shell.

- `BasilTabs` + `BasilTab` — replaces header + footer nav
- `BasilTable` — transaction table with `@tanstack/vue-virtual`
- **App.vue shell migration** — replace `q-layout`/`q-header`/`q-footer`/`q-drawer`
  with semantic HTML (`<header>`, `<main>`, `<nav>`) + `basil-shell.css`.
  Drawer interior also converts from `q-list`/`q-item` to `BasilList`/`BasilListItem`.
- Replace `q-page` wrapper in `PrivacyView.vue` with plain `<div>`.
- Delete `HelloWorld.vue` if unused, otherwise replace its `q-page` wrapper.

Last because if the shell breaks, the whole app breaks. By this point every inner
component is already Basil.

### Phase 5: Cleanup

Remove all Quasar traces. Victory lap.

- Remove `quasar` and `@quasar/extras` from `package.json`
- Delete `quasar-user-options.js`, `quasar.sass`, `quasar-overrides.css`,
  `quasar.variables.sass`
- Remove Quasar Vite plugin from build config
- Remove Quasar plugin registration from `main.js` (includes `Dialog` and `Loading`
  plugins — both unused but still imported in `quasar-user-options.js`)
- Remove all `v-close-popup` directives (~15)
- Remove all `v-ripple` directives (~6)
- Remove all `$q` references
- Update `DESIGN.md` CSS load order section (no longer references `quasar-user-options.js`)
- Update `CLAUDE.md` if any shared utility references changed
- Verify: build passes, dark mode works, mobile layout correct, all views render

---

## What Gets Deleted

**npm packages removed:**
- `quasar`
- `@quasar/extras`
- `@quasar/vite-plugin` (devDependency)

**npm package added:**
- `@tanstack/vue-virtual`

**Files deleted:**
- `frontend/src/quasar-user-options.js`
- `frontend/src/styles/quasar.sass`
- `frontend/src/styles/quasar.variables.sass`
- `frontend/src/styles/quasar-overrides.css`

**Removed from `main.js`:** Quasar plugin registration
**Removed from `vite.config.js`:** Quasar Vite plugin
**Directives removed:** `v-close-popup` (~15), `v-ripple` (~2)

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| BasilTray rewrite breaks dialogs app-wide | Rewrite internals but keep the same prop/slot API. Existing consumers don't change. |
| App shell migration breaks layout | Phase 4 is last; screenshot-compare before/after at each breakpoint. |
| BasilSelect mobile UX worse than q-select | Build mobile path (BasilTray bottom sheet) first, test on real device before desktop. |
| Virtual scroll edge cases (iOS momentum, flicker) | Using `@tanstack/vue-virtual` — battle-tested. |
| Focus trap / accessibility regression | Use native `<dialog>` which handles focus trap natively. Add `aria-*` attributes to custom components. |
| Dark mode breaks | All components use `var(--basil-*)` tokens — dark mode works automatically. Test each phase in both themes. |
| Branch diverges too far from main | No active feature work on main during migration. If something urgent lands on main, rebase. |
