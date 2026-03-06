# Basil — Design System

> **Read this before writing any frontend UI.** All components must use the token
> system and follow the patterns below. Never hardcode colors, fonts, spacing, or
> shadows — always use CSS custom properties.

---

## Philosophy

**Warm/editorial.** The app feels like a premium notebook, not a bank dashboard.
Calm, trustworthy, human. Key principles:

- **Ivory over white.** Backgrounds are warm, not clinical.
- **Type carries weight.** DM Serif Display for hero numbers; DM Sans for UI text.
- **Motion confirms, not decorates.** Every animation has a functional reason.
- **Two themes, one token system.** Light (default) and dark/terminal share the same
  CSS variable names — only the values change under `[data-theme="dark"]`.

---

## Token Architecture

### CSS load order (defined in `frontend/src/quasar-user-options.js`)

```
tokens.css           → CSS custom properties (:root + [data-theme="dark"])
quasar.sass          → Quasar framework CSS (compiled with our SASS vars)
quasar-overrides.css → our rules; loads last so they win the cascade
```

**This order is load-order-sensitive. Do not change it.**

### Files

| File | Purpose |
|------|---------|
| `frontend/src/styles/tokens.css` | All CSS custom properties — the single source of truth for every color, spacing, radius, shadow, and motion value. Includes `[data-theme="dark"]` token overrides. |
| `frontend/src/styles/quasar.variables.sass` | Quasar SASS brand vars (`$primary`, `$negative`, etc.) mirrored from tokens so Quasar components inherit the palette |
| `frontend/src/styles/quasar-overrides.css` | **Quasar component base layer.** Theme-neutral overrides that make standard Quasar elements (q-card, q-table, q-field, q-menu, etc.) inherit token values automatically. No dark mode rules here. |
| `frontend/src/App.vue` `<style>` | App-level chrome: layout utilities, header, wordmark, page transition. Also contains all `[data-theme="dark"]` Quasar component overrides — this is the canonical location for dark mode Quasar fixes. |
| `frontend/src/styles/dialogs.css` | **Shared dialog shell.** Structural/layout classes used by all dialogs (`basil-dialog-card`, `basil-dialog-header`, `basil-dialog-title`, etc.). Component-specific dialog styles stay scoped in their own file. |
| `frontend/src/styles/[ViewName].css` | View-specific CSS externalized to keep large `.vue` files manageable (e.g. `BudgetView.css`, `BudgetPlannerView.css`). Import at the top of the `<style>` block. |

### Rule

Every color, font, spacing, radius, and shadow value in a component must
reference a token. Never write a literal hex, px size, or font name inline.

Any new Quasar component that needs theme-aware styling: add its overrides to
`quasar-overrides.css`. Any new custom component: use `var(--basil-*)` tokens
in `<style scoped>` — dark mode works automatically.

---

## Surfaces (backgrounds)

Use these in order of elevation — never jump levels arbitrarily.

| Token | Light value | Purpose |
|-------|-------------|---------|
| `--basil-bg` | `#faf7f2` | Page background |
| `--basil-surface` | `#ffffff` | Cards, panels |
| `--basil-surface-alt` | `#f5f1eb` | Section dividers, table header, zebra rows |
| `--basil-surface-raised` | `#fffefb` | Hover state, elevated elements |
| `--basil-surface-dialog` | `#faf7f2` | Modals and dialogs |

---

## Text

| Token | Light value | Purpose |
|-------|-------------|---------|
| `--basil-text` | `#1a1a14` | Primary body copy |
| `--basil-text-secondary` | `#6b6860` | Labels, secondary info |
| `--basil-text-muted` | `#9e9b94` | Placeholders, hints, captions |
| `--basil-text-inverse` | `#faf7f2` | Text on dark surfaces |

---

## Brand & Semantic Colors

