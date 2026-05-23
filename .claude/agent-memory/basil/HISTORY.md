# Basil Agent Memory — History

Archived shipped/resolved work. Read on demand (not at session start). Migrated
2026-05-23 from the project auto-memory system, which is preserved untouched as a backup.
Status notes are point-in-time — verify against current code before asserting.

---

## SHIPPED: BasilTray — Vaul-inspired rewrite (2026-03-28)

Merged to main and deployed (branch `basil-tray-vaul`). Only `shouldDrag` remains
(active thread in `MEMORY.md`).

**Scope (confirmed):** bottom drawer only; snap points (peek + full, Apple-Maps-like);
scrollable content with boundary clamping; tray renders above nav bar; max height
respects header; iOS scroll prevention + Safari toolbar workaround; nested drawers;
keyboard-aware positioning. **Skipped:** horizontal drawers, scale background, handle
tap-to-cycle, non-modal.

**Key learnings from earlier failed attempts:**
- **Do NOT use `showModal()`.** Its top layer breaks `position:fixed` outside the dialog
  (keyboard, dropdowns, toasts), prevents `appendChild` DOM moves, shifts the parent
  tray when a child tray's keyboard opens, and is immune to ALL iOS scroll prevention
  (compositor handles the top layer before JS).
- **Do NOT port piecemeal.** Vaul's scroll lock, gesture handling, and animations
  depend on each other — read and build the complete system.
- **Layout fixes over gesture hacks.** `overflow-y:auto` on a non-overflowing element
  still makes iOS claim touches. Actions inside the scroll container cause gesture
  conflict — fix the structure. `RuleEditorDialog` is the reference tray layout.

**What was built:**
- Replaced `<dialog>` showModal with `<Teleport to="body">` + `<div role="dialog">`;
  own backdrop, ESC handler, tray stack for nesting; z-index 9999 tray / 10000 keyboard.
  BasilKeyboard no longer needs the DOM appendChild hack.
