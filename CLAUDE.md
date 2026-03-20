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
   `RuleEditorDialog`, `EmptyState`, `SkeletonBudget`, `dialogs.css`.
   Reuse over rebuild. One-off implementations that duplicate existing abstractions
   will be flagged for refactor.

### Always
6. **State changes go through store mutations.** Never mutate `store.state.*` directly.
7. **No hardcoded colors, fonts, or spacing.** Use `var(--basil-*)` tokens.
   `var(--basil-surface)` not `#ffffff`. `var(--basil-space-4)` not `16px`.
8. **CSS class names use `basil-` prefix + BEM structure.**
   `basil-[block]__[element]--[modifier]`. Never prefix with `q-`.
9. **Dark mode Quasar overrides go in `App.vue`** global style section — nowhere else.

---

## What this app is
A personal finance app that links bank accounts via Plaid, pulls transactions, and
auto-categorizes them using a rules engine. The core feature is **auto-learn**: when
the user recategorizes a transaction, a rule is saved and applied to all similar
transactions going forward.

**Stack:** Vue 3 + Quasar 2 + Vuex 4 (frontend) · Express.js + Postgres (backend) ·
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
| `findSimilarTransactions(txn, txns)` | `frontend/src/utils/ruleUtils.js` | Auto-detects similar transactions via 3 strategies (merchant_name → name+account → name). |
| `RuleEditorDialog` | `frontend/src/components/RuleEditorDialog.vue` | Compound rule create/edit UI. Reuse for any flow that creates or edits compound rules. |
| `store.state.bootstrapping` | `frontend/src/store.js` + `frontend/src/api.js` | Set `true` while `ensureAppData` is in-flight. See DESIGN.md "Loading states" for the three-state pattern. |
| `triggerSync()` | `frontend/src/api.js` | `POST /api/sync` — triggers Plaid sync. Only call on explicit user action or stale-data check. |
| `fetchTransactionsForMonth(month)` | `frontend/src/api.js` | `GET /api/transactions?month=YYYY-MM` — cheap DB read. Returns `{ transactions, total }`. |
| `fetchMonthRange(store, start, end)` | `frontend/src/api.js` | Fetches missing months in parallel, skipping cached ones. |
| `searchTransactions(search, page, limit)` | `frontend/src/api.js` | Server-side paginated search across all months. |

### Key architecture rules
- **Sweep logic lives in one place.** All client-side sweeps go through `sweepStore`. All backend sweeps go through `sweepCompoundRule`. Never write inline sweep loops.
- **Condition matching has one implementation per layer.** `matchesCondition` on the client; `conditionsToPostgresFilter` in `api.js` for the backend query; `evaluateCompoundRules` in `categoryMapping.js` for batch mapping. If you add a new condition type or operator, update **all three**.
- **Shared components over one-off markup.** `RuleEditorDialog`, `EmptyState`, `SkeletonBudget` — use them. Don't re-implement empty states inline.
- **Store mutations are the only way to update client state.** Never mutate `store.state.*` directly. Use existing mutations or add a new named mutation.
- **No magic strings for fields/ops.** Condition fields (`merchant_name`, `name`, `amount`, `account`) and operators (`eq`, `contains`, `range`, `gt`, `lt`) must be consistent across `ruleUtils.js`, `categoryMapping.js`, `api.js`, and `RuleEditorDialog`. Add to all when extending.

---

## Next up: Transaction splitting

Split a single transaction across multiple categories (Costco run = groceries +
household, Venmo blob = dinner + tickets). Table stakes for budgeting apps.

**MVP:** Manual amount-based splitting from transaction detail. Parent row marked
`is_split_parent` and excluded from totals. Children get own categories. Unsplit
restores original. No auto-split rules in V1.

**Data model:** Two new columns on `transactions` — `parent_transaction_id` and
`is_split_parent`. Existing queries add `WHERE is_split_parent IS NOT TRUE`.

**Highest risk:** Plaid sync updating parent amount after user has split it.

**Double-counting prevention:** Every place that sums transaction amounts must
exclude split parents. Consider a centralized `effectiveTransactions` store getter.
Known touchpoints: `budgetSummary`, `monthStats`, `categorySum`, `groupTransactions`,
TrendsView charts, search results, rule sweeps, recurring detection, Venmo enrichment,
`transaction_tags` FK references.

**Research:** `plans/transaction-splitting-research.md`

---

## Backlog

### Medium priority
- [ ] **Export to CSV** — low effort, useful for taxes/sharing.
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
- [ ] **iOS keyboard audit for BasilTray dialogs** — short trays with text inputs
      near the bottom are vulnerable. See DESIGN.md "iOS keyboard rule".
- [ ] **Admin toolbox route consolidation** — shared helper for test data insert routes.
- [ ] **Rename `plaid_items` → `plaid_links`** — cosmetic, do when convenient.
- [ ] **BudgetView: eliminate local transaction array** — low priority cleanup.
- [ ] **Test coverage** — Plaid API routes (needs mocks), Vue component tests (needs
      Vue Test Utils setup).

### Maybe / future
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
