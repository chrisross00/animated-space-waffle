# Project: animated-space-waffle (personal finance / budget tracker)

## Standard operating procedures — read first

These apply to every task, every session, including after context compaction.

### Before writing ANY new code (universal gate)
0. **Search for existing patterns first.** Before creating any new file, function,
   component, or utility, grep/glob the codebase for existing implementations that
   solve the same or a similar problem. Briefly state what you found and why reuse
   isn't possible. If an existing abstraction is close, extend it rather than building
   a parallel one. Code that duplicates existing patterns will be rejected.

### Before writing any frontend UI
1. **Read `DESIGN.md`** in full before touching any component or view.
   It is the single source of truth for tokens, typography, spacing, dark mode,
   component patterns, and the new-component checklist. Violations ship as bugs.

### Before writing any rule, sweep, or condition logic
2. **Check `frontend/src/utils/ruleUtils.js`** — `matchesCondition` and `sweepStore`
   are the canonical client-side implementations. Never write inline sweep loops.
3. **Check `api.js → sweepCompoundRule`** for the backend equivalent.
4. If adding a new condition type or operator, update **all three**:
   `ruleUtils.js`, `categoryMapping.js` (`evaluateCompoundRules`), and `api.js`
   (`conditionsToPostgresFilter`).

### Before building any new component or UI pattern
5. **Check existing shared components first:**
   `RuleEditorDialog`, `EmptyState`, `SkeletonBudget`, `dialogs.css`,
   and all Basil components in `frontend/src/components/basil/`.
   Reuse over rebuild. One-off implementations that duplicate existing abstractions
   will be flagged for refactor.
6. **Inputs: use `BasilInput` or variant wrappers.** Never use `q-input` for new inputs.
7. **UI components: use Basil components.** Do not introduce new Quasar component
   dependencies. See DESIGN.md "Basil Component Library" for the full component list.

### Always
6. **State changes go through store mutations.** Never mutate `store.state.*` directly.
7. **No hardcoded colors, fonts, or spacing.** Use `var(--basil-*)` tokens.
   `var(--basil-surface)` not `#ffffff`. `var(--basil-space-4)` not `16px`.
8. **CSS class names use `basil-` prefix + BEM structure.**
   `basil-[block]__[element]--[modifier]`. Never prefix with `q-`.
9. **Dark mode: Basil components handle it automatically** via `var(--basil-*)` tokens.
   If overriding any legacy component, the fix goes in `App.vue` global style section.

---

## What this app is
A personal finance app that links bank accounts via Plaid, pulls transactions, and
auto-categorizes them using a rules engine. The core feature is **auto-learn**: when
the user recategorizes a transaction, a rule is saved and applied to all similar
transactions going forward.

**Stack:** Vue 3 + Basil component library + Vuex 4 (frontend) · Express.js + Postgres (backend) ·
Google OAuth + self-issued JWTs · Plaid API