- iOS scroll lock (Vaul's `preventScrollMobileSafari`): `position:fixed` body with
  saved/restored scroll, capture-phase touch interception (`passive:false`),
  `getScrollParent` + boundary clamping, reference-counted across trays.
- Layout: Card `overflow-y:hidden`; DialogComponent actions moved outside the scroll
  container; removed `overflow-y:auto` on the body.
- Phase 1 slide animation (CSS transitions, two-phase mount, `::after` gap, backdrop
  fade); Phase 2 animated drag + release (velocity/distance thresholds, rubber-band,
  backdrop sync); Phase 3 snap points (`[0.45, 0.9]` on RuleEditorDialog,
  velocity-weighted); Phase 4 keyboard-aware positioning. Code review chunks A–D
  (double-unlock + stale timer fixed).

**Vaul constants (reference):** easing `cubic-bezier(0.32, 0.72, 0, 1)`; duration 500ms;
velocity threshold 0.4 px/ms; close distance 25% of height; scroll cooldown 100ms;
post-open lockout 500ms; dampen `8 * (Math.log(v + 1) - 2)`.
**Vaul source (read in order):** `use-prevent-scroll.ts`, `use-position-fixed.ts`,
`index.tsx`, `constants.ts`, `helpers.ts`, `style.css`, `browser.ts`
(https://github.com/emilkowalski/vaul).
**Process:** test on a real phone via local dev BEFORE committing; only push to prod
after the user confirms on device.

---

## SHIPPED: Animation tokens for edge-enter elements (2026-03-28)

`--basil-ease-sheet` (`cubic-bezier(0.32, 0.72, 0, 1)`) and `--basil-duration-sheet`
(500ms) in `tokens.css` define the iOS-native sheet curve. Current user: BasilTray.
Future candidates: toasts/notifications, keyboard slide-in, sidebar panels. Reuse these
for any new edge-entering element; reuse the gesture-to-animation handoff (disable
transition during drag, re-enable on release, let CSS interpolate).

---

## SHIPPED: Transaction drill-down (2026-03-29)

Route `/budget/transactions?pfc=<code>&month=YYYY-MM&category=<name>`. Read-only PFC
detail transaction list. `frontend/src/views/TransactionDrillDown.vue`.
- Slide-left entering, instant swap on back (iOS swipe-back compat). KeepAlive on
  BudgetView preserves donut drill-down state (needs `name: 'BudgetView'`).
- Merchant avatars via shared `utils/merchantDisplay.js` (`merchantInitials`,
  `merchantColor`, `isVenmo`; also used by BudgetView). Inline Venmo SVG when `isVenmo`.
- Collapsing summary: stat cards scroll away inside the list; compact `position:sticky`
  bar sticks at top; stats fade/scale via scroll listener (`scrollTop / statsHeight`).
- Layout `height: calc(100dvh - header - nav)` with internal scroll (sticky doesn't work
  through PullToRefresh intermediaries). Chart click disabled on touch devices.
- Intentionally read-only for now; PFC override system (backlog) will make it interactive.

## SHIPPED: Spending breakdown + drill-down polish (2026-03-29)
- All SpendingBreakdown chips tappable in all modes (category drills down;
  detail-single/detail-all navigate to drill-down); chevron `›` on all chips; chart
  click disabled on touch. "Other" category drill-down collects small collapsed
  categories correctly.

## SHIPPED: Monospace font removed (2026-03-29)

Removed `--basil-font-mono` (JetBrains Mono) from all dollar amounts; use
`font-variant-numeric: tabular-nums` on the DM Sans UI font for column alignment.
User called the monospace "so bad and ugly." Never use `--basil-font-mono` for amounts.

---

## SHIPPED: Custom keyboard (merged 2026-03-24)

BasilInput + BasilKeyboard replaced `q-input`/native keyboard. Follow-ups: scroll-into-
view DONE (`scrollActiveInputIntoView()` + dynamic `padding-bottom` via
`--basil-keyboard-height`); keyboard visual separation DONE (border-top + upward
box-shadow). 123-button-closes-keyboard fix later shipped (commit `94024c5`:
`@pointerdown.stop` on the keyboard container prevents dismiss on layer switch).
Still open: blur-swallows-tap (see active threads).

---

## SHIPPED: Quasar → Basil component library migration

Quasar fully removed; custom Basil library built (17 components in
`frontend/src/components/basil/`, 3 composables — `useScreen`/`useGesture`/`useToast`,
4 CSS files, self-hosted Material Icons woff2, native `<dialog>` in BasilTray,
`@tanstack/vue-virtual` for virtual scroll). Motivation: full control over mobile
behavior (Quasar's blur-swallows-tap, dialog scroll interference, dark-mode tax).
Specs: `plans/basil-component-library.md`, `plans/basil-component-library-plan.md`.

> NOTE: the older migration note said branch `basil-library` was unpushed and needed
> page-by-page visual regression fixes before merge; the 3/28 UAT note + recent `main`
> commits indicate it shipped. See "Status to reconcile" in `MEMORY.md` and verify
> against `git log` before relying on either.

---

## SHIPPED: Database migration (Mongo → Postgres) + production go-live

Hetzner go-live Phases 0–3 complete; app live. Mongo→Postgres cutover replaced generic
Mongo helpers with domain-specific Postgres functions (Users / Categories /
Transactions / Accounts+Items / Rules / Aggregations) across 7 tables (users,
plaid_items, plaid_accounts, categories, simple_rules, compound_rules, transactions).

**Migration challenges handled:** `updateData`/`updateManyData` (~30+ Mongo-operator
call sites, each needs bespoke SQL); nested `Plaid-Accounts` structure flattened into
`plaid_items` + `plaid_accounts` (~15 sites across api.js, plaid-api.js, plaidTools.js);
generic `insertData` → per-table INSERTs; ObjectId → UUID; `findUserData` over 4
collections. Dropped unused functions: `findFilterData`, `findRecentTransactions`,
`findSimilarTransactionGroupsByName`, `findSimilarTransactionGroupsByCategory`.
Call-site counts at migration time: api.js ~59, plaidTools.js ~12, plaid-api.js ~8.
Master plan: `plans/production-go-live.md`. (Plaid ID reconciliation fallout is a
live fragile area — see `MEMORY.md` Reference.)

---

## SHIPPED: Shared utility extraction + convention enforcement (2026-04-05)

`shared/categoryTypes.js` (INCOME/EXPENSE/PAYMENT/SAVINGS), `shared/p2pDetection.js`
(single canonical `isP2PTransaction`), `frontend/src/utils/formatDollar.js`
(`formatDollar`/`formatSignedDollar`), `transactionDate.js` (`txnDate`/`txnDayjs`/
`txnMonth`/`isInMonth`), `budgetMath.js` (`freeCashFlow`). `shared/` requires Dockerfile
COPY in build + runtime stages. Vue Options API gotcha: imported functions used in
templates must be exposed in the `methods` block. Convention enforcement: `.claude/rules/`
(5 path-scoped files), CLAUDE.md trimmed (~230 → ~115 lines), compact + stop hooks added.
Specs/plans: `docs/superpowers/specs/2026-04-05-shared-utility-extraction-design.md`,
`docs/superpowers/plans/2026-04-05-shared-utility-extraction.md`.
