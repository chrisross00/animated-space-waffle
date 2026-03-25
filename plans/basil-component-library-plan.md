# Basil Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Quasar components, directives, CSS utilities, and plugins with custom Basil equivalents so the frontend boots with Vue + Basil only.

**Architecture:** Build new components in `frontend/src/components/basil/`, composables in `frontend/src/composables/`, and styles in `frontend/src/styles/`. Work on a dedicated feature branch. Each phase builds on the previous — foundation first, leaf components, containers, interactive components, app shell, then cleanup.

**Tech Stack:** Vue 3, CSS custom properties (`--basil-*` tokens), native `<dialog>` element, `@tanstack/vue-virtual`, `matchMedia` API, Pointer Events API.

**Spec:** `plans/basil-component-library.md` — the source of truth for all API designs and decisions.

**Branch:** `basil-library` — no pushes until all phases complete.

---

## File Map

### New files to create

```
frontend/src/
├── composables/
│   ├── useScreen.js          — reactive breakpoint singleton + composable
│   ├── useGesture.js         — shared drag/swipe pointer tracking
│   └── useToast.js           — toast queue singleton + composable
├── components/basil/
│   ├── index.js              — barrel export for global registration
│   ├── BasilButton.vue       — replaces q-btn
│   ├── BasilIcon.vue         — replaces q-icon
│   ├── BasilCard.vue         — replaces q-card/q-card-section/q-card-actions
│   ├── BasilSelect.vue       — replaces q-select
│   ├── BasilToggle.vue       — replaces q-toggle/q-checkbox/q-btn-toggle
│   ├── BasilList.vue         — replaces q-list
│   ├── BasilListItem.vue     — replaces q-item/q-item-section/q-item-label
│   ├── BasilTabs.vue         — replaces q-tabs
│   ├── BasilTab.vue          — replaces q-route-tab
│   ├── BasilTable.vue        — replaces q-table (with @tanstack/vue-virtual)
│   ├── BasilTooltip.vue      — replaces q-tooltip
│   ├── BasilChip.vue         — replaces q-chip
│   ├── BasilBadge.vue        — replaces q-badge
│   ├── BasilProgress.vue     — replaces q-linear-progress
│   ├── BasilSkeleton.vue     — replaces q-skeleton
│   ├── BasilSpinner.vue      — replaces q-spinner/q-spinner-dots
│   ├── BasilSeparator.vue    — replaces q-separator
│   ├── BasilExpansion.vue    — replaces q-expansion-item
│   └── BasilToast.vue        — toast container (mounted in App.vue)
├── styles/
│   ├── basil-shell.css       — app layout (header, footer, drawer, main)
│   ├── basil-components.css  — styles for all basil/ components
│   ├── basil-utilities.css   — spacing + responsive fallback utilities
│   └── icons.css             — self-hosted Material Icons @font-face
├── assets/
│   └── material-icons.woff2  — self-hosted icon font file
```

### Existing files to modify

```
frontend/src/main.js:117          — remove Quasar plugin, add Basil global registration
frontend/src/quasar-user-options.js — DELETE (phase 5)
frontend/src/api.js:1-9           — replace Notify import with toast singleton
frontend/src/App.vue              — full template rewrite (phase 4), mount BasilToast
frontend/src/components/BasilTray.vue        — rewrite q-dialog → native <dialog>
frontend/src/components/BasilInput.vue       — remove residual Quasar CSS deps
frontend/src/components/PullToRefresh.vue    — replace $q.screen, optionally use useGesture
frontend/src/components/SwipeReveal.vue      — refactor to use useGesture
frontend/src/components/DialogComponent.vue  — replace q-input, q-select, q-toggle, etc.
frontend/src/components/RuleEditorDialog.vue — replace q-select, q-toggle, q-btn, etc.
frontend/src/views/BudgetView.vue            — replace $q.notify, $q.screen, all q-* tags
frontend/src/views/TrendsView.vue            — replace q-btn-toggle, q-toggle, q-spinner
frontend/src/views/RulesView.vue             — replace q-list, q-item, q-skeleton, q-btn
frontend/src/views/AccountsView.vue          — replace q-item, q-skeleton, q-btn, v-ripple
frontend/src/views/ProfileView.vue           — replace q-card, q-item, q-toggle, q-btn
frontend/src/views/OnboardingView.vue        — replace q-btn, q-spinner, q-icon, q-card
frontend/src/views/BudgetPlannerView.vue     — replace q-card, q-btn, q-icon
frontend/src/views/MerchantBrowser.vue       — replace q-markup-table, q-btn, q-icon
frontend/src/views/TagsView.vue              — replace q-chip usage, v-ripple
frontend/src/views/PrivacyView.vue           — replace q-page wrapper
frontend/src/components/VenmoEnrichmentDialog.vue — replace q-expansion-item, q-markup-table
frontend/src/components/TagPicker.vue        — replace q-chip
frontend/src/components/SkeletonBudget.vue   — replace q-skeleton
frontend/src/styles/quasar.sass              — DELETE (phase 5)
frontend/src/styles/quasar-overrides.css     — DELETE (phase 5)
frontend/src/styles/quasar.variables.sass    — DELETE (phase 5)
frontend/vite.config.js:3,9                  — remove Quasar Vite plugin
frontend/package.json:14,18,26               — remove quasar deps, add @tanstack/vue-virtual
DESIGN.md                                    — update CSS load order section
```

---

## Phase 0: Foundation

Everything in this phase is additive — no Quasar code is touched. These are the
building blocks all subsequent phases depend on.

### Task 0.1: Create branch and install dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Create feature branch**

```bash
cd /Users/chris/Projects/animated-space-waffle
git checkout -b basil-library
```

- [ ] **Step 2: Install @tanstack/vue-virtual**

```bash
cd frontend && npm install @tanstack/vue-virtual
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p frontend/src/composables
mkdir -p frontend/src/components/basil
mkdir -p frontend/src/assets
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: create basil-library branch, add @tanstack/vue-virtual"
```

### Task 0.2: Create `useScreen` composable

**Files:**
- Create: `frontend/src/composables/useScreen.js`

- [ ] **Step 1: Write useScreen.js**

Exports a reactive singleton `screen` with `isMobile`, `isDesktop`, `width` properties.
Uses `window.matchMedia('(max-width: 599px)')` with an event listener.
Also exports a `useScreen()` composable that returns the same object (for Composition API consumers).

The singleton pattern means Options API components can `import { screen } from '@/composables/useScreen'`
and use `screen.isMobile` in computed properties without needing `setup()`.

```js
import { reactive } from 'vue'

const mql = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 599px)')
  : { matches: false, addEventListener() {} }

export const screen = reactive({
  isMobile: mql.matches,
  isDesktop: !mql.matches,
  width: typeof window !== 'undefined' ? window.innerWidth : 1024,
})

mql.addEventListener('change', (e) => {
  screen.isMobile = e.matches
  screen.isDesktop = !e.matches
})

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    screen.width = window.innerWidth
  })
}

export function useScreen() {
  return screen
}
```

- [ ] **Step 2: Verify module loads without error**

