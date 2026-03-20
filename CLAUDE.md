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
| `frontend/src/utils/ruleUtils.js → findSimilarTransactions()` | Auto-detects similar transactions and determines best rule strategy |
| `frontend/src/components/PlaidLinkHandler.vue` | Plaid Link iframe component |
| `frontend/src/store.js` | Vuex store (user, session, transactionsByMonth, categories, rules) |
| `frontend/src/api.js` | All fetch calls to backend API + auth helpers |
| `utils/venmoEnrichment.js` | Venmo CSV parser + transaction enrichment matching |
| `frontend/src/utils/ruleUtils.js` | Shared condition matching + store sweep utilities |
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
  `transactions`, `plaid_items`, `plaid_accounts`, `balance_snapshots`.
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
  in dev, admins get production, others get sandbox. Credentials:
  `PLAID_PRODUCTION_CLIENT_ID`, `PLAID_PRODUCTION_SECRET`, `PLAID_SANDBOX_CLIENT_ID`,
  `PLAID_SANDBOX_SECRET`.
- **Env vars:** Root `.env` has `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `PLAID_*`, `SENTRY_DSN`. `frontend/.env` has `VITE_SENTRY_DSN`,
  `VITE_DEV_AUTH_BYPASS`. Production env on Hetzner at `/opt/basil/app/.env`.
- **Error tracking:** Sentry on both backend (`@sentry/node`) and frontend (`@sentry/vue`).
  DSN configured via `SENTRY_DSN` / `VITE_SENTRY_DSN`.

## Large file maps — navigate before reading

These files are the largest in the codebase. Use these maps to jump to the right
section instead of reading the whole file.

### `BudgetView.vue` (1,700 lines)

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
| **`data()`** | 658–722 | ~60 fields. Three clusters: *display state* (selectedDate, monthlyStats, barsReady), *dialog state* (clicker, transactionClickers, dialogBody), *triage state* (triageSkipped, triageOpen, triageCategory), *table state* (showAll, tableSearch, selectedRows) |
| **`computed`** | 724–1057 | `categoryTypeMap`, `tableTransactions`, `triageItems`, `triageSimilar`, `triageActionableCount`, `monthStats`, `forecastedEndOfMonth` |
| **`methods`** | 1059–1625 | See subsystem breakdown below |
| **`watch`** | 1626–1657 | `monthlyStats` → animate, `selectedDate` → recalc, `updatedCategory/Transaction` → store commit + regroup |
| **`mounted()`** | 1659–1697 | `ensureAppData` → `buildPage('refresh')` → background stale sync |

**Method subsystems** (independently understandable):

| Subsystem | Key methods | What it does |
|-----------|-------------|--------------|
| Budget display | `groupTransactions`, `categorySum`, `budgetRemaining`, `getProgressRatio`, `monthStats` | Groups txns by category, computes stats |
| Dialog orchestration | `buildEditCategoryDialog`, `buildEditTransactionDialog`, `onSubmit` | Opens dialogs, handles submit for category/transaction edits + rule creation |
| Triage flow | `openTriageFlow`, `triageAccept`, `triageSkip`, `triageAdvance` | Self-contained card-by-card categorization flow |
| Table / infinite scroll | `onTableVirtualScroll`, `openTableDialog`, `applyBulkCategory` | Show All table with scroll-to-load-more + bulk ops |
| Data lifecycle | `buildPage`, `onPullRefresh` | Sync or refresh from store, regroup, recalc stats |
| Formatting | `formatDollar`, `formatDate`, `merchantInitials`, `merchantColor` | Pure display helpers |

### `api.js` (1,026 lines)

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
| `matchesCondition(txn, condition)` | `frontend/src/utils/ruleUtils.js` | Evaluates a single condition object against a transaction. Single source of truth for client-side matching. |
| `sweepStore(store, conditions, categoryName, note, toSortOnly)` | `frontend/src/utils/ruleUtils.js` | Applies a rule to all matching transactions in the Vuex store. Used by all rule creation/edit flows. |
| `sweepCompoundRule(uid, conditions, action)` | `api.js` (module-level helper) | Backend equivalent — runs `updateMany` on `Plaid-Transactions`. Used by both `saveCompoundRule` and `updateCompoundRule` routes. |
| `evaluateCompoundRules(rules, txn)` | `utils/categoryMapping.js` | Evaluates an array of compound rules against a transaction during batch categorization. |
| `findSimilarTransactions(txn, txns)` | `frontend/src/utils/ruleUtils.js` | Auto-detects similar transactions via 3 strategies (merchant_name → name+account → name). Returns match data + rule type for automatic rule creation. |
| `RuleEditorDialog` | `frontend/src/components/RuleEditorDialog.vue` | Full compound rule create/edit UI. Reuse for any flow that creates or edits compound rules. |
| `store.state.bootstrapping` | `frontend/src/store.js` + `frontend/src/api.js` | Set `true` while `ensureAppData` is in-flight. Gate non-Budget view content — show skeleton/spinner while true, `EmptyState` only when false and data empty. See DESIGN.md "Loading states" for the three-state pattern. |
| `triggerSync()` | `frontend/src/api.js` | `POST /api/sync` — triggers Plaid sync. Returns `{ syncedAt }`. Only call on explicit user action or stale-data check. |
| `fetchTransactionsForMonth(month)` | `frontend/src/api.js` | `GET /api/transactions?month=YYYY-MM` — cheap DB read. Returns `{ transactions, total }`. |
| `fetchMonthRange(store, start, end)` | `frontend/src/api.js` | Fetches missing months in parallel, skipping cached ones. Commits `setMonthTransactions` for each. |
| `searchTransactions(search, page, limit)` | `frontend/src/api.js` | `GET /api/transactions?search=&page=&limit=` — server-side paginated search across all months. |

### Key architecture rules
- **Sweep logic lives in one place.** All client-side sweeps go through `sweepStore`. All backend sweeps go through `sweepCompoundRule`. Never write inline sweep loops.
- **Condition matching has one implementation per layer.** `matchesCondition` on the client; `conditionsToPostgresFilter` in `api.js` for the backend query; `evaluateCompoundRules` in `categoryMapping.js` for batch mapping. If you add a new condition type or operator, update **all three**.
- **Shared components over one-off markup.** `RuleEditorDialog`, `EmptyState`, `SkeletonBudget` — use them. Don't re-implement empty states inline.
- **Store mutations are the only way to update client state.** Never mutate `store.state.*` directly. Use existing mutations (`updateTransaction`, `updateRule`, `addRule`, etc.) or add a new named mutation.
- **No magic strings for fields/ops.** Condition fields (`merchant_name`, `name`, `amount`, `account`) and operators (`eq`, `contains`, `range`, `gt`, `lt`) must be consistent across `ruleUtils.js`, `categoryMapping.js`, `api.js`, and `RuleEditorDialog`. Add to all when extending.

## What works end-to-end
- Google Sign-In → Plaid bank link → transaction sync → budget dashboard
- Transaction editing (category, date, note, exclude from total)
- Auto-learn rules: recategorize once → all matching transactions updated
- Category management (add, edit budget limit, Plaid PFC mapping, type incl. savings)
- Rules management: view/delete/add merchant rules from Edit Category dialog
- **Compound rules**: multi-condition rules (merchant name, transaction name, amount, institution) created from triage, Edit Transaction dialog, or RuleEditorDialog; stored in `Basil-Rules`; evaluated before simple rules; retroactively sweep all matching transactions on creation or reapply; edit/delete in RulesView
- Merchant Browser (`/merchants`): top-down table, inline rule assignment per merchant
- Transaction search/filter: server-side search + amount range in "Show all" table
- Bulk categorization in table view (with disclosure note); Gmail-style long-press selection on mobile
- Charts (`/trends`): Spending (stacked bar), Cash Flow, Cumulative net, Savings rate
- Recurring transaction detection: badge on category rows, expected amount in Projections card
- Similarity engine: auto-detects similar transactions (3 strategies: merchant_name → name+account → name), shows reactive "Also categorize N similar" checkbox with count based on selected category
- Transaction display: prefers `merchant_name` over raw Plaid `name`; shows institution context for null-merchant transactions
- Admin portal (`:8081`): test user seed/nuke/login-as, toolbox (dedupe, seed, map unmapped, clear overrides, nuke)
- Onboarding: 3-step flow (connect bank → seed defaults → done) gated by `onboarded_at`
- Rule attribution: shows who created a rule and why (auto-learn, manual, compound)
- Venmo CSV import: enriches P2P transactions with counterparty names and notes
- Month-based data loading: loads current + 3 prior months from DB on mount, more on demand
- Background auto-sync: syncs with Plaid when data >4 hours stale, non-blocking
- Transaction relationships: split detection (incoming + outgoing P2P), return/refund detection, review UI with confirm/dismiss/undo, effective date alignment, auto-recategorization
- Plaid reconnect: detects stale tokens, surfaces reconnect prompt, launches Link in update mode
- Pre-triage Venmo enrichment prompt: skippable CSV import offer before sorting unsorted P2P transactions
- Post-triage Venmo CSV nudge: prompts import on "All caught up" screen when unenriched P2P payments were sorted (suppressed if pre-triage prompt was shown)
- Accounts view (`/accounts`): net worth hero card, per-institution account list, balance snapshots sparkline chart, cash runway calculation, credit utilization bars
- Manual accounts: add/edit/delete accounts for institutions Plaid doesn't support (balance-only, no transactions); swipe-to-edit on mobile, tap on desktop; grouped under existing or new institutions; `manual` boolean column on `plaid_accounts`; survives Plaid sync
- Balance snapshots: daily upsert per institution on sync, aggregated for net worth graph; manual account snapshots recomputed on balance update
- Bottom-sheet trays: all modals use `BasilTray` — bottom sheet on mobile with drag handle + swipe-to-dismiss, centered dialog on desktop
- Unified transaction row design across budget category view and all-transactions table
- PFC detail breakdown: stores and displays detailed Plaid Financial Category codes per category

---

## Pre-release projects

Three major features prioritized for release readiness. Ship in order — each
builds on the last.

### 1. Budget summary hero card — SHIPPED
BudgetView now leads with a "left to spend" hero card showing income minus
expenses minus savings, with animated numbers. Compact 3-column Actuals card
below (earned | spent | free cash flow). Optional "Fixed costs" summary line
when categories are flagged. Replaces the old Projections card.
- Fixed toggle available in Edit Category dialog (expense categories only)
- `Rent & Utilities` seeded as fixed by default for new users
- Budget Planner (`/plan`) now opens Edit Category dialog on row click
  (replaces inline editing)

### 2. Onboarding: auto-categorize + first insight (NEXT)
The current onboarding lands users on a dashboard full of "To Sort" transactions —
homework, not insight. 73% of fintech users disengage in week one. The fix is
reducing time-to-value by showing users something meaningful immediately.

**Three moves, in order:**
- **Auto-categorize on first sync.** Run PFC mapping + existing rules engine
  aggressively at first contact. Most transactions should arrive pre-sorted, not
  in "To Sort." The categorization engine exists — it just needs to run earlier
  and more aggressively for new users.
- **"Here's what we found" summary card after sync.** Show spending total, top 3
  categories by spend, and "N transactions need your help." Transforms first
  dashboard visit from "here's your homework" to "here's what we already know."
- **Replace sync spinner with preview cards.** 3-4 animated cards explaining what
  the app does during the 10-60s Plaid wait. Turns dead time into engagement.
- **Post-onboarding nudges (behavior-triggered).** After first visit with unsorted
  transactions: surface triage flow. After categorizing 5: celebrate + show rules
  created. After first week with no budget set: nudge on Projections card.

**Effort:** Medium. Categorization engine exists. Mostly frontend + summary card.
**Research:** `plans/onboarding-research.md`

### 3. Transaction splitting
Split a single transaction across multiple categories (Costco run = groceries +
household, Venmo blob = dinner + tickets). Table stakes — all major competitors
(YNAB, Monarch, Copilot, Lunch Money) support this.

**MVP:** Manual amount-based splitting from transaction detail. Parent row marked
`is_split_parent` and excluded from totals. Children get own categories. Unsplit
restores original. No auto-split rules in V1.

**Data model:** Two new columns on `transactions` — `parent_transaction_id` and
`is_split_parent`. Existing queries add `WHERE is_split_parent IS NOT TRUE`.

**Highest risk:** Plaid sync updating parent amount after user has split it.

**Effort:** Medium-large. Schema + API + split editor UI + filtering across all views.
**Research:** `plans/transaction-splitting-research.md`

---

## Things to build next

### High value
- [x] **Recurring transaction detection** — merchants appearing in ≥2 of last 3 complete
      months get an `autorenew` badge on their category row.
- [x] **Budget forecast** — Projections card shows expected amount from recurring merchants
      not yet seen this month, with merchant name (if one) or count (if multiple).
- [x] **Test data seed script** — `node scripts/seed-test-user.js` with 9 personas
      (fresh, connected, active, p2p, rules, splits, venmo, error, returns). Admin portal at `:8081` provides seed/nuke/login-as UI.
### Medium
- [ ] **Export to CSV** — low effort, occasionally very useful (taxes, sharing).
- [ ] **Rules & suggestion engine: user control + intent clarification** — two related
      problems to solve together: (1) Auto-learn intent: `manually_set: true` is now only
      set on pure single-transaction edits (no rule). When `ruleMode` is present in the
      transaction update request, `manually_set` is skipped — the entry point transaction
      stays sweepable. Remaining work: add an explicit "exclude from rules" checkbox in the
      Edit Transaction dialog so users can protect specific transactions on demand without
      conflating it with rule creation. (2) Suggestion engine controls: show why a suggestion
      was made (confidence reason chip), let users exclude a merchant from auto-suggestion,
      pin manual overrides so the engine stops second-guessing them, and review/edit
      auto-created rules without opening a full category dialog. Any design work on one
      touches the other.
- [x] **Rules view: transaction breakdown per rule** — expandable matched transactions
      list in RuleEditorDialog shows which transactions a rule matches. Client-side,
      filters `store.state.transactions`.
- [ ] **Fixed vs variable category dimension** — add a `fixed` / `variable` flag to
      categories (fixed = rent, subscriptions, loan payments; variable = dining, entertainment,
      shopping). Enables a bucketed budget view showing your cost floor (fixed) vs discretionary
      spend (variable). Could surface in BudgetView as a toggle or summary card, and in
      TrendsView as a stacked breakdown. Needs schema addition (`Basil-Categories`) + UI in
      the category edit dialog.
- [ ] **`manually_set_at` timestamp** — store `new Date()` alongside `manually_set: true`
      in the transaction update route (`api.js`). Enables attribution to show *when* the
      user categorized a transaction ("You categorized this · Mar 3"). Backend-only change;
      frontend reads the field in `getAttribution()`.
- [ ] **Spending trend chart: legend improvement** — current ECharts scroll legend
      is awkward on mobile. Consider wrapping HTML legend below chart.
- [ ] **Notification / alerts** — warn when a category approaches its budget limit.
      Needs a delivery mechanism decision (in-app banner vs email).
- [x] **"Show all" table: fetch older months on scroll** — infinite scroll on the
      virtual-scroll QTable fetches 3 more months when user nears the bottom. Stops
      when no more data exists.
- [ ] **User switching: clear store on identity change** — swapping users (via dev
      auth bypass or future admin portal "Login as") requires a hard refresh because
      sessionStorage + Vuex store retain the previous user's data. The "Login as" flow
      should clear the store and sessionStorage before authenticating as the new user.

### Accounts view (shipped)
- [x] **Plaid item error handling + reconnect flow** — detects Plaid error codes on sync,
      surfaces "reconnect your account" banner in AccountsView, launches Plaid Link in
      update mode. Error test persona available for testing.
- [x] **Sync failure visibility** — error toast on sync failure, orange warning badge
      on sync button when Plaid items have errors.
- [x] **Dynamic `earliestDate`** — set to 30 days before today at link time in `plaid-api.js`.
- [x] **Manual accounts** — add/edit/delete for institutions Plaid doesn't support.
      Balance-only, `manual` column on `plaid_accounts`, swipe-to-edit, institution
      picker with two-step flow. Survives Plaid sync.
- [x] **Balance snapshots + net worth graph** — daily upsert on sync, aggregated sparkline
      in AccountsView. Same-day balance changes update the snapshot (upsert).
- [ ] **ProfileView cleanup** — currently handles auth + linked accounts + removal.
      AccountsView now exists with overlap. Decide what stays in Profile vs moves to
      Accounts.

### Rule editor future operators
Shipped: `contains` (name/merchant), `gt` / `lt` (amount) — implemented in all three
layers (`ruleUtils.js`, `categoryMapping.js`, `api.js`). Remaining:
- **Amount:** `between` (range with min + max) — not yet built

### Production issues (current)
- [x] **Sync doesn't refresh UI** — BudgetView now watches `store.state.transactions`
      and auto-rebuilds when transactions change from external sources (sync button,
      pull-to-refresh). Internal mutations use `_internalMutation` guard to avoid
      double-regroup.

### Production issues (from initial launch testing)
- [x] **Persist login across sessions** — JWT moved from sessionStorage to localStorage.
      Users stay logged in across tabs and browser restarts (until sign-out or 7-day expiry).
- [x] **Relationship card tap targets too small on mobile** — removed `dense`/`size="sm"`,
      added 44px min-height/width, full-width stacked layout on mobile.
- [x] **PWA bottom chin / safe area** — safe area padding was already handled by
      Quasar's `q-ios-padding`. Removed duplicate. Hid indicator line and added M3-style
      pill highlight on active tab (green pill + color) so the nav flows into the chin.
- [x] **Budget planner card numbers not centered on mobile** — added `align-items: center`
      and `text-align: center` on summary cells at mobile breakpoint.
- [x] **Pull-to-refresh: native feel** — replaced Quasar's overlay spinner with custom
      `PullToRefresh.vue` component in App.vue. Page slides down with animated arrow +
      status text. Re-fetches from Postgres (no Plaid sync). All views get it automatically.
- [x] **Production admin portal** — `admin.basilbudgeting.com` deployed with Nginx,
      SSL (Let's Encrypt), cross-origin OAuth redirect. All admin API routes available
      in production including Login As (test user impersonation). Future: single-use
      token exchange for real-user impersonation parked on `feature/single-use-impersonation`.
- [ ] **Push notifications** — requires Service Worker + Push API + backend push service.
      Use case: budget limit alerts, sync completion, etc. Needs design decision on
      what's worth notifying about.
- [x] **"Show all" table horizontal overflow on mobile** — `width: 0; max-width: 1px`
      on name `<td>` forces it to yield space to amount column. Gmail-style long-press
      selection replaces checkbox column on mobile. Overflow-x hidden on container.
- [x] **Hide Plaid-managed categories from Rules view** — removed the "Plaid
      Auto-Categorization" section from RulesView. PFC mappings are managed via
      category settings, not the rules page.

### Observability
- [x] **Sync log table** — `sync_log` table records `synced_at`, `institution`,
      `added_count`, `modified_count`, `removed_count` per sync call. Only logs when
      something changed (no noise rows for no-op syncs). Migration: `006-sync-log.sql`.

### Tech debt
- [ ] **iOS keyboard audit for BasilTray dialogs** — audit all `BasilTray` usages with
      text inputs for iOS keyboard jitter (see DESIGN.md "iOS keyboard rule"). Short trays
      with text inputs near the bottom are vulnerable. Known safe: edit transaction (tall),
      rule editor (tall), triage (no text input). Known fixed: manual account add/edit.
      Check: VenmoEnrichmentDialog, any future trays with text inputs.
- [x] **Database + auth migration** — MongoDB → Postgres, Firebase → Google OAuth + JWT.
      Self-hosted on Hetzner VPS. See `plans/production-go-live.md`.
- [ ] **Admin toolbox route consolidation** — `/addTestTransactions` and `/addVenmoTransactions`
      share identical auth/admin/insert scaffolding. Refactor to a shared helper or a single
      route with a `type` parameter if more test-data tools are added. (Toolbox UI now in
      admin portal — `admin/src/views/ToolboxView.vue`.)
- [ ] **Rename `plaid_items` → `plaid_links`** — Plaid's "Item" jargon is confusing in
      our schema. Plan saved at `plans/kind-giggling-lake.md`. Cosmetic, do when convenient.
- [ ] **BudgetView: eliminate local transaction array** — `this.transactions` is still
      copied locally from `store.state.transactions` with manual sync. Works fine in
      practice. Low priority — clean up opportunistically if already working in BudgetView.
- [ ] **Test coverage: Plaid API routes + Vue component tests** — `plaid-api.js` routes
      (token exchange, account upsert) have no test coverage; needs Plaid client mocks.
      BudgetView interaction tests (long-press selection, bulk ops) need Vue Test Utils
      setup which doesn't exist yet.

### Dev tools
- [x] **Dev auth bypass** — "Login as test user" button on ProfileView login screen. Skips Google
      auth locally for faster iteration. Gated by `VITE_DEV_AUTH_BYPASS=true` (frontend) and
      `DEV_AUTH_BYPASS_UID=<firebase-uid>` (backend). Backend guard: only active if
      `NODE_ENV !== 'production'`. Feature is safe—completely absent from production builds.

### Rule editor UX improvements (backlog)
- [ ] **Simple rule editing via RuleEditorDialog** — merchant/name rules currently can
      only be deleted, not edited. A merchant rule is effectively a compound rule with a
      single `merchant_name eq` condition. Tapping a simple rule row should open
      RuleEditorDialog pre-populated with that condition + category, letting the user
      edit the value, change the category, or add more conditions (upgrading it to a
      compound rule). On save, delete the old simple rule and create a compound rule.
      Reuses the existing editor — no new dialog needed.
- [ ] **Rule label placement** — move the "Rule Name" field below the conditions panel
      so users build conditions first, then see/tweak the auto-generated label. Needs a
      demo before deciding — may feel worse in practice.
- [ ] **Rule editor: combobox for merchant name** — replace free-text input with a
      combobox (type-to-filter + accepts new values) populated from known merchants in
      `store.state.transactions`. Improves discoverability without locking users in.
- [ ] **Rule editor: pre-populate name from source transaction** — when creating a rule
      from a specific transaction, pre-fill the name field with that transaction's name.
      Full dropdown for name would be too noisy (too many unique values).

### Maybe / future
- [ ] **Customizable nav** — user picks which views appear in the bottom toolbar;
      everything else goes in a hamburger/overflow menu. Solves nav scaling as new
      views are added (Accounts, etc.) without hardcoding tab order.
- [ ] **Settings: Budget rollover** — whether unspent budget carries to next month or resets.
      Needs design decision: per-category or global? How to handle categories with no limit set?
- [ ] **Settings: First day of week** — affects weekly groupings if/when added.
- [ ] **Settings: Notification thresholds** — warn when a category hits X% of budget.
      Needs delivery mechanism decision (in-app banner vs email) and the alerts feature built first.
- [ ] **Sign in with Apple** — requires Apple Developer account ($99/yr), a registered
      domain, and a privacy policy URL. Would add a second OAuth provider in `auth-routes.js`
      alongside Google.

- [ ] **Iteration 3.5** — Multi-select in Merchant Browser: check multiple merchants,
      assign all to the same category in one Apply. See details below.
- [ ] **Iteration 4** — Bulk rule creation from transaction table: select rows →
      "Create rule for selected" alongside "Move to category".
- [x] **Onboarding wizard** — simplified to 3-step flow: connect bank → seed defaults → done.
      Custom category flow removed (see `plans/category-simplification.md`).
- [ ] **Savings category type** — schema exists, UI exists. Still need to decide
      whether to treat savings transfers as neutral in cash flow or deduct from net.

### P2P / Venmo intelligence (future)
Venmo/Zelle/Cash App transactions have zero distinguishing data from Plaid (no
counterparty, no memo, identical `name` field). The Venmo CSV import feature
(`utils/venmoEnrichment.js`, hamburger menu → "Venmo Import") is the first step.
Remaining ideas:

- [ ] **Multi-provider P2P import** — add a provider picker (Venmo, Zelle, Cash App)
      before the CSV upload step so the parser knows which format to expect. Each
      provider has a different CSV layout. Currently only Venmo is supported.

- [x] **Split detection** — transaction relationship detection shipped (3 phases):
      incoming splits (amount ratio + date proximity), outgoing splits (Venmo note →
      merchant name matching), and returns/refunds (same merchant + amount). Review UI
      on budget page, confirm/dismiss/undo in Edit Transaction dialog, effective date
      alignment, auto-recategorization. Post-triage nudge for Venmo CSV import.
      See `plans/transaction-relationships.md`.
- [ ] **Shared expense circles** — let friend groups opt in. When one user categorizes
      a shared transaction, auto-suggest the matching category for the other. Small
      network effect that makes budgeting feel collaborative. Requires multi-user
      infrastructure (invites, shared context) — significant lift.
- [ ] **P2P spending insights ("Venmo Wrapped")** — make categorizing P2P transactions
      unlock insights people want: "You spent $2,400 eating out with friends this year"
      or "Your most expensive friendship is with Jake ($1,800)." Curiosity about social
      spending patterns as the motivation loop for manual tagging.

---

## Rules Management — implementation notes

All four iterations shipped. Key patterns for future agents:

### What simple rules look like in Postgres
```sql
-- simple_rules table: one row per rule
(id, category_id, user_id, rule_type='merchant_name', rule_value='Uber')
```
Only `merchant_name` and `name` are created by auto-learn. Rule UI shows only these.

### Iteration 1 ✓ — View & delete rules (Edit Category dialog)
Chips for each rule, click × to stage removal (strikethrough), fires on Submit.
- `pendingRuleRemovals` in `DialogComponent.data()`, processed in `BudgetView.onSubmit()`
- Backend: `POST /api/deleteRule` → deletes from `simple_rules` table
- Store: `updateCategoryRules` mutation

### Iteration 2 ✓ — Add rules (Edit Category dialog)
Searchable merchant dropdown in the dialog, adds rule + re-categorizes on Submit.
- `pendingRuleAdditions` in `DialogComponent.data()`, processed in `BudgetView.onSubmit()`
- Backend: `POST /api/saveRule` → inserts into `simple_rules` + updates matching transactions
- Store: `addCategoryRule` mutation

### Iteration 3 ✓ — Merchant Browser (`/merchants`)
Top-down table: Merchant | Txns | Current category | Assign (inline q-select + Apply).
- Backend: `GET /api/merchantStats` (aggregation by merchant_name, count, categories)
- Retroactive disclosure banner at top of page
- Rule icon + tooltip when explicit merchant_name rule exists
- Pre-populates selects from store ruleMap on mount

### Compound rules ✓ — multi-condition rules (triage + dialog + RuleEditorDialog)
Stored in `compound_rules` table as `{ user_id, label, conditions (JSONB), action (JSONB), created_at, created_from }`.
- `conditions`: array of `{ field, op, value }` — supported fields: `merchant_name` (`eq`|`contains`), `name` (`eq`|`contains`), `amount` (`eq`|`range`|`gt`|`lt`), `account` (`eq`)
- `action`: `{ type: 'categorize', categoryName, note? }`
- Evaluated before all simple rules in `utils/categoryMapping.js → evaluateCompoundRules()`
- Created from: Sort Transactions triage card, Edit Transaction dialog, or RuleEditorDialog
- Both triage + dialog flows use `findSimilarTransactions` to auto-detect matching transactions and determine rule type; users see a simple "Also categorize N similar" checkbox with actionable count reactive to the selected target category
- Creation sweeps all matching non-`manually_set` transactions (client: `sweepStore`; backend: `sweepCompoundRule`)
- Duplicate guard: `findExistingRule()` in BudgetView checks store; if found with different category, calls `updateCompoundRule`; backend returns 409
- Edit/delete in RulesView; edit opens RuleEditorDialog with "Apply to existing transactions" checkbox
- Key helpers in BudgetView: `triageActionableCount` computed, `triageSimilar` computed
- Sweep helpers: `sweepStore()` in `ruleUtils.js` (frontend); `sweepCompoundRule()` in `api.js` (backend)

### Iteration 3.5 — Multi-select in Merchant Browser (maybe)
Select multiple merchants → assign all to one category. Better than "Apply All"
(which removes per-row feedback). Use `selection="multiple"` + category picker above
table, same pattern as BudgetView bulk categorize.

### Iteration 4 — Bulk rule creation from transaction table (future)
Lower priority — Iterations 2 and 3 cover this use case better top-down.

---

## Visualizations — implementation notes

All charts live in `TrendsView.vue` (`/trends`). Uses `vue-echarts` + `echarts`.
All aggregation is client-side from `store.state.transactions` — no new backend
endpoints. Controls: 3/6/12 month range toggle; Income/Payments toggles on
Spending tab only.

### Spending tab ✓
Stacked bar by category, month-over-month. Zero-spend categories hidden.

### Cash Flow tab ✓
Net (income − expenses) per month. Green/red bars, dashed zero line.

### Cumulative tab ✓
Running sum of monthly net. Smooth line + area fill, red→green via `visualMap`.

### Savings tab ✓
Dual-axis: monthly saved $ (green bars) + savings rate % of income (blue line).
Empty state guides user to create a Savings-type category if none exists.
`monthlyNet` excludes savings from both sides (savings treated as neutral in
cash flow charts — revisit if needed).

---

## Design System

**Full spec:** `DESIGN.md` in the repo root. Read it before writing any new UI.

### Key rules (must follow in every PR)
- **All colors via tokens** — `var(--basil-*)`. Never hardcode hex values.
- **Token file:** `frontend/src/styles/tokens.css` — surfaces, text, brand, semantic,
  category accents, spacing, radius, shadow, motion, fonts.
- **Quasar brand colors** synced via `frontend/src/styles/quasar.variables.sass`.

### Fonts — three roles, never mix
| Role | Token | When |
|------|-------|------|
| Display | `--basil-font-display` (DM Serif Display) | Hero dollar amounts, large stats |
| UI | `--basil-font-ui` (DM Sans) | Everything else |
| Mono | `--basil-font-mono` (JetBrains Mono) | Tabular amounts in tables |

Utility classes: `basil-display` (display font), `basil-mono` (mono + tabular nums).

### Dark mode
- Activated by `[data-theme="dark"]` on `<html>` — managed by `store.commit('setTheme', 'dark'|'')`.
- **Layer 1:** token value overrides in `tokens.css` — any component using `var(--basil-*)` adapts automatically.
- **Layer 2:** Quasar component overrides (hardcoded backgrounds that ignore CSS vars) in **`App.vue`** global style dark mode section — canonical location, use `!important`.
- Never add Quasar dark overrides in `quasar-overrides.css` or component scoped styles.

### CSS naming
All custom classes: `basil-[block]__[element]--[modifier]` (BEM-like, `basil-` prefix).
Never create classes starting with `q-` (Quasar's namespace).

### Component patterns
- **Card header:** `<div class="basil-card-head"><span class="basil-card-label">Title</span></div>`
- **Empty state:** `<EmptyState icon="..." heading="..." body="..." />`
- **Loading (BudgetView):** `<SkeletonBudget />` — not a spinner
- **Charts:** spread `ANIMATION` constant, use `CHART_PALETTE`, render HTML legend below chart
- **Dialogs:** import `dialogs.css`; use `basil-dialog-card` / `basil-dialog-header` / `basil-dialog-title` shell. Don't reinvent the shell structure per dialog — see `RuleEditorDialog.vue`.
- **View CSS:** large views externalize styles to `frontend/src/styles/[ViewName].css` and import at top of `<style>` block

---

## Recent history (for context)
- **Production launch (Mar 2026)**: MongoDB → Postgres migration, Firebase → Google
  OAuth + JWT, deployed to Hetzner VPS with Docker Postgres, PM2, Nginx, Let's Encrypt.
  CI/CD via GitHub Actions. Sentry error tracking added.
- **Performance**: Nginx gzip compression (1.3MB→412KB JS), static asset cache headers
  (1-year immutable for Vite hashed files). See `plans/performance-optimizations.md`.
- **PWA**: manifest.json + iOS meta tags for home screen standalone mode
- **Post-login redirect**: router guard awaits auth hydration before first navigation;
  onboarded users redirect from `/` to `/accounts` on initial load
- **Plaid fix**: CSP updated to allow Plaid iframe; non-admin users now get production
  Plaid credentials in production (was incorrectly routing to sandbox)
- **Tech debt cleanup**: removed hardcoded passwords, debug logs, stale columns; added
  unique constraints; cleaned up dead files. See `plans/production-tech-debt.md`.
- **Persist login**: JWT moved from sessionStorage to localStorage. Users stay logged
  in across browser restarts.
- **Rule sweep fix**: frontend store now updates all matching transactions immediately
  when a merchant rule is created (was only sweeping "To Sort" or not sweeping at all).
- **Pull-to-refresh**: custom `PullToRefresh.vue` component in App.vue replaces Quasar
  spinner. Page slides down with animated arrow. Re-fetches from Postgres only (sync
  button is the only way to trigger Plaid). Works on all views.
- **Plaid accounts persistence fix**: `plaid_accounts` rows weren't created on initial
  bank link — only `plaid_items`. Fixed by adding `accountsGet` + `upsertPlaidAccounts`
  after token exchange in `plaid-api.js`. Safety net: balance sync also upserts.
- **Mobile table overhaul**: "Show all" table amount column clipping fixed via
  `width: 0; max-width: 1px` on name `<td>`. Checkbox column replaced with Gmail-style
  long-press selection (500ms touch → selection mode, avatar becomes checkmark).
- **Local mobile testing**: Vite `host: 0.0.0.0`, CORS allows `192.168.*` in dev,
  `upgrade-insecure-requests` moved from HTML meta tag to helmet (production only).
  Admin Login As uses dynamic hostname instead of hardcoded localhost.
- **Bottom-sheet trays**: all modals converted to `BasilTray` — bottom sheet on mobile
  with drag handle + swipe-to-dismiss, centered dialog on desktop. Swipe-to-delete on
  BudgetPlannerView category rows. Edit pencils removed from BudgetView category rows.
- **Unified transaction rows**: consistent design across budget category view and
  all-transactions table.
- **PFC detail breakdown**: stores and displays detailed Plaid Financial Category codes;
  single-PFC categories show their breakdown.
- **Excluded txn fix**: excluded-only categories no longer disappear; exclude toggle
  saves correctly.
- **Balance snapshot upsert**: snapshots update same-day when balances change (was
  insert-only, skipping subsequent syncs). Uses `ON CONFLICT DO UPDATE` with
  `IS DISTINCT FROM` guard.
- **Manual accounts**: add/edit/delete accounts for unsupported institutions. `manual`
  boolean column on `plaid_accounts`. Two-step add flow (pick institution → account
  details). Swipe-to-edit on mobile, tap on desktop. Survives Plaid sync.
- **Pre-triage Venmo enrichment**: skippable CSV import prompt before sorting unsorted
  P2P transactions. Post-triage nudge suppressed if already offered.
- **iOS keyboard fix**: documented BasilTray keyboard jitter issue in DESIGN.md.
  Short trays need sufficient content below inputs to avoid iOS Safari repositioning.
- **Transaction ID reconciliation**: `insertTransactions` reconciles stale Plaid IDs
  from MongoDB migration by matching on (name, amount, date, account). Tags preserved
  via delete/re-insert. Sync log table (`sync_log`) records per-institution sync stats.
- **BudgetView auto-refresh**: watches `store.state.transactions` so UI updates after
  sync without app restart. Bottom nav hides when iOS keyboard is open.
- **Budget summary hero card**: BudgetView leads with "left to spend" hero card,
  compact 3-column Actuals. Fixed costs as optional summary line. Animated numbers.
- **Budget Planner dialog**: category rows on `/plan` open Edit Category dialog
  (replaces inline editing). Full category management: name, limit, PFC, rules, fixed.
- **Enrichment search**: server + client search includes `venmo_counterparty` and
  `venmo_note`. Triage cards show enriched names. All-transactions table maintains
  stable min-height. Enrichment confidence scoring improved.