**Hosting:** Self-hosted on Hetzner VPS (Postgres 16 in Docker, Node via PM2, Nginx
reverse proxy, Let's Encrypt SSL). CI/CD via GitHub Actions (push to main → test → deploy).

## How to run
```
# Backend (root)
npm start              # nodemon index.js, default port from .env

# Frontend (frontend/)
npm run dev            # Vite dev server on :8080, proxies /api and /plaid-api to :3000
npm run build          # outputs to frontend/dist/ (served by Express in production)
```

## Key files
| File | Purpose |
|------|---------|
| `index.js` | Express entry point — Sentry, helmet, CORS, rate-limit |
| `auth-routes.js` | Google OAuth login flow (consent → callback → JWT) |
| `api.js` | All app API routes |
| `plaid-api.js` | Plaid Link token, token exchange, account removal |
| `db/database.js` | Postgres connection pool (pg) + all DB helpers |
| `frontend/src/views/BudgetView.vue` | Main dashboard — monthly budget, transactions |
| `frontend/src/views/TrendsView.vue` | Charts — Spending, Cash Flow, Cumulative, Savings |
| `frontend/src/views/MerchantBrowser.vue` | Top-down merchant rule assignment |
| `frontend/src/views/RulesView.vue` | View/edit/delete all compound rules |
| `frontend/src/views/ProfileView.vue` | Auth (Google sign-in) + linked accounts |
| `admin/src/views/ToolboxView.vue` | Admin toolbox (dedupe, seed, map unmapped, clear overrides, nuke, etc.) |
| `frontend/src/components/DialogComponent.vue` | Edit transaction / category dialog |
| `frontend/src/components/RuleEditorDialog.vue` | Compound rule create/edit dialog |
| `frontend/src/utils/ruleUtils.js` | Shared condition matching, store sweep, similarity detection |
| `frontend/src/components/PlaidLinkHandler.vue` | Plaid Link iframe component |
| `frontend/src/store.js` | Vuex store (user, session, transactionsByMonth, categories, rules) |
| `frontend/src/api.js` | All fetch calls to backend API + auth helpers |
| `frontend/src/components/basil/` | Basil component library — globally registered UI components (BasilButton, BasilCard, BasilSelect, BasilToggle, BasilList, BasilTabs, BasilTable, etc.) |
| `frontend/src/composables/` | Vue composables — `useScreen` (breakpoints), `useGesture` (swipe/drag), `useToast` (notifications), `useScrollLock` (iOS body scroll prevention) |
| `utils/venmoEnrichment.js` | Venmo CSV parser + transaction enrichment matching |
| `utils/categoryMapping.js` | Transaction categorization rule engine |

## Architecture notes
- **Data layer: sync vs read separation.** Plaid API calls (expensive, rate-limited)
  are decoupled from Postgres reads (cheap, frequent). `POST /api/sync` triggers Plaid;
  `GET /api/transactions?month=YYYY-MM` reads from DB. Frontend loads current + 3 prior
  months on mount, fetches more on demand (TrendsView 3→6→12). Background auto-sync
  fires only when data is >4 hours stale. `lastSyncedAt` persisted in sessionStorage.
- **Month-based transaction loading.** `store.state.transactionsByMonth` is the source
  of truth. `store.state.transactions` is a flat compatibility array rebuilt on every
  month update (sorted newest-first). All 26+ consumers of `state.transactions` work
  unchanged.
- **Sync button** lives in the App.vue header toolbar. Spins while syncing. Triggers
  Plaid API call (expensive, rate-limited). Pull-to-refresh on mobile is separate —
  re-fetches from Postgres only (cheap). `PullToRefresh.vue` wraps the router-view
  in App.vue so all views get it.
- **Auth:** Google OAuth2 → self-issued JWT (7-day expiry). Frontend stores JWT in
  localStorage, sends as `Authorization: Bearer <token>`. Backend verifies with
  `jsonwebtoken`. OAuth flow in `auth-routes.js`, token consumption in `frontend/src/api.js`.
- **Postgres tables:** `users`, `categories`, `simple_rules`, `compound_rules`,
  `transactions`, `plaid_items`, `plaid_accounts`, `balance_snapshots`, `sync_log`.
  Schema at `db/migrations/001-initial-schema.sql`.
- **Category types:** `income` / `expense` / `payment` / `savings`
- **`transaction.account`:** Institution name stamped onto each individual transaction
  at Plaid sync time (`utils/plaidTools.js`). Used by the `account` condition type in
  compound rules.
- **`manually_set` flag:** Marks transactions that were explicitly overridden by the user
  *without* creating a rule. Only set when `ruleMode` is absent from the update request.
  When `ruleMode` is present (merchant, compound), the entry-point transaction stays
  sweepable. Rule sweeps skip `manually_set: true` transactions.
- **`ruleMode` request field:** Sent in transaction update payloads to signal intent.
  Values: `null` (pure manual edit → sets `manually_set`), `'merchant'`, `'compound'`.
- **Admin system:** `isAdmin` flag on `users` table (Postgres). `requireAdmin(uid, res)`
  does an async DB lookup. `resolveTargetUser(req, res)` extracts `targetUserId` from
  request body (POST) or query param (GET), defaults to authenticated user, requires
  admin only when targeting another user.
- **Plaid credentials:** `utils/plaidClient.js` creates both sandbox and production
  clients. `forUser(isAdmin)` returns production for everyone in production env;
  in dev, admins get production, others get sandbox.
- **Env vars:** Root `.env` has `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `PLAID_*`, `SENTRY_DSN`. `frontend/.env` has `VITE_SENTRY_DSN`,
  `VITE_DEV_AUTH_BYPASS`. Production env on Hetzner at `/opt/basil/app/.env`.
- **Error tracking:** Sentry on both backend (`@sentry/node`) and frontend (`@sentry/vue`).
- **Compound rules:** Stored in `compound_rules` as `{ user_id, label, conditions (JSONB), action (JSONB), created_at, created_from }`.
  Conditions: array of `{ field, op, value }` — fields: `merchant_name`, `name` (`eq`|`contains`), `amount` (`eq`|`gt`|`lt`), `account` (`eq`).
  Action: `{ type: 'categorize', categoryName, note? }`. Evaluated before simple rules in `categoryMapping.js`.

## Large file maps — navigate before reading

These files are the largest in the codebase. Use these maps to jump to the right
section instead of reading the whole file.

### `BudgetView.vue` (~1,700 lines)

| Section | Lines | What's there |
|---------|-------|--------------|
| **Template: auth/onboarding gates** | 1–36 | Logged-out EmptyState, not-onboarded setup CTA, SkeletonBudget |
| **Template: Actuals card** | 37–85 | Spent/earned hero stats, net position, secondary stats |
| **Template: Projections card** | 86–118 | Budget remaining, forecasted recurring |
| **Template: To Sort nudge + controls** | 119–160 | Unsorted txn count, month picker, Show All toggle |
| **Template: Category cards (collapsed view)** | 161–291 | Category rows with progress bars, nested transaction lists, Edit Category dialog |
| **Template: Show All table** | 292–469 | QTable with virtual scroll, search/filters, bulk category bar, Edit Transaction dialog |
| **Template: Mobile bulk bar** | 470–501 | Fixed bottom bar for bulk actions on mobile |
| **Template: Triage dialog** | 502–650 | Bottom-sheet triage flow (card, category picker, similar toggle, actions) |
| **`data()`** | 658–722 | ~60 fields: display state, dialog state, triage state, table state |
| **`computed`** | 724–1057 | `categoryTypeMap`, `tableTransactions`, `triageItems`, `triageSimilar`, `triageActionableCount`, `monthStats`, `forecastedEndOfMonth` |
| **`methods`** | 1059–1625 | See subsystem breakdown below |
| **`watch`** | 1626–1657 | `monthlyStats` → animate, `selectedDate` → recalc, `updatedCategory/Transaction` → store commit + regroup |
| **`mounted()`** | 1659–1697 | `ensureAppData` → `buildPage('refresh')` → background stale sync |

**Method subsystems:**

| Subsystem | Key methods | What it does |
|-----------|-------------|--------------|
| Budget display | `groupTransactions`, `categorySum`, `budgetRemaining`, `getProgressRatio`, `monthStats` | Groups txns by category, computes stats |
| Dialog orchestration | `buildEditCategoryDialog`, `buildEditTransactionDialog`, `onSubmit` | Opens dialogs, handles submit for category/transaction edits + rule creation |
| Triage flow | `openTriageFlow`, `triageAccept`, `triageSkip`, `triageAdvance` | Self-contained card-by-card categorization flow |
| Table / infinite scroll | `onTableVirtualScroll`, `openTableDialog`, `applyBulkCategory` | Show All table with scroll-to-load-more + bulk ops |
| Data lifecycle | `buildPage`, `onPullRefresh` | Sync or refresh from store, regroup, recalc stats |
| Formatting | `formatDollar`, `formatDate`, `merchantInitials`, `merchantColor` | Pure display helpers |

### `api.js` (~1,026 lines)

| Section | Lines | Routes |
|---------|-------|--------|
| **Helpers** | 1–43 | `requireAdmin`, `resolveTargetUser`, `isStr` |
| **Core data** | 45–252 | `GET /` · `POST /dedupe` · `GET /getcategories` · `GET /seedcategories` · `GET /addplaidpfc` · `POST /sync` · `POST /sync/balances` · `GET /transactions` · `GET /historicalCategoryMap` · `GET /getOrAddUser` · `GET /cleanPendingTransactions` |
| **Dialog submit** | 253–423 | `POST /handleDialogSubmit` — the big one (~170 lines). Handles transaction updates, category edits/adds, rule creation, sweeps |
| **Merchants & rules** | 424–591 | `GET /merchantStats` · `GET /merchants` · `POST /saveRule` · `POST /deleteRule` · `GET /rules` · `POST /saveCompoundRule` · `POST /updateCompoundRule` · `POST /deleteCompoundRule` |
| **Bulk ops** | 593–735 | `POST /bulkCategorize` · `GET /mapunmapped` (+ `sweepCompoundRule` helper at ~617) |
| **Admin / toolbox** | 736–970 | `GET /users` · `POST /nukeTransactions` · `POST /clearManualOverrides` · `POST /clearVenmoEnrichment` · `POST /resetBalanceSnapshots` · `POST /nukeAllData` · `POST /addVenmoTransactions` · `POST /addTestTransactions` · `POST /deleteCategory` · `POST /updateBudgetLimit` |
| **Venmo enrichment** | 971–1026 | `POST /venmoEnrichment/preview` · `POST /venmoEnrichment/apply` |

## Shared utilities — check before building

**Before writing any sweep, condition-matching, or rule logic, check these first:**

| Utility | Location | What it does |
|---------|----------|--------------|
| `matchesCondition(txn, condition)` | `frontend/src/utils/ruleUtils.js` | Evaluates a single condition against a transaction. Single source of truth for client-side matching. |
| `sweepStore(store, conditions, categoryName, note, toSortOnly)` | `frontend/src/utils/ruleUtils.js` | Applies a rule to all matching transactions in Vuex store. Used by all rule creation/edit flows. |
| `sweepCompoundRule(uid, conditions, action)` | `api.js` (module-level helper) | Backend equivalent — updates matching transactions in Postgres. |
| `evaluateCompoundRules(rules, txn)` | `utils/categoryMapping.js` | Evaluates compound rules against a transaction during batch categorization. |
| `findSimilarTransactions(txn, txns)` | `frontend/src/utils/ruleUtils.js` | Tiered similarity cascade — see "Similarity cascade" section below. |
| `extractStablePrefix(name)` | `frontend/src/utils/ruleUtils.js` | Extracts stable prefix from transaction names (before digit runs or variable suffixes). Used by name_prefix tier. |
| `isP2P(txn)` | `frontend/src/utils/ruleUtils.js` | Detects P2P transactions (Venmo, Zelle, Cash App, PayPal, Apple Cash). P2P pattern list must stay in sync with `utils/categoryMapping.js`. |
| `RuleEditorDialog` | `frontend/src/components/RuleEditorDialog.vue` | Compound rule create/edit UI. Reuse for any flow that creates or edits compound rules. |
| `store.state.bootstrapping` | `frontend/src/store.js` + `frontend/src/api.js` | Set `true` while `ensureAppData` is in-flight. See DESIGN.md "Loading states" for the three-state pattern. |
| `triggerSync()` | `frontend/src/api.js` | `POST /api/sync` — triggers Plaid sync. Only call on explicit user action or stale-data check. |
| `fetchTransactionsForMonth(month)` | `frontend/src/api.js` | `GET /api/transactions?month=YYYY-MM` — cheap DB read. Returns `{ transactions, total }`. |
| `fetchMonthRange(store, start, end)` | `frontend/src/api.js` | Fetches missing months in parallel, skipping cached ones. |
| `searchTransactions(search, page, limit)` | `frontend/src/api.js` | Server-side paginated search across all months. |
| `BasilInput` / variant wrappers | `frontend/src/components/BasilInput.vue` + `Basil{Amount,Search,Text,Note}.js` | Custom input replacing `q-input`. Variants: `amount`, `search`, `text`, `note`. See DESIGN.md. |
| `BasilButton` | `frontend/src/components/basil/BasilButton.vue` | Primary interactive element — replaces `q-btn`. |
| `BasilCard` | `frontend/src/components/basil/BasilCard.vue` | Surface container — replaces `q-card`. |
| `BasilSelect` | `frontend/src/components/basil/BasilSelect.vue` | Dropdown picker — replaces `q-select`. No blur-swallows-tap issue. |
| `BasilToggle` | `frontend/src/components/basil/BasilToggle.vue` | Boolean on/off control — replaces `q-toggle`. |
| `BasilList` / `BasilListItem` | `frontend/src/components/basil/` | List container + row — replace `q-list` / `q-item`. |
| `BasilTabs` / `BasilTab` | `frontend/src/components/basil/` | Tab bar — replaces `q-tabs` / `q-tab`. |
| `BasilTable` | `frontend/src/components/basil/BasilTable.vue` | Data table with virtual scroll — replaces `q-table`. |
| `useScreen` | `frontend/src/composables/useScreen.js` | Reactive breakpoints (`isMobile`, `isDesktop`, `width`) — replaces `$q.screen`. |
| `useGesture` | `frontend/src/composables/useGesture.js` | Swipe and drag gesture detection — replaces `v-touch-swipe`. |
| `useToast` | `frontend/src/composables/useToast.js` | Programmatic toast notifications — replaces `$q.notify`. |
| `keyboardState`, `requestKeyboard`, `dismissKeyboard` | `frontend/src/utils/basilKeyboard.js` | Reactive singleton for keyboard ↔ input communication. |
| `scrollActiveInputIntoView()` | `frontend/src/utils/basilKeyboard.js` | Scrolls focused input into view when keyboard opens. Finds nearest scrollable ancestor (tray) or falls back to body padding for full-page views. |

### Key architecture rules
- **Sweep logic lives in one place.** All client-side sweeps go through `sweepStore`. All backend sweeps go through `sweepCompoundRule`. Never write inline sweep loops.
- **Condition matching has one implementation per layer.** `matchesCondition` on the client; `conditionsToPostgresFilter` in `api.js` for the backend query; `evaluateCompoundRules` in `categoryMapping.js` for batch mapping. If you add a new condition type or operator, update **all three**.
- **Shared components over one-off markup.** `RuleEditorDialog`, `EmptyState`, `SkeletonBudget` — use them. Don't re-implement empty states inline.
- **Store mutations are the only way to update client state.** Never mutate `store.state.*` directly. Use existing mutations or add a new named mutation.
- **No magic strings for fields/ops.** Condition fields (`merchant_name`, `name`, `amount`, `account`) and operators (`eq`, `contains`, `range`, `gt`, `lt`) must be consistent across `ruleUtils.js`, `categoryMapping.js`, `api.js`, and `RuleEditorDialog`. Add to all when extending.

### Similarity cascade (`findSimilarTransactions`)

Powers the "Also categorize N similar" / "Remember for future" checkbox in the
edit transaction dialog and triage flow. Uses a tiered cascade — tries strategies
in specificity order, first tier with >0 matches wins.

**Non-P2P cascade:**

| Tier | Strategy | Match logic | Rule created |
|------|----------|-------------|-------------|
| 1 | `merchant_name` | Same Plaid-normalized merchant | merchant rule (`merchant_name eq`) |
| 2 | `exact_name` | Identical transaction name | compound rule (`name eq`) |
| 3 | `name_account` | Identical name + same institution | compound rule (`name eq` + `account eq`) |
| 4 | `name_prefix` | Stable prefix before digits/variable suffix | compound rule (`name contains`) |
| 5 | `amount_account` | Same dollar amount + same institution | compound rule (`amount eq` + `account eq`) |

**P2P cascade** (Venmo, Zelle, Cash App, PayPal, Apple Cash):

Only exact amount matching — merchant/name/prefix tiers are skipped because they
are too broad (all Venmo transactions share the same merchant and often the same
name). Account is included in the rule when available but not required.

| Tier | Strategy | Match logic | Rule created |
|------|----------|-------------|-------------|
| 1 | `amount_account` | Same dollar amount (+ same institution if available) | compound rule (`amount eq` [+ `account eq`]) |

**Prefix extraction (`extractStablePrefix`)** uses two heuristics:
1. Everything before the first digit run, trimmed of trailing punctuation
   (`"Gusto-OSV 00007055 CITIZENS"` → `"Gusto-OSV"`)
2. Drop the last space-separated token if no digits exist
   (`"DD *DOORDASH MASCAFE"` → `"DD *DOORDASH"`)
3. Returns `null` if result is shorter than 4 characters

**P2P detection (`isP2P`)** checks `merchant_name` and `name` against a pattern
list. The same list exists server-side in `utils/categoryMapping.js` — keep both
in sync when adding new P2P providers.

**UI:** The checkbox label adapts — "Also categorize N similar" when there are
actionable matches, "Remember for future 'X' (N similar)" when all matches are
already in the right category. The hint below shows "Matched by merchant / name /
name pattern / amount / amount + institution".

---

## Backlog

### High priority
- [ ] **BasilTray: shouldDrag gesture handoff** — Implement Vaul's `shouldDrag` decision
      tree for snap point trays. Enables continuous gesture handoff between tray drag and
      content scroll (Apple Maps behavior): drag tray to full → finger keeps moving →
      content scrolls. And reverse: scroll content to top → keep pulling down → tray drags
      closed. Without this, flicking a snap tray open also scrolls its content body.
      See `plans/basil-tray-vaul.md` "shouldDrag decision tree" section for full spec.
- [ ] **Income detection nudge + quick-fix** — When the current month has zero Income
      but large inbound transfers exist, surface a nudge on the budget page showing
      the suspected paycheck(s) inline: "We found a $4,700 deposit — is this income?"
      Two actions: "Yes" (recategorizes + creates rule in one tap) and "Review all"
      (opens triage filtered to large incoming transfers). Solves the problem where
      PFC misclassifies payroll as transfers and the user has no way to know.
      Design validated via UX analysis + competitor research (see `plans/`).

### Medium priority
- [ ] **Post-onboarding in-flow prompts** — soft-gate dialogs for actions like Add to
      Home Screen (with GIF), Venmo import, trends discovery. Not nudges, not overlays —
      feel like onboarding continuation. Trigger contextually, dismiss permanently.
      See `plans/post-onboarding-nudges.md` "In-Flow Prompts" section.
- [ ] **Show/hide empty budget categories** — user setting to toggle whether categories
      with zero activity and no budget limit are visible on the budget page. Currently
      hidden via `shouldShowCategory` (requires limit, activity, or transactions).
      Setting should persist per-user (DB or localStorage).
- [ ] **Rules & suggestion engine: user control** — "exclude from rules" checkbox in
      Edit Transaction dialog; confidence reason chips; merchant exclusion from auto-suggest.
- [ ] **Fixed vs variable category dimension** — `fixed`/`variable` flag on categories
      for bucketed budget view (cost floor vs discretionary). Schema + Edit Category UI.
- [ ] **`manually_set_at` timestamp** — store timestamp alongside `manually_set: true`
      for attribution ("You categorized this · Mar 3"). Backend-only change.
- [ ] **Spending trend chart: legend improvement** — HTML legend below chart for mobile.
- [ ] **Notification / alerts** — budget limit warnings. Needs delivery mechanism decision.
- [ ] **User switching: clear store on identity change** — Login As should clear store +
      sessionStorage before authenticating as the new user.
- [ ] **ProfileView cleanup** — decide what stays in Profile vs moves to Accounts.
- [ ] **Amount `between` operator** — range with min + max, not yet built in rule editor.

### Rule editor UX (backlog)
- [ ] **Simple rule editing via RuleEditorDialog** — tap a simple rule → open editor
      pre-populated → edit or upgrade to compound rule.
- [ ] **Rule label placement** — move name field below conditions panel (needs demo).
- [ ] **Combobox for merchant name** — type-to-filter from known merchants.
- [ ] **Pre-populate name from source transaction** — when creating a rule from a
      specific transaction.

### Tech debt
- [ ] **Custom keyboard typing speed on mobile** — search fields (Category picker,
      Show All table) feel sluggish on mobile. Desktop is fine. The keystroke path is
      `BasilKeyboard → emitKey → BasilInput.onKey → emitDebounced → parent`. Needs
      profiling on a real device to identify the bottleneck. The 300ms search debounce
      delays the parent update but shouldn't block display — yet the display reads
      `modelValue` which doesn't update until the debounce fires. A local buffer
      approach was attempted and broke (characters stopped appearing after a few keys).
      Root cause TBD.
- [ ] **Scroll-into-view smoothness** — `smoothScrollBy` in `basilKeyboard.js` uses
      RAF-based JS scrolling (low FPS on ProMotion). Replace with
      `scrollParent.scrollTo({ top, behavior: 'smooth' })` for compositor-driven animation.
- [ ] **Admin toolbox route consolidation** — shared helper for test data insert routes.
- [ ] **Rename `plaid_items` → `plaid_links`** — cosmetic, do when convenient.
- [ ] **BudgetView: eliminate local transaction array** — low priority cleanup.
- [ ] **Test coverage** — Plaid API routes (needs mocks), Vue component tests (needs
      Vue Test Utils setup).

### Maybe / future
- [ ] **Export to CSV** — low effort, useful for taxes/sharing. Low priority.
- [ ] **Push notifications** — Service Worker + Push API. Needs design decision.
- [ ] **Customizable nav** — user picks which views appear in bottom toolbar.
- [ ] **Settings: Budget rollover** — per-category or global? Unspent budget carryover.
- [ ] **Sign in with Apple** — requires Apple Developer account ($99/yr).
- [ ] **Multi-select in Merchant Browser** — check multiple merchants, assign all at once.
- [ ] **Bulk rule creation from transaction table** — select rows → create rule.
- [ ] **Savings category type** — decide if savings transfers are neutral in cash flow.
- [ ] **Multi-provider P2P import** — Zelle, Cash App CSV formats alongside Venmo.
- [ ] **Shared expense circles** — collaborative categorization across users.
- [ ] **P2P spending insights ("Venmo Wrapped")** — social spending analytics.