Run: `cd frontend && node -e "import('./src/composables/useScreen.js').then(() => console.log('OK')).catch(e => console.error(e))"`

If that fails due to ESM/import issues in Node, just verify the dev server still starts:
`npm run dev` — confirm no build errors in the terminal. Stop after confirming.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useScreen.js
git commit -m "feat: add useScreen composable (replaces \$q.screen)"
```

### Task 0.3: Create `useGesture` composable

**Files:**
- Create: `frontend/src/composables/useGesture.js`

- [ ] **Step 1: Write useGesture.js**

A composable that attaches pointer event listeners to a given element ref.
Tracks start position, delta, velocity, and direction. Calls user-provided callbacks.

Key features:
- `direction` option: `'vertical'` or `'horizontal'` — locks to axis after threshold
- `threshold` option: pixels before gesture activates (default 10)
- Calculates velocity from last 3 pointer positions
- `onStart(state)`, `onMove(state)`, `onEnd(state)` callbacks
- State object: `{ startX, startY, deltaX, deltaY, velocityX, velocityY, direction, distance, swipedDown, swipedUp, swipedLeft, swipedRight }`
- Returns a `stop()` function for manual cleanup
- Auto-cleanup via `onUnmounted` when called inside `setup()`. **Important:** When
  called from Options API `mounted()`, auto-cleanup does NOT fire — the consumer
  must call `stop()` in `beforeUnmount`. BasilTray.vue (Options API) will need this.
- Ignores gestures that start on scrollable children with `scrollTop > 0`

Refer to existing pointer tracking in:
- `BasilTray.vue` (drag-to-dismiss): lines ~44-65
- `PullToRefresh.vue` (pull-to-refresh): lines ~68-94
- `SwipeReveal.vue` (swipe-to-reveal): lines ~44-86

Extract the common patterns. The composable should handle the pointer event
lifecycle; consumers provide callbacks for their specific behavior.

- [ ] **Step 2: Verify module loads**

Confirm dev server starts without errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useGesture.js
git commit -m "feat: add useGesture composable (shared pointer tracking)"
```

### Task 0.4: Create `useToast` composable + `BasilToast` component

**Files:**
- Create: `frontend/src/composables/useToast.js`
- Create: `frontend/src/components/basil/BasilToast.vue`

- [ ] **Step 1: Write useToast.js**

Singleton toast queue. Max 3 visible toasts. Auto-dismiss with configurable timeout.

```js
import { reactive } from 'vue'

let id = 0
export const toastState = reactive({ items: [] })

function show({ message, type = 'info', timeout = 3000 }) {
  const toast = { id: ++id, message, type, timeout }
  toastState.items.push(toast)
  if (timeout > 0) {
    setTimeout(() => dismiss(toast.id), timeout)
  }
  // Keep max 3
  if (toastState.items.length > 3) {
    toastState.items.shift()
  }
}

function dismiss(toastId) {
  const idx = toastState.items.findIndex(t => t.id === toastId)
  if (idx !== -1) toastState.items.splice(idx, 1)
}

export const toast = { show, dismiss, success: (m) => show({ message: m, type: 'positive', timeout: 1500 }), error: (m) => show({ message: m, type: 'negative', timeout: 4000 }) }

export function useToast() { return toast }
```

- [ ] **Step 2: Write BasilToast.vue**

Renders `toastState.items` as a fixed-position stack above the bottom nav.
Each toast is a `<div>` with enter/leave transitions. Positioned using
`bottom: calc(var(--basil-bottom-nav-height, 0px) + var(--basil-space-3))`.

Uses Basil tokens: `--basil-surface-raised` for background, `--basil-text` for text,
semantic colors for type-based left border (`--basil-positive`, `--basil-negative`, etc.).

Structure:
```html
<template>
  <Teleport to="body">
    <TransitionGroup name="basil-toast" tag="div" class="basil-toast-container">
      <div v-for="item in toastState.items" :key="item.id"
           class="basil-toast" :class="`basil-toast--${item.type}`">
        {{ item.message }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>
```

- [ ] **Step 3: Add BasilToast styles to basil-components.css**

Create `frontend/src/styles/basil-components.css` with toast styles.
Position container fixed bottom-center. Toast items: surface-raised background,
border-radius-md, shadow-md, basil-space-3 padding. Enter from bottom with opacity.

- [ ] **Step 4: Mount BasilToast in App.vue**

Add `<BasilToast />` to the App.vue template (near the end, inside the root element).
Import the component. This is additive — does not change existing Quasar markup.

- [ ] **Step 5: Verify toast works**

Temporarily add a test call in a mounted hook or browser console.
Confirm it renders, auto-dismisses, and is positioned above the mobile nav.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/composables/useToast.js frontend/src/components/basil/BasilToast.vue frontend/src/styles/basil-components.css frontend/src/App.vue
git commit -m "feat: add BasilToast component + useToast composable"
```

### Task 0.5: Self-host Material Icons

**Files:**
- Create: `frontend/src/styles/icons.css`
- Create: `frontend/src/assets/material-icons.woff2`

- [ ] **Step 1: Download Material Icons woff2**

The font file is already in `node_modules/@quasar/extras/material-icons/`.
Copy it to the assets directory:

```bash
cp frontend/node_modules/@quasar/extras/material-icons/web-font/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2 frontend/src/assets/material-icons.woff2
```

- [ ] **Step 2: Write icons.css**

```css
@font-face {
  font-family: 'Material Icons';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('../assets/material-icons.woff2') format('woff2');
}