| Token | Light value | Use for |
|-------|-------------|---------|
| `--basil-green` | `#3d8b6c` | Primary actions, active states |
| `--basil-green-mid` | `#5a9e85` | Progress bar gradient end |
| `--basil-green-subtle` | `#eef6f1` | Tinted backgrounds |
| `--basil-positive` | `#2d7a4f` | Income amounts, net positive |
| `--basil-negative` | `#b83c2b` | Overspend, negative net |
| `--basil-warning` | `#c07a1a` | Approaching budget limit |
| `--basil-info` | `#2366a8` | Informational states |

Pairing rule: every semantic color has a `-bg` variant (e.g. `--basil-positive-bg`)
for tinted container backgrounds. Always use the pair together.

---

## Category Type Accents

Used for left-border accents on category rows and chart series colors.

| Type | Border token | Background token |
|------|-------------|-----------------|
| `expense` | `--basil-expense` `#b83c2b` | `--basil-expense-bg` |
| `income` | `--basil-income` `#2d7a4f` | `--basil-income-bg` |
| `savings` | `--basil-savings` `#2366a8` | `--basil-savings-bg` |
| `payment` | `--basil-payment` `#7a6a5a` | `--basil-payment-bg` |

---

## Typography

Three font roles. Never mix them up.

| Token | Font | When to use |
|-------|------|-------------|
| `--basil-font-display` | DM Serif Display | Hero numbers (dollar amounts, large stats), page headings, the wordmark |
| `--basil-font-ui` | DM Sans | Everything else — labels, body, buttons, navigation |
| `--basil-font-mono` | JetBrains Mono / Fira Code | Transaction amounts in tables, any tabular number that needs to align |

Apply display font via the utility class: `class="basil-display"`
Apply mono font via: `class="basil-mono"` (also sets `font-variant-numeric: tabular-nums`)

**Display font size guidance:**
- 2.125rem — primary net figure (largest hero number on page)
- 1.875rem — secondary hero numbers (spent, earned, forecast amount)
- 1.25rem — profile name, section headings

---

## Borders & Shadows

| Token | Use |
|-------|-----|
| `--basil-border` | Default card/input borders |
| `--basil-border-strong` | Table header underlines, emphasized dividers |
| `--basil-shadow-sm` | Cards (default elevation) |
| `--basil-shadow-md` | Header on scroll, dropdowns |
| `--basil-shadow-lg` | Modals, toasts |

---

## Spacing

Numeric scale from 4px to 64px. Always use these; never write raw px values in
component CSS.

```
--basil-space-1:  4px
--basil-space-2:  8px
--basil-space-3: 12px
--basil-space-4: 16px
--basil-space-5: 24px
--basil-space-6: 32px
--basil-space-7: 48px
--basil-space-8: 64px
```

---

## Border Radius

```
--basil-radius-sm:   6px   (badges, tags)
--basil-radius-md:  10px   (cards)
--basil-radius-lg:  16px   (large cards, table containers)
--basil-radius-pill: 9999px (chips, stat pills)
```

---

## Motion

| Token | Value | Use |
|-------|-------|-----|
| `--basil-ease` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | Standard easing |
| `--basil-ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Dialogs, entrance animations |
| `--basil-t-fast` | `120ms` | Hover states, icon swaps |
| `--basil-t-base` | `220ms` | Most transitions |
| `--basil-t-slow` | `400ms` | Page-level reveals |

**Motion rules:**
- Page transitions: 180ms fade via Vue `<Transition name="basil-page">` (App.vue)
- Button press: `scale(0.96)` on `:active` in 80ms (global in App.vue — don't re-add)
- Dialog enter: `translateY(20px) scale(0.97) → none` with spring, 240ms (global)
- Category row stagger: `animation-delay: calc(N * 40ms)` + `basil-category-reveal` class
- Number counters: `requestAnimationFrame` ease-out over 600ms (BudgetView.animateStats)
- Progress bars: `transition: transform 500ms` with 280ms delay on `.basil-progress`
- Charts: `animationDuration: 800, animationEasing: 'cubicOut'` via `ANIMATION` constant

---

## Component Patterns

### Card header row
Every card uses the same two-element header:
```html
<div class="basil-card-head">
  <span class="basil-card-label">Section Name</span>
  <span class="basil-card-period">Optional right-side context</span>
