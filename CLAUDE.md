# Project: animated-space-waffle (personal finance / budget tracker)

## Top rules (always apply)

1. **Search for existing patterns before creating anything new.** Grep/glob the codebase
   first. State what you found. Extend existing abstractions over building parallel ones.
2. **Use shared utilities and Basil components.** See `.claude/rules/` for the full
   lookup table and path-scoped rules that load automatically.
3. **Check deployment artifacts when adding directories or moving files.** Dockerfile,
   CI workflow, .dockerignore — they're part of the change.

Detailed rules live in `.claude/rules/` and load automatically based on which files
you're touching. See: `frontend-ui.md`, `shared-utilities.md`, `sweep-and-rules.md`,
`deployment.md`, `state-management.md`.

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
| Formatting | `formatDate`, `merchantInitials`, `merchantColor` | Pure display helpers (`formatDollar` moved to shared `formatDollar.js`) |

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

## Shared utilities

Full lookup table is in `.claude/rules/shared-utilities.md` (auto-loaded when touching
relevant files). Key ones to know about: `CATEGORY_TYPES`, `freeCashFlow`, `formatDollar`,
`formatSignedDollar`, `txnDate`/`txnDayjs`/`txnMonth`/`isInMonth`, `isP2PTransaction`,
`matchesCondition`, `sweepStore`. All live in `shared/` or `frontend/src/utils/`.

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

**P2P detection (`isP2PTransaction`)** lives in `shared/p2pDetection.js` — single
canonical source for both frontend and backend. Checks `account`, `merchant_name`,
and `name` against the pattern list. Add new P2P providers there.

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

- [ ] **Transaction drill-down polish** — The drill-down view is functional but bare.
      Needs: merchant icons/initials, visual grouping by date, summary header with
      total + category context. Read-only insight view (not tap-to-edit). Match the
      polish level of BudgetView's category transaction rows.
- [ ] **PFC detail override system** — Let users correct Plaid's PFC detail codes.
      Extends compound rule actions with optional `pfcDetailOverride` field. New
      `effective_pfc_detail` column on transactions. Spending breakdown reads
      `effective_pfc_detail || plaidPfcDetail`. UX: tap transaction in drill-down →
      pick correct PFC detail → auto-maps to Basil category (with override option).
      Recurring transactions handled by existing compound rule matching — no new rule
      layer. Differentiator: no competitor lets users control subcategory data.
      Needs full brainstorm + design before implementation.
- [ ] **Design language: shadow and depth** — Basil currently uses flat surfaces with
      borders, no shadows (except tray). Brainstorm whether introducing a deliberate
      shadow/elevation system would improve the design — e.g., interactive elements
      feeling tappable, cards lifting on hover/press, layered surfaces. Needs to be
      cohesive, not ad-hoc. Full brainstorm before any implementation.

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
- [ ] **Transaction drill-down: animated back navigation** — back button currently does
      an instant swap (`:css="false"`) to avoid double-animation with iOS swipe-back.
      Explore a JS-driven reverse slide that skips when popstate (swipe) triggers it
      but animates for the back button tap.
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