.material-icons {
  font-family: 'Material Icons';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'liga';
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/icons.css frontend/src/assets/material-icons.woff2
git commit -m "feat: self-host Material Icons font (replaces @quasar/extras)"
```

### Task 0.6: Create CSS utility files

**Files:**
- Create: `frontend/src/styles/basil-utilities.css`
- Create: `frontend/src/styles/basil-shell.css`

- [ ] **Step 1: Write basil-utilities.css**

See spec "CSS Utilities" section for the exact classes. Includes:
- `.basil-desktop-only` / `.basil-mobile-only` — media query show/hide at 600px
- Spacing: `.basil-mt-1` through `.basil-pa-4`, `.basil-gap-2`, `.basil-gap-3`
- Layout: `.basil-spacer`, `.basil-full-width`

- [ ] **Step 2: Write basil-shell.css**

The app layout CSS that replaces `q-layout`, `q-header`, `q-footer`, `q-drawer`,
`q-page-container`, `q-page`. Uses semantic class names.

Study the current App.vue template (`q-layout view="hHh Lpr lFf"`) to understand
the layout contract:
- Fixed header at top
- Fixed footer at bottom (mobile only)
- Scrollable main area between them
- Slide-out drawer from left
- Safe-area insets for mobile notch/home indicator

Key classes to define:
```css
.basil-shell { /* full viewport, flex column */ }
.basil-header { /* fixed top, z-index above content */ }
.basil-main { /* flex: 1, overflow-y: auto, scroll snap for pull-to-refresh */ }
.basil-footer { /* fixed bottom on mobile, hidden on desktop */ }
.basil-drawer { /* fixed left, slide-in transform, z-index above main */ }
.basil-drawer-backdrop { /* fixed overlay when drawer is open */ }
```

Reference `frontend/src/App.vue` for current layout behavior.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/basil-utilities.css frontend/src/styles/basil-shell.css
git commit -m "feat: add basil-utilities.css and basil-shell.css"
```

### Task 0.7: Create barrel export + global registration

**Files:**
- Create: `frontend/src/components/basil/index.js`
- Modify: `frontend/src/main.js`

- [ ] **Step 1: Write index.js**

For now, just export BasilToast. Other components will be added as they're built.
Each Phase 1/2/3 task adds new components to this file.

```js
export { default as BasilToast } from './BasilToast.vue'
```

- [ ] **Step 2: Add global registration to main.js**

Add a `registerBasilComponents` function that imports all Basil components from
the barrel and registers them globally via `app.component()`. This way swap tasks
don't need per-file imports for the ~300+ instances.

```js
import * as BasilComponents from './components/basil'

// After app is created, before mount:
Object.entries(BasilComponents).forEach(([name, component]) => {
  app.component(name, component)
})
```

Also register existing Basil components globally (BasilInput, BasilTray, etc.)
so they don't need per-file imports either. Add them to the barrel or register
separately.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/basil/index.js frontend/src/main.js
git commit -m "feat: add basil component barrel export + global registration"
```

---

## Phase 1: Leaf Components

Build and swap the simplest components — those with no child component dependencies.
For each: build the component, add its styles to `basil-components.css`, then swap
all instances across the codebase.

**Important:** When swapping instances, also replace any Quasar CSS utility classes
on the same elements (e.g., `class="q-mb-md"` → absorb into the component's BEM
class or use a basil utility). Don't leave orphaned Quasar classes.

### Task 1.1: BasilIcon

**Files:**
- Create: `frontend/src/components/basil/BasilIcon.vue`
- Modify: `frontend/src/styles/basil-components.css`

- [ ] **Step 1: Write BasilIcon.vue**

Near-trivial wrapper:

```vue
<template>
  <span class="basil-icon material-icons" :class="sizeClass" :style="sizeStyle">
    {{ name }}
  </span>
</template>

<script>
export default {
  name: 'BasilIcon',
  props: {
    name: { type: String, required: true },
    size: { type: String, default: null },
    color: { type: String, default: null },
  },
  computed: {
    sizeClass() { /* map 'sm', 'md', 'lg' to BEM modifier classes */ },
    sizeStyle() {
      const s = {}
      if (this.size && !['sm', 'md', 'lg'].includes(this.size)) s.fontSize = this.size
      if (this.color) s.color = `var(--basil-${this.color}, ${this.color})`
      return s
    },
  },
}
</script>
```

The `color` prop maps to `--basil-*` tokens first (e.g., `color="primary"` → `var(--basil-green)`),
falling back to the raw value. Check how `q-icon color="primary"` resolves in the
current Quasar overrides and match that behavior.

- [ ] **Step 2: Add styles to basil-components.css**

```css
.basil-icon { /* inherits from .material-icons, add size modifiers */ }
.basil-icon--sm { font-size: 18px; }
.basil-icon--lg { font-size: 32px; }
```

- [ ] **Step 3: Add to barrel export**

Update `frontend/src/components/basil/index.js`.

- [ ] **Step 4: Swap all ~65 `q-icon` instances**

Search: `<q-icon` across all `.vue` files in `frontend/src/`.
Replace each with `<BasilIcon name="..." />`.

Map Quasar props:
- `name="sync"` → `name="sync"` (same)
- `size="1.25rem"` → `size="1.25rem"` (same)
- `color="primary"` → `color="primary"` (maps via token)

Import `BasilIcon` in each file that uses it (or register globally in index.js).

- [ ] **Step 5: Verify all views render correctly**

Run dev server, navigate to each view that had icons, confirm they display.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BasilIcon, replace all q-icon instances"
```

### Task 1.2: BasilButton

**Files:**
- Create: `frontend/src/components/basil/BasilButton.vue`
- Modify: `frontend/src/styles/basil-components.css`

- [ ] **Step 1: Write BasilButton.vue**

See spec for full API. Key implementation details:

- Renders `<router-link>` when `to` prop is set, `<button>` otherwise
- `variant` controls visual style:
  - `primary` (default): filled green background, white text
  - `flat`: transparent bg, text-colored, no shadow
  - `icon`: round, no label, icon only
- `color` maps to semantic tokens: `primary` → `--basil-green`, `negative` → `--basil-negative`
- `loading` shows `BasilSpinner` (build a simple inline spinner until Task 1.4)
- `dense` reduces padding
- Click animation: `transform: scale(0.96)` on `:active` (matches current Quasar override)

Study current `q-btn` usage patterns in the codebase:
- `<q-btn unelevated color="primary" label="Save" />` → `<BasilButton label="Save" />`
- `<q-btn flat label="Cancel" />` → `<BasilButton label="Cancel" variant="flat" />`
- `<q-btn flat round dense icon="close" />` → `<BasilButton icon="close" variant="icon" />`
- `<q-btn ... to="/profile" />` → `<BasilButton ... to="/profile" />`

- [ ] **Step 2: Add button styles to basil-components.css**

Style the `.basil-btn`, `.basil-btn--flat`, `.basil-btn--icon`, `.basil-btn--dense` classes.
Use `--basil-*` tokens for all colors. Include `:active` scale transform.
Include `:disabled` opacity state. Include `.basil-btn--loading` with spinner.

- [ ] **Step 3: Add to barrel export**

- [ ] **Step 4: Swap all ~100 `q-btn` instances**

This is the highest-volume swap. Work file by file.

Map Quasar props:
- `unelevated color="primary"` → (default, no extra props)
- `flat` → `variant="flat"`
- `flat round dense` → `variant="icon"`
- `icon="close"` → `icon="close"`
- `label="Save"` → `label="Save"`
- `:loading="saving"` → `:loading="saving"`
- `:disable="disabled"` → `:disabled="disabled"` (note: Quasar uses `disable`, we use `disabled`)
- `to="/path"` → `to="/path"`
- `color="negative"` → `color="negative"`
- `@click="handler"` → `@click="handler"` (same)
- `v-close-popup` → remove (will be handled by BasilTray close mechanism in Phase 3)

**Important:** Buttons with `v-close-popup` — leave the directive in place during
this phase. Quasar is still installed so the directive remains registered and
functional. It will be harmless on BasilButton elements (Quasar's directive looks
for a parent q-dialog, which still exists until Phase 3). Full removal happens
in Phase 5 Task 5.3, after BasilTray's own close mechanism replaces it.

Files to touch (in rough order, largest first):
1. `BudgetView.vue` (~15 q-btn)
2. `App.vue` (~5 q-btn)
3. `DialogComponent.vue` (~8 q-btn)
4. `RuleEditorDialog.vue` (~6 q-btn)
5. `BudgetPlannerView.vue` (~10 q-btn)
6. `OnboardingView.vue` (~4 q-btn)
7. `AccountsView.vue` (~6 q-btn)
8. `RulesView.vue` (~3 q-btn)
9. `ProfileView.vue` (~3 q-btn)
10. `MerchantBrowser.vue` (~3 q-btn)
11. `TrendsView.vue` (~2 q-btn)
12. Remaining files with 1-2 instances

- [ ] **Step 5: Verify all views render correctly**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BasilButton, replace all q-btn instances"
```

### Task 1.3: BasilProgress

**Files:**
- Create: `frontend/src/components/basil/BasilProgress.vue`

- [ ] **Step 1: Write BasilProgress.vue**

Simple percentage bar:

```vue
<template>
  <div class="basil-progress" :class="{ 'basil-progress--indeterminate': indeterminate }">
    <div class="basil-progress__bar" :style="barStyle" />
  </div>
</template>

<script>
export default {
  name: 'BasilProgress',
  props: {
    value: { type: Number, default: 0 },        // 0-1
    color: { type: String, default: 'primary' },
    indeterminate: { type: Boolean, default: false },
    size: { type: String, default: null },       // height override
  },
  computed: {
    barStyle() {
      return {
        width: this.indeterminate ? '100%' : `${this.value * 100}%`,
        backgroundColor: `var(--basil-${this.color}, var(--basil-green))`,
        ...(this.size ? { height: this.size } : {}),
      }
    },
  },
}
</script>
```

- [ ] **Step 2: Add styles — track bg, bar fill, indeterminate animation**

- [ ] **Step 3: Swap ~4 `q-linear-progress` instances**

Map: `value` → `value`, `color` → `color`, `indeterminate` → `indeterminate`.
Files: `App.vue` (loading bar), `BudgetView.vue` (category progress bars).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add BasilProgress, replace q-linear-progress"
```

### Task 1.4: BasilSpinner

**Files:**
- Create: `frontend/src/components/basil/BasilSpinner.vue`

- [ ] **Step 1: Write BasilSpinner.vue**

CSS-only spinner (rotating border):

```vue
<template>
  <span class="basil-spinner" :style="spinnerStyle" />
</template>

<script>
export default {
  name: 'BasilSpinner',
  props: {
    size: { type: String, default: '1.5rem' },
    color: { type: String, default: 'primary' },
  },
  computed: {
    spinnerStyle() {
      return {
        width: this.size,
        height: this.size,
        borderColor: `var(--basil-${this.color}, var(--basil-green))`,
      }
    },
  },
}
</script>
```

- [ ] **Step 2: Add spinner CSS animation to basil-components.css**

- [ ] **Step 3: Swap ~5 `q-spinner` / `q-spinner-dots` instances**

Files: `OnboardingView.vue`, `TrendsView.vue`, `BudgetView.vue`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add BasilSpinner, replace q-spinner"
```

### Task 1.5: BasilSkeleton

**Files:**
- Create: `frontend/src/components/basil/BasilSkeleton.vue`

- [ ] **Step 1: Write BasilSkeleton.vue**

Props: `type` (text/rect/circle), `width`, `height`.
CSS shimmer animation using `background: linear-gradient` + `@keyframes`.

- [ ] **Step 2: Swap ~13 `q-skeleton` instances**

Files: `AccountsView.vue`, `RulesView.vue`, `SkeletonBudget.vue`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add BasilSkeleton, replace q-skeleton"
```

### Task 1.6: Replace absorbed Quasar components (q-banner, q-slide-transition, q-space)

**Files:**
- Modify: `frontend/src/views/AccountsView.vue` (q-banner, q-space)
- Modify: `frontend/src/views/MerchantBrowser.vue` (q-banner)
- Modify: `frontend/src/components/RuleEditorDialog.vue` (q-slide-transition)

These Quasar components are too trivial for Basil equivalents. Replace with
plain HTML/CSS.

- [ ] **Step 1: Replace `q-banner` (2 instances)**

In `AccountsView.vue` and `MerchantBrowser.vue`, replace:
```html
<q-banner ...>content</q-banner>
```
With:
```html
<div class="basil-banner">content</div>
```
Add `.basil-banner` styles to `basil-components.css` (padding, bg color, border-radius).

- [ ] **Step 2: Replace `q-slide-transition` (1 instance)**

In `RuleEditorDialog.vue`, replace:
```html
<q-slide-transition>
  <div v-show="expanded">...</div>
</q-slide-transition>
```
With Vue's built-in:
```html
<Transition name="basil-slide">
  <div v-show="expanded">...</div>
</Transition>
```
Add `.basil-slide-enter-active`, `.basil-slide-leave-active` CSS transitions.

- [ ] **Step 3: Replace `q-space` (1 instance)**

In `AccountsView.vue`, replace `<q-space />` with `<div class="basil-spacer" />`
(defined in `basil-utilities.css` as `flex: 1`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace q-banner, q-slide-transition, q-space with plain HTML"
```

### Task 1.7: BasilSeparator, BasilChip, BasilBadge

**Files:**
- Create: `frontend/src/components/basil/BasilSeparator.vue`
- Create: `frontend/src/components/basil/BasilChip.vue`
- Create: `frontend/src/components/basil/BasilBadge.vue`

- [ ] **Step 1: Write BasilSeparator.vue**

Trivial: `<hr class="basil-separator" />` with a token-based border color.

- [ ] **Step 2: Write BasilChip.vue**

Props: `label`, `color`, `removable`, `dense`, `clickable`.
Emits: `remove`, `click`.
Renders as a `<span>` with rounded bg, optional close icon.

Study current `q-chip` usage in `TagPicker.vue`, `TagsView.vue`, `BudgetView.vue`.

- [ ] **Step 3: Write BasilBadge.vue**

Floating badge: absolute-positioned dot/number on parent element.
Props: `value`, `color`, `floating`.

Study `q-badge` usage in `App.vue` (sync error count).

- [ ] **Step 4: Add styles for all three to basil-components.css**

- [ ] **Step 5: Swap all instances** (2 separator + 5 chip + 2 badge)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BasilSeparator, BasilChip, BasilBadge"
```

---

## Phase 2: Container Components

### Task 2.1: BasilCard

**Files:**
- Create: `frontend/src/components/basil/BasilCard.vue`

- [ ] **Step 1: Write BasilCard.vue**

See spec for slot API (`#header`, `default`, `#actions`).
Uses `display: flex; flex-direction: column`.
Applies existing `basil-card-head` / `basil-card-label` / `basil-card-period` patterns
as default styling for the `#header` slot wrapper.

Props: `flat` (no shadow), `bordered` (border instead of shadow).

- [ ] **Step 2: Add card styles to basil-components.css**

Tokens: `--basil-surface` bg, `--basil-shadow-md` shadow, `--basil-radius-md` border radius.
Card section: `--basil-space-4` padding.
Card actions: flex row, `justify-content: flex-end`, gap.

- [ ] **Step 3: Swap all ~40 card instances**

Map Quasar patterns:
- `<q-card>` → `<BasilCard>`
- `<q-card flat>` → `<BasilCard flat>`
- `<q-card-section>` → default slot content (remove the wrapper)
- `<q-card-actions align="right">` → `<template #actions>`
- Multiple `<q-card-section>` within one card → content in default slot,
  use `<div class="basil-card__section">` if visual separation needed

Work file by file. Largest files first:
1. `BudgetView.vue`
2. `DialogComponent.vue`
3. `RuleEditorDialog.vue`
4. `BudgetPlannerView.vue`
5. `OnboardingView.vue`
6. `ProfileView.vue`
7. `RulesView.vue`

- [ ] **Step 4: Verify all card-based layouts**

Check: dialog cards render correctly, budget cards have proper spacing,
dark mode surfaces are correct.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add BasilCard, replace all q-card instances"
```

### Task 2.2: BasilList + BasilListItem

**Files:**
- Create: `frontend/src/components/basil/BasilList.vue`
- Create: `frontend/src/components/basil/BasilListItem.vue`

This is the **largest single migration effort**. The current Quasar list pattern
is deeply nested:

```html
<!-- Current Quasar pattern -->
<q-list>
  <q-item clickable v-ripple @click="handler">
    <q-item-section avatar>
      <q-icon name="rule" />
    </q-item-section>
    <q-item-section>
      <q-item-label>Primary text</q-item-label>
      <q-item-label caption>Secondary text</q-item-label>
    </q-item-section>
    <q-item-section side>
      <q-icon name="chevron_right" />
    </q-item-section>
  </q-item>
</q-list>
```

Becomes:

```html
<!-- New Basil pattern -->
<BasilList>
  <BasilListItem clickable @click="handler">
    <template #avatar><BasilIcon name="rule" /></template>
    <template #label>Primary text</template>
    <template #caption>Secondary text</template>
    <template #side><BasilIcon name="chevron_right" /></template>
  </BasilListItem>
</BasilList>
```

- [ ] **Step 1: Write BasilList.vue**

Simple wrapper: renders a `<div class="basil-list">` with optional separators
between items via CSS `& > .basil-list-item + .basil-list-item` border.

- [ ] **Step 2: Write BasilListItem.vue**

Flex row layout: avatar | content (label + caption) | side.
Slots: `avatar`, `label`, `caption`, `side`, `default` (replaces label+caption for custom content).
Props: `clickable` (adds hover/active states, cursor pointer), `active`, `disabled`, `dense`.

- [ ] **Step 3: Add list styles to basil-components.css**

Items: flex row, align-center, `--basil-space-3` padding.
Avatar section: fixed width (40px), flex-shrink: 0.
Content section: flex: 1, min-width: 0 (for text truncation).
Side section: flex-shrink: 0, text-secondary color.
Clickable: cursor pointer, hover bg using `--basil-surface-alt`.
Active: bg using `--basil-green-subtle`.

- [ ] **Step 4: Swap list instances file by file**

Files (in order of list density):
1. `App.vue` (drawer nav: lines ~66-125) — ~8 q-item instances
2. `RulesView.vue` — rules list
3. `AccountsView.vue` — account list items
4. `DialogComponent.vue` — category option list (lines ~232-238)
5. `ProfileView.vue` — settings list items
6. `OnboardingView.vue` — account selection list

For each, collapse the `q-item > q-item-section > q-item-label` nesting into the
flat slot pattern. Remove `v-ripple` directives (ripple effect can be added as a
CSS pseudo-element on `.basil-list-item--clickable` if desired).

- [ ] **Step 5: Verify all list-based views**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add BasilList + BasilListItem, replace all q-list/q-item"
```

### Task 2.3: BasilTooltip + BasilExpansion

**Files:**
- Create: `frontend/src/components/basil/BasilTooltip.vue`
- Create: `frontend/src/components/basil/BasilExpansion.vue`

- [ ] **Step 1: Write BasilTooltip.vue**

Shows on hover/focus after a delay. Positioned absolute relative to parent.
Props: `delay` (default 400), `position` (top/bottom/left/right, default top).
Uses `<Teleport to="body">` to avoid overflow clipping issues.

Implementation:
- `mouseenter` / `focus` → start delay timer
- `mouseleave` / `blur` → cancel timer, hide
- Position calculation: getBoundingClientRect of parent, place tooltip accordingly
- Arrow pseudo-element pointing at parent

- [ ] **Step 2: Write BasilExpansion.vue**

Collapsible section with header + animated body.
Props: `modelValue` (boolean, controls open/closed), `label`, `icon`.
Emits: `update:modelValue`.
Uses CSS `max-height` transition for smooth expand/collapse.

Only 1 instance in `VenmoEnrichmentDialog.vue`.

- [ ] **Step 3: Add styles to basil-components.css**

Tooltip: dark bg (`--basil-surface-raised`), `--basil-radius-sm`, small text,
`--basil-shadow-sm`, z-index above dialogs.
Expansion: header row with chevron rotation animation, body with max-height transition.

- [ ] **Step 4: Swap all instances**

Tooltips (~11 instances): replace `<q-tooltip>text</q-tooltip>` with
`<BasilTooltip>text</BasilTooltip>`.

Expansion (1 instance): replace `<q-expansion-item>` in `VenmoEnrichmentDialog.vue`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add BasilTooltip + BasilExpansion, replace q-tooltip/q-expansion-item"
```

---

## Phase 3: Interactive Components

### Task 3.1: Rewrite BasilTray (native `<dialog>`)

**Files:**
- Modify: `frontend/src/components/BasilTray.vue`

This is the highest-risk single task. BasilTray is used by every dialog in the app.

- [ ] **Step 1: Read current BasilTray.vue thoroughly**

Understand every prop, slot, event, and behavior. Map which consumers depend on what.

- [ ] **Step 2: Rewrite template**

Replace `<q-dialog>` with native `<dialog>`:

```html
<dialog ref="dialogRef" class="basil-tray" :class="trayClasses" @close="onDialogClose">
  <div class="basil-tray__backdrop" @click="onBackdropClick" />
  <div ref="wrapRef" class="basil-tray__wrap" :class="wrapClasses">
    <slot />
  </div>
</dialog>
```

Key behavior to preserve:
- `v-model` binding (open/close)
- Mobile: bottom sheet with drag handle, max-height 94dvh, rounded top corners
- Desktop: centered dialog with `maxWidth` prop
- Drag-to-dismiss via `useGesture()` (replace inline pointer tracking)
- Keyboard padding (`--basil-keyboard-height`)
- Scrollable content awareness (don't dismiss while scrolling)
- `persistent` prop (prevent dismiss on backdrop click/swipe)

Key behavior to add:
- `dialog.showModal()` / `dialog.close()` for open/close
- Focus trap is automatic with `<dialog>` `showModal()`
- `::backdrop` styling for overlay
- Escape key handling via `<dialog>`'s native `cancel` event
- Body scroll lock when open (`overflow: hidden` on `<body>`)

Lifecycle events to preserve (consumers may depend on these):
- `@before-show` → emit before `showModal()` is called
- `@show` → emit after dialog is open (in `nextTick` after `showModal()`)
- `@before-hide` → emit before `close()` is called
- `@hide` → emit after dialog is closed

Check which consumers use these events — search for `@before-show`, `@show`,
`@before-hide`, `@hide` on `<BasilTray` and `<BasilConfirmTray` across the codebase.

- [ ] **Step 3: Replace `$q.screen.lt.sm` with `useScreen()`**

```js
import { screen } from '@/composables/useScreen'
// In computed:
isMobile() { return screen.isMobile }
```

- [ ] **Step 4: Wire `useGesture()` for drag-to-dismiss**

Replace the inline `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers with:

```js
import { useGesture } from '@/composables/useGesture'
// In mounted or setup:
useGesture(this.$refs.wrapRef, {
  direction: 'vertical',
  onMove: (state) => { /* apply translateY */ },
  onEnd: (state) => { if (state.swipedDown) this.close() else this.snapBack() },
  threshold: 10,
})
```

- [ ] **Step 5: Add tray dialog styles to basil-components.css**

Style the `<dialog>` element:
```css
dialog.basil-tray { border: none; padding: 0; background: transparent; max-width: none; max-height: none; }
dialog.basil-tray::backdrop { background: rgba(0,0,0,0.5); }
```

- [ ] **Step 6: Test every dialog in the app**

Open and close every dialog that uses BasilTray:
- Transaction edit (BudgetView)
- Category edit (BudgetView)
- Rule editor (RuleEditorDialog)
- Triage flow (BudgetView)
- Confirm tray (anywhere BasilConfirmTray is used)

Test on both mobile and desktop viewport sizes. Test dark mode.
Test drag-to-dismiss. Test escape key. Test persistent mode.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/BasilTray.vue frontend/src/styles/basil-components.css
git commit -m "feat: rewrite BasilTray with native dialog element"
```

### Task 3.2: BasilSelect

**Files:**
- Create: `frontend/src/components/basil/BasilSelect.vue`

- [ ] **Step 1: Write BasilSelect.vue**

See spec for full API.

Architecture:
- Trigger element: styled div showing selected value (or placeholder)
- Desktop: `<div class="basil-select__dropdown">` positioned absolute below trigger
- Mobile: opens a `<BasilTray>` with option list inside
- Uses `useScreen()` to decide which mode

Key features:
- `v-model` binding
- `options` array of objects or strings
- `optionLabel` / `optionValue` prop for object options
- `emitValue` — emit just the value field, not the whole object
- `filterable` — shows `BasilSearch` at top of dropdown/tray
- `#option` slot for custom rendering (see DialogComponent category conflict indicator)
- Click outside to close (desktop dropdown)
- Keyboard navigation (arrow keys, enter, escape)

- [ ] **Step 2: Add select styles to basil-components.css**

Trigger: looks like an input field (border, label, padding).
Dropdown: `--basil-surface-raised`, `--basil-shadow-lg`, max-height with scroll.
Option items: padding, hover state, active/selected state with checkmark.
Mobile tray: standard BasilTray bottom sheet with option list inside.

- [ ] **Step 3: Swap all ~20 `q-select` instances**

Map Quasar props:
- `v-model="category"` → `v-model="category"`
- `:options="categories"` → `:options="categories"`
- `option-label="name"` → `option-label="name"`
- `option-value="id"` → `option-value="id"`
- `emit-value` → `emit-value`
- `map-options` → not needed (BasilSelect always shows labels)
- `use-input` → `filterable`
- `@filter="filterFn"` → built-in filtering via `filterable` prop
- Custom option template → `#option` slot

Files with q-select:
1. `DialogComponent.vue` (~4 selects, including custom option slot)
2. `RuleEditorDialog.vue` (~8 selects for conditions)
3. `BudgetView.vue` (~3 selects in triage/bulk)
4. `BudgetPlannerView.vue` (~2 selects)
5. `MerchantBrowser.vue` (~2 selects)
6. `VenmoEnrichmentDialog.vue` (~1 select)

- [ ] **Step 4: Test all select interactions**

Test: option selection, filtering, mobile bottom sheet, desktop dropdown positioning,
custom option rendering in DialogComponent, keyboard navigation.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add BasilSelect, replace all q-select instances"
```

### Task 3.3: BasilToggle

**Files:**
- Create: `frontend/src/components/basil/BasilToggle.vue`

- [ ] **Step 1: Write BasilToggle.vue**

Three visual variants in one component:

**Switch variant** (default):
- Track (oval bg) + thumb (circle) that slides
- CSS transition on `transform: translateX()`
- Checked: green track, thumb slides right

**Checkbox variant:**
- Box with optional checkmark icon
- Checked: green bg with white checkmark

**Button-group variant (segmented control):**
- Row of buttons, one selected
- `modelValue` is the selected option's `value` (not boolean)
- `options` prop: `[{ label, value }]`

Uses `#default` slot for rich label content (checkbox variant).

- [ ] **Step 2: Add toggle styles to basil-components.css**

Switch: track 36x20, thumb 16x16, transition 150ms.
Checkbox: 18x18 box, 2px border, checkmark SVG or icon.
Button-group: inline-flex, shared border, active segment highlighted.
All variants: disabled opacity 0.5.

- [ ] **Step 3: Swap all instances**

Map:
- `<q-toggle v-model="x" label="Y" />` → `<BasilToggle v-model="x" label="Y" />`
- `<q-checkbox v-model="x" />` → `<BasilToggle v-model="x" variant="checkbox" />`
- `<q-btn-toggle v-model="x" :options="opts" />` → `<BasilToggle v-model="x" variant="button-group" :options="opts" />`

Quasar `q-toggle` uses `true-value`/`false-value` — check if any instances use these.
If so, handle in BasilToggle.

Files:
1. `TrendsView.vue` — q-btn-toggle (x2), q-toggle (x4)
2. `DialogComponent.vue` — q-toggle (x2), q-checkbox (x1)
3. `RuleEditorDialog.vue` — q-toggle (x8, condition activation)
4. `ProfileView.vue` — q-toggle (dark mode, settings)
5. `BudgetView.vue` — q-checkbox (bulk select)
6. `VenmoEnrichmentDialog.vue` — q-checkbox

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add BasilToggle, replace q-toggle/q-checkbox/q-btn-toggle"
```

### Task 3.4: Migrate $q.screen references in BudgetView + PullToRefresh

**Files:**
- Modify: `frontend/src/views/BudgetView.vue`
- Modify: `frontend/src/components/PullToRefresh.vue`

- [ ] **Step 1: Add `screen` import and computed property to BudgetView**

BudgetView is Options API. Add at top of `<script>`:
```js
import { screen } from '@/composables/useScreen'
```
Add to `computed`:
```js
isMobile() { return screen.isMobile },
isDesktop() { return screen.isDesktop },
```

- [ ] **Step 2: Replace all `$q.screen.lt.sm` in BudgetView template**

There are ~6 template references (lines ~474, 586-590, 2489). Replace each:
- `$q.screen.lt.sm` → `isMobile`
- `$q.screen.gt.xs` → `isDesktop`

- [ ] **Step 3: Replace `$q.screen` in PullToRefresh.vue**

Same pattern — import `screen` singleton, add computed, replace template/JS usage.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/BudgetView.vue frontend/src/components/PullToRefresh.vue
git commit -m "refactor: replace \$q.screen with useScreen in BudgetView + PullToRefresh"
```

### Task 3.5: SwipeReveal refactor + last q-input migration

**Files:**
- Modify: `frontend/src/components/SwipeReveal.vue`
- Modify: `frontend/src/components/DialogComponent.vue`

- [ ] **Step 1: Refactor SwipeReveal to use `useGesture()`**

Replace inline touch handlers (lines ~44-86) with `useGesture()` composable.
Keep the same visual behavior (swipe left to reveal action button).

- [ ] **Step 2: Replace last `q-input` in DialogComponent.vue**

Line ~55: date input. Replace with `<BasilInput>` or a native `<input type="date">`.
Check what the input is used for — if it's a date picker, a native date input
may be more appropriate than BasilInput.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SwipeReveal.vue frontend/src/components/DialogComponent.vue
git commit -m "refactor: SwipeReveal uses useGesture, last q-input migrated"
```

---

## Phase 4: Navigation + Table

### Task 4.1: BasilTabs + BasilTab

**Files:**
- Create: `frontend/src/components/basil/BasilTabs.vue`
- Create: `frontend/src/components/basil/BasilTab.vue`

- [ ] **Step 1: Write BasilTab.vue**

Props: `name`, `label`, `icon`, `to`, `disabled`.
Renders as a `<router-link>` (when `to` is set) or `<button>`.
Emits `click` for non-routed tabs.
Active state determined by parent BasilTabs v-model match or router active class.

- [ ] **Step 2: Write BasilTabs.vue**

Container that provides context to child BasilTab components.
Props: `modelValue` (active tab name).
Uses `provide/inject` to communicate active tab to children.
Renders horizontal tab bar with active indicator.

Active indicator: a `<div>` positioned under the active tab, animated via
`transform: translateX()` with `--basil-t-base` transition.

Must support both desktop (top bar) and mobile (bottom bar) layouts via CSS classes.

- [ ] **Step 3: Add tab styles to basil-components.css**

Desktop tabs: horizontal, inline-flex, text tabs.
Mobile tabs: fixed bottom, icon + label stacked vertically, safe-area padding.
Active indicator: 2px green bar under active tab.

- [ ] **Step 4: Do NOT swap yet** — tabs are swapped as part of the App.vue shell migration (Task 4.3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/basil/BasilTabs.vue frontend/src/components/basil/BasilTab.vue frontend/src/styles/basil-components.css
git commit -m "feat: add BasilTabs + BasilTab"
```

### Task 4.2: BasilTable

**Files:**
- Create: `frontend/src/components/basil/BasilTable.vue`

- [ ] **Step 1: Write BasilTable.vue**

Data-driven table with optional virtual scrolling.

Non-virtual mode: renders a standard `<table>` with `<thead>` and `<tbody>`.
Virtual mode: uses `@tanstack/vue-virtual` `useVirtualizer` to render only
visible rows, with a spacer element for scroll height.

Props: `columns`, `rows`, `rowKey`, `virtualScroll`, `rowHeight` (default 48).
Slots: `body-cell-[name]` for custom cell content, `header`, `empty`.
Emits: `row-click`.

Study current `q-table` usage in `BudgetView.vue` to understand:
- Which columns are defined
- How virtual scroll is configured
- What custom cell templates exist
- How row click events are handled
- How "load more" / infinite scroll works

- [ ] **Step 2: Add table styles to basil-components.css**

Use existing `basil-txn-table` class patterns where they exist.
Table: full-width, border-collapse.
Header: sticky, surface-alt bg.
Rows: border-bottom, hover state for clickable.
Mobile: responsive column hiding via `basil-desktop-only` class.

- [ ] **Step 3: Also handle `q-markup-table` replacement**

`q-markup-table` (3 instances in VenmoEnrichmentDialog) is just a styled `<table>`.
Replace with plain `<table class="basil-markup-table">` and add basic table styles.

- [ ] **Step 4: Replace standalone `q-virtual-scroll` in BudgetView**

BudgetView uses `q-virtual-scroll` (not inside q-table) for the transaction list.
Replace with `@tanstack/vue-virtual` used directly as a composable.

- [ ] **Step 5: Swap the `q-table` instance in BudgetView**

Replace the Show All `q-table` with `<BasilTable>`.

- [ ] **Step 6: Test: virtual scrolling, column rendering, row clicks, load more**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add BasilTable, replace q-table and q-virtual-scroll"
```

### Task 4.3: App.vue shell migration

**Files:**
- Modify: `frontend/src/App.vue`

This is the **highest-risk task**. The entire app shell gets rewritten.

- [ ] **Step 1: Read current App.vue template thoroughly**

Map every Quasar component to its Basil replacement:
- `q-layout` → `<div class="basil-shell">`
- `q-header` → `<header class="basil-header">`
- `q-toolbar` / `q-toolbar-title` → `<div class="basil-header__toolbar">`
- `q-tabs` (desktop) → `<BasilTabs class="basil-desktop-only">`
- `q-footer` (mobile) → `<nav class="basil-footer basil-mobile-only">`
- `q-tabs` (mobile bottom) → `<BasilTabs>` inside footer
- `q-route-tab` → `<BasilTab>`
- `q-drawer` → `<aside class="basil-drawer">` + backdrop
- `q-page-container` / `q-page` → `<main class="basil-main">`
- `q-linear-progress` → `<BasilProgress>`
- `q-badge` → `<BasilBadge>`
- `q-list`/`q-item` in drawer → `<BasilList>`/`<BasilListItem>`
- `q-separator` in drawer → `<BasilSeparator>`
- `q-icon` in drawer → `<BasilIcon>`

- [ ] **Step 2: Rewrite App.vue template**

Replace the Quasar layout with semantic HTML + Basil components.
Keep all JS logic (sync button, theme toggle, drawer toggle, navigation) unchanged.
Only the template and associated CSS change.

The `basil-shell.css` from Phase 0 provides the layout. Verify it matches
the current Quasar layout behavior:
- Header stays fixed during scroll
- Footer stays fixed at bottom on mobile
- Main area scrolls between them
- Drawer slides in from left with backdrop
- Safe-area insets respected

- [ ] **Step 3: Replace `$q.screen` usage in App.vue**

Replace `$q.screen.lt.sm` checks with `screen.isMobile` from `useScreen()`.

- [ ] **Step 4: Replace drawer open/close logic**

Currently may use Quasar's `v-model` on `q-drawer`. Replace with a local
`drawerOpen` ref/data and CSS transform to show/hide.

- [ ] **Step 5: Remove dark mode Quasar overrides**

Lines ~371-389 in App.vue have `[data-theme="dark"]` overrides for Quasar components
(`.q-card`, `.q-field--outlined`, etc.). These are no longer needed since
Basil components use tokens directly. Remove this entire CSS block.

- [ ] **Step 6: Replace `q-page` in PrivacyView.vue**

Replace `<q-page class="basil-privacy">` with `<div class="basil-privacy">`.

- [ ] **Step 7: Check if HelloWorld.vue is used**

Search for imports of `HelloWorld`. If unused, delete it. If used, replace
its `q-page` wrapper.

- [ ] **Step 8: Replace `$q.screen` in PullToRefresh.vue**

Replace `$q.screen.lt.sm` with `screen.isMobile` from `useScreen()`.

- [ ] **Step 9: Comprehensive testing**

Test every navigation path:
- Budget tab (desktop and mobile)
- All other tabs
- Drawer open/close (mobile)
- Sync button
- Theme toggle
- Pull to refresh
- All responsive breakpoints (resize browser)
- Safe area on mobile viewport
- Back/forward browser navigation

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: replace Quasar app shell with semantic HTML + Basil components"
```

---

## Phase 5: Cleanup

### Task 5.1: Migrate notifyUser and $q.notify calls

**Files:**
- Modify: `frontend/src/api.js:1-9`
- Modify: `frontend/src/views/BudgetView.vue`
- Modify: `frontend/src/utils/ruleUtils.js` (if it accepts notify callbacks)

- [ ] **Step 1: Rewrite notifyUser in api.js**

Replace:
```js
import { Notify } from 'quasar'
// ...
export function _notify(opts) {
  Notify.create({ position: 'bottom', ...opts })
}
```

With:
```js
import { toast } from '@/composables/useToast'

export function _notify(opts) {
  toast.show({
    message: opts.message,
    type: opts.type || 'info',
    timeout: opts.timeout || 3000,
  })
}
```

- [ ] **Step 2: Replace `this.$q.notify()` calls in BudgetView**

Replace all ~8 direct `this.$q.notify(...)` calls with `toast.show(...)` or shorthand.
Import `{ toast }` from `@/composables/useToast` at top of file.

- [ ] **Step 3: Update shared utilities that accept notify callbacks**

If `applyMerchantRuleToStore` or `applyCompoundRuleToStore` in `ruleUtils.js`
accept a `notify` parameter, switch them to importing the toast singleton directly
instead of receiving it as a callback.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: replace Quasar Notify with BasilToast throughout"
```

### Task 5.2: Remove Quasar dependencies

**Files:**
- Modify: `frontend/src/main.js:12-13,117`
- Delete: `frontend/src/quasar-user-options.js`
- Modify: `frontend/vite.config.js:3,9`
- Modify: `frontend/package.json`
- Delete: `frontend/src/styles/quasar.sass`
- Delete: `frontend/src/styles/quasar.variables.sass`
- Delete: `frontend/src/styles/quasar-overrides.css`

- [ ] **Step 1: Remove Quasar from main.js**

Remove lines:
```js
import { Quasar } from 'quasar'                    // line 12
import quasarUserOptions from './quasar-user-options' // line 13
```

Change line 117 from:
```js
const app = Vue.createApp(App).use(Quasar, quasarUserOptions)
```
To:
```js
const app = Vue.createApp(App)
```

Add Basil CSS imports where quasar-user-options.js used to import them.
The style import order should be:
1. `tokens.css`
2. `icons.css`
3. `basil-components.css`
4. `basil-shell.css`
5. `basil-utilities.css`
6. `basil-keyboard.css`
7. `dialogs.css`

- [ ] **Step 2: Remove Quasar Vite plugin from vite.config.js**

Remove the `@quasar/vite-plugin` import (line 3) and its configuration (line 9).

- [ ] **Step 3: Delete Quasar config and style files**

```bash
rm frontend/src/quasar-user-options.js
rm frontend/src/styles/quasar.sass
rm frontend/src/styles/quasar.variables.sass
rm frontend/src/styles/quasar-overrides.css
```

- [ ] **Step 4: Uninstall Quasar packages**

```bash
cd frontend && npm uninstall quasar @quasar/extras @quasar/vite-plugin
```

- [ ] **Step 5: Verify build compiles**

```bash
cd frontend && npm run build
```

Fix any remaining import errors or missing references.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Quasar framework dependency"
```

### Task 5.3: Remove remaining Quasar directives and references

**Files:**
- Multiple view/component files

- [ ] **Step 1: Remove all `v-close-popup` directives**

Search: `v-close-popup` across all `.vue` files.
Remove the directive from each element. The close behavior should already be
handled by BasilTray's close mechanism or explicit `@click` handlers.

- [ ] **Step 2: Remove all `v-ripple` directives**

Search: `v-ripple` across all `.vue` files (~6 instances).
Remove. Add CSS `:active` feedback if the element doesn't already have it.

- [ ] **Step 3: Remove any remaining `$q` references**

Search: `$q` and `this.$q` across all files.
These should all be gone by now. If any remain, fix them.

- [ ] **Step 4: Remove any remaining `q-` class names**

Search: `q-pa-`, `q-mb-`, `q-mt-`, `q-gutter-`, `gt-xs`, `lt-sm` in templates.
Replace with basil equivalents or absorb into component BEM styles.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove all Quasar directives, utilities, and references"
```

### Task 5.4: Update documentation

**Files:**
- Modify: `DESIGN.md`
- Modify: `CLAUDE.md` (if needed)

- [ ] **Step 1: Update DESIGN.md CSS load order**

Replace the section that references `quasar-user-options.js` and `quasar.sass`
with the new Basil-only load order from `main.js`.

- [ ] **Step 2: Update DESIGN.md component patterns**

Update any references to Quasar components in the component pattern examples.
Replace with Basil equivalents.

- [ ] **Step 3: Update CLAUDE.md if needed**

Check if any shared utility references changed. Update the "Key files" and
"Shared utilities" tables if file paths or APIs changed.

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md CLAUDE.md
git commit -m "docs: update DESIGN.md and CLAUDE.md for Basil library"
```

### Task 5.5: Final verification

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build
```

Confirm zero errors and zero warnings related to Quasar.

- [ ] **Step 2: Verify `quasar` is nowhere in the bundle**

```bash
grep -r "quasar" frontend/dist/ || echo "Clean — no Quasar in bundle"
```

- [ ] **Step 3: Verify all views in light mode**

Navigate to every view: Budget, Accounts, Trends, Rules, Profile, Onboarding, Privacy.
Confirm all components render correctly.

- [ ] **Step 4: Verify all views in dark mode**

Toggle to dark mode. Repeat the view navigation. Confirm all surfaces, text,
and borders use correct token values.

- [ ] **Step 5: Verify mobile layout**

Resize to mobile viewport (375px width). Confirm:
- Bottom nav visible, header visible
- Drawer opens/closes
- Dialogs render as bottom sheets
- Pull to refresh works
- All text readable, no overflow

- [ ] **Step 6: Verify dialogs**

Open every dialog type: edit transaction, edit category, rule editor, confirm tray,
triage flow, Venmo enrichment. Test open, interact, close.

- [ ] **Step 7: Check package.json has no Quasar references**

```bash
grep -i quasar frontend/package.json || echo "Clean"
```

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: final verification — Quasar fully removed"
```