</div>
```
`basil-card-label`: 0.6875rem, uppercase, tracked, muted color — defined in BudgetView.css
and ProfileView.vue. Copy the same CSS if needed in a new view.

### Empty state
Use the `<EmptyState>` component for any zero-data state:
```html
<EmptyState icon="material_icon_name" heading="Short heading" body="One sentence." >
  <!-- optional CTA slot -->
  <q-btn ... />
</EmptyState>
```

### Stat display
For any prominent dollar figure, follow the hero number pattern:
```html
<div class="basil-primary-stat">
  <div class="basil-primary-stat__amount basil-display">$1,234</div>
  <div class="basil-primary-stat__label">label</div>
</div>
```

### Dialog shell
All dialogs import `dialogs.css` for structural layout. Use these classes for the outer shell:
```html
<q-card class="basil-dialog-card">
  <div class="basil-dialog-header">
    <div class="basil-dialog-title">
      <span class="basil-dialog-title__sub">CONTEXT LABEL</span>
      <span class="basil-dialog-title__main">Dialog Title</span>
    </div>
    <q-btn flat round dense icon="close" class="basil-dialog-close" @click="$emit('hide')" />
  </div>
  <!-- scrollable body -->
  <q-card-section class="col overflow-auto"> ... </q-card-section>
  <!-- sticky footer -->
  <q-card-actions align="right"> ... </q-card-actions>
</q-card>
```
Component-specific styles stay in the component's `<style scoped>`. Never duplicate the shell structure.

### Transaction row (All Transactions table)
The table uses a custom `v-slot:body` with:
- Initials avatar: `merchantColor()` + `merchantInitials()` methods (BudgetView)
- Amount: `basil-txn-amount` + `--credit` / `--debit` modifier
- Excluded rows: `basil-txn-row--excluded` (40% opacity)

### Loading states (three-state pattern)
Non-Budget views use `store.state.bootstrapping` to gate content:

1. `bootstrapping=true` → skeleton rows (`q-skeleton`) or centered spinner
2. `bootstrapping=false`, data empty → `<EmptyState>` component
3. `bootstrapping=false`, has data → real content

**Never show `<EmptyState>` while `bootstrapping` is true** — it will flash and
immediately be replaced with real content.

```html
<!-- Skeleton while loading -->
<template v-if="$store.state.bootstrapping">
  <q-item v-for="i in 4" :key="i">
    <q-item-section>
      <q-skeleton type="text" width="55%" />
      <q-skeleton type="text" width="35%" />
    </q-item-section>
  </q-item>
</template>
<!-- Empty state only after load -->
<EmptyState v-else-if="items.length === 0" ... />
<!-- Real content -->
<q-list v-else>...</q-list>
```

For chart views, use a centered spinner instead of skeleton rows:
```html
<div v-if="$store.state.bootstrapping" class="basil-[view]__loading">
  <q-spinner-dots size="2rem" color="primary" />
</div>
<template v-else>...</template>
```
CSS: `display: flex; align-items: center; justify-content: center; min-height: 200px;`

**BudgetView** owns its own loading pattern (`<SkeletonBudget />`) — it does **not**
use `bootstrapping`. The flag is only set by `ensureAppData` in `firebase.js`, which
BudgetView does not call (it handles its own sync).

A global 2px `q-linear-progress` bar is rendered in `App.vue` while bootstrapping,
giving a subtle top-of-header indicator on any view.

---

## Dark Mode Architecture

The dark theme is defined as token overrides under `[data-theme="dark"]` in
`tokens.css`. It activates by setting `document.documentElement.dataset.theme = 'dark'`.

Managed via Vuex: `store.commit('setTheme', 'dark' | '')` — updates the DOM attribute,
writes to `localStorage`, and triggers the transition class.

### Two layers of dark mode CSS

**Layer 1 — token overrides** (`tokens.css`):
All semantic color, surface, and text tokens get new values under `[data-theme="dark"]`.
Any component that uses only `var(--basil-*)` tokens automatically adapts — no extra work needed.

**Layer 2 — Quasar component overrides** (`App.vue` global `<style>`):
Quasar components bake in their own light backgrounds (`#fff`, `#f5f5f5`) and
ignore CSS custom properties. These must be explicitly overridden with `!important`:

```css
[data-theme="dark"] .q-table tbody td { background-color: var(--basil-surface) !important; }
[data-theme="dark"] .q-field--outlined .q-field__control { background-color: var(--basil-surface-alt) !important; }
/* etc. — see App.vue dark mode section */
```

### Rule for new components
1. Use only `var(--basil-*)` tokens for all colors — no hardcoded hex values.
2. If you introduce a Quasar component that still shows a light background in dark mode,
   add a `[data-theme="dark"] .q-whatever { ... !important; }` override to the dark mode
   section of **`App.vue`** — that is the canonical location for all Quasar dark fixes.
3. Never add Quasar dark mode overrides in `quasar-overrides.css` or component scoped styles.

---

## Charts (ECharts via vue-echarts)

Always spread the `ANIMATION` constant into chart options:
```js
const ANIMATION = { animation: true, animationDuration: 800, animationEasing: 'cubicOut' };
// ...
return { ...ANIMATION, tooltip: {...}, series: [...] };
```

Use token-aligned colors — never raw ECharts defaults:
- Positive bars: `#2d7a4f` (matches `--basil-positive`)
- Negative bars: `#b83c2b` (matches `--basil-negative`)
- Zero line: `#c8c0b0` (matches `--basil-border-strong`)
- Multi-series: use `CHART_PALETTE` from `TrendsView.vue` (15 warm editorial colors)

Remove ECharts built-in legends (`legend: { show: false }`). Render a custom HTML
legend below the chart using `.basil-chart-legend` / `.basil-chart-legend__item` /
`.basil-chart-legend__dot` (see `TrendsView.vue`).

Add `:key="activeChart"` to `<v-chart>` when multiple chart types share one instance —
prevents dual-axis state corruption when switching chart configurations.

---

## CSS Naming Convention

All custom class names use the `basil-` prefix with BEM-like structure:

```
.basil-[block]                     block
.basil-[block]__[element]          element within a block
.basil-[block]--[modifier]         modifier on a block
.basil-[block]__[element]--[mod]   modifier on an element
```

Examples: `basil-actuals-card`, `basil-primary-stat__amount`, `basil-txn-row--excluded`

Quasar utility classes (`q-mt-md`, `gt-xs`, etc.) are fine alongside basil classes.
Never create new classes that start with `q-` — those are Quasar's namespace.

---

## New Component Checklist

Before shipping a new component or view:

- [ ] All colors use `var(--basil-*)` tokens
- [ ] All spacing uses `var(--basil-space-*)` tokens
- [ ] No hardcoded fonts — uses `var(--basil-font-display/ui/mono)` or inherits body
- [ ] Zero data state uses `<EmptyState>` component
- [ ] Tested in dark mode — Quasar component backgrounds overridden if needed
- [ ] Any entrance animation uses `--basil-ease` or `--basil-ease-spring`
- [ ] Card sections use `basil-card-head` / `basil-card-label` header pattern
- [ ] New CSS class names use `basil-` prefix

---

## What NOT to Do

- **Don't hardcode colors.** `color: #3d8b6c` → `color: var(--basil-green)`
- **Don't use Quasar's `text-primary` / `text-grey-7` etc.** These bypass the token system and break in dark mode.
- **Don't add a new Google Font.** The three font roles cover all cases.
- **Don't use `q-spinner` or Quasar loading overlays** for the main budget load — use `<SkeletonBudget>`.
- **Don't animate for decoration.** Every motion should confirm an action or orient the user.
- **Don't set `background-color: white` or `background-color: #fff`.** Use `var(--basil-surface)`.
- **Don't write a dark mode override in a component's `<style scoped>`.** All Quasar dark overrides go in `App.vue`'s dark mode section; view-specific overrides go at the bottom of the view's CSS file.
