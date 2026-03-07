# Project: animated-space-waffle (personal finance / budget tracker)

## Standard operating procedures — read first

These apply to every task, every session, including after context compaction.

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
   (`conditionsToMongoFilter`).

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

**Stack:** Vue 3 + Quasar 2 + Vuex 4 (frontend) · Express.js + MongoDB (backend) ·
Firebase Google Auth · Plaid API

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
| `index.js` | Express entry point — helmet, CORS, rate-limit, firebase-admin init |
| `api.js` | All app API routes |
| `plaid-api.js` | Plaid Link token, token exchange, account removal |
| `db/database.js` | MongoDB singleton connection pool + all DB helpers |
| `frontend/src/views/BudgetView.vue` | Main dashboard — monthly budget, transactions |
| `frontend/src/views/TrendsView.vue` | Charts — Spending, Cash Flow, Cumulative, Savings |
| `frontend/src/views/MerchantBrowser.vue` | Top-down merchant rule assignment |
| `frontend/src/views/RulesView.vue` | View/edit/delete all compound rules |
| `frontend/src/views/ProfileView.vue` | Auth (Google sign-in) + linked accounts |
| `frontend/src/views/ApiDir.vue` | Admin toolbox (dedupe, seed, map unmapped, clear manual overrides, etc.) |
| `frontend/src/components/DialogComponent.vue` | Edit transaction / category dialog |
| `frontend/src/components/RuleEditorDialog.vue` | Compound rule create/edit dialog |
| `frontend/src/utils/ruleUtils.js → findSimilarTransactions()` | Auto-detects similar transactions and determines best rule strategy |
| `frontend/src/components/PlaidLinkHandler.vue` | Plaid Link iframe component |
| `frontend/src/store.js` | Vuex store (user, session, transactions, categories, rules) |
| `frontend/src/firebase.js` | All fetch calls to backend API + Firebase auth helpers |
| `frontend/src/utils/ruleUtils.js` | Shared condition matching + store sweep utilities |
| `utils/categoryMapping.js` | Transaction categorization rule engine |

## Architecture notes
- **Auth:** Firebase ID token sent as `Authorization: Bearer <token>` header on every
  backend request. Backend verifies with `firebase-admin`.
- **MongoDB collections:** `Basil-Users`, `Plaid-Transactions`, `Plaid-Accounts`,
  `Basil-Categories`, `Basil-Rules` (compound rules)
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
- **DNS fix:** `index.js` sets `dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4'])`
  at startup — required on Node 24 + Windows because c-ares uses TCP for SRV queries
  and home routers only support DNS over UDP.
- **Env vars:** Root `.env` uses `VUE_APP_FIREBASE_*` (consumed by `index.js` backend).
  `frontend/.env` uses `VITE_FIREBASE_*` (consumed by Vite build).

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
| `store.state.bootstrapping` | `frontend/src/store.js` + `frontend/src/firebase.js` | Set `true` while `ensureAppData` is in-flight. Gate non-Budget view content — show skeleton/spinner while true, `EmptyState` only when false and data empty. See DESIGN.md "Loading states" for the three-state pattern. |

### Key architecture rules
- **Sweep logic lives in one place.** All client-side sweeps go through `sweepStore`. All backend sweeps go through `sweepCompoundRule`. Never write inline sweep loops.
- **Condition matching has one implementation per layer.** `matchesCondition` on the client; `conditionsToMongoFilter` in `api.js` for the backend query; `evaluateCompoundRules` in `categoryMapping.js` for batch mapping. If you add a new condition type or operator, update **all three**.
- **Shared components over one-off markup.** `RuleEditorDialog`, `EmptyState`, `SkeletonBudget` — use them. Don't re-implement empty states inline.
- **Store mutations are the only way to update client state.** Never mutate `store.state.*` directly. Use existing mutations (`updateTransaction`, `updateRule`, `addRule`, etc.) or add a new named mutation.
- **No magic strings for fields/ops.** Condition fields (`merchant_name`, `name`, `amount`, `account`) and operators (`eq`, `range`) must be consistent across `ruleUtils.js`, `categoryMapping.js`, `api.js`, and `RuleEditorDialog`. Add to all when extending.

## What works end-to-end
- Google Sign-In → Plaid bank link → transaction sync → budget dashboard
- Transaction editing (category, date, note, exclude from total)
- Auto-learn rules: recategorize once → all matching transactions updated
- Category management (add, edit budget limit, Plaid PFC mapping, type incl. savings)
- Rules management: view/delete/add merchant rules from Edit Category dialog
- **Compound rules**: multi-condition rules (merchant name, transaction name, amount, institution) created from triage, Edit Transaction dialog, or RuleEditorDialog; stored in `Basil-Rules`; evaluated before simple rules; retroactively sweep all matching transactions on creation or reapply; edit/delete in RulesView
- Merchant Browser (`/merchants`): top-down table, inline rule assignment per merchant
- Transaction search/filter: text search + month sync + amount range in "Show all" table
- Bulk categorization in table view (with disclosure note)
- Charts (`/trends`): Spending (stacked bar), Cash Flow, Cumulative net, Savings rate
- Recurring transaction detection: badge on category rows, expected amount in Projections card
- Admin toolbox: dedupe, seed categories, clean pending, map unmapped, clear manual overrides

---

## Things to build next

### High value
- [x] **Recurring transaction detection** — merchants appearing in ≥2 of last 3 complete
      months get an `autorenew` badge on their category row.
- [x] **Budget forecast** — Projections card shows expected amount from recurring merchants
      not yet seen this month, with merchant name (if one) or count (if multiple).

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
- [ ] **Rules view: transaction breakdown per rule** — when viewing or editing a rule in
      RulesView / RuleEditorDialog, show which transactions it matches and how they're spread
      across categories (e.g. "15 matched: 10 Coffee, 3 Food, 2 To Sort"). Gives power users
      visibility into what a rule is doing. Uses `findSimilarTransactions` match data or a
      dedicated rule-match query. Client-side only (filter `store.state.transactions`).
- [ ] **Fixed vs variable category dimension** — add a `fixed` / `variable` flag to
      categories (fixed = rent, subscriptions, loan payments; variable = dining, entertainment,
      shopping). Enables a bucketed budget view showing your cost floor (fixed) vs discretionary
      spend (variable). Could surface in BudgetView as a toggle or summary card, and in
      TrendsView as a stacked breakdown. Needs schema addition (`Basil-Categories`) + UI in
      the category edit dialog.
- [ ] **Spending trend chart: legend improvement** — current ECharts scroll legend
      is awkward on mobile. Consider wrapping HTML legend below chart.
- [ ] **Notification / alerts** — warn when a category approaches its budget limit.
      Needs a delivery mechanism decision (in-app banner vs email).

### Prerequisites for Accounts & Balances feature
These should be resolved before building the Accounts view. See `plans/accounts-balances.md`.

- [ ] **Plaid item error handling + reconnect flow** — the most critical blocker. When a
      Plaid token goes stale (user changes bank password, institution requires re-auth),
      the app currently fails silently. Need to detect Plaid error codes (e.g.
      `ITEM_LOGIN_REQUIRED`) on sync, surface a "reconnect your account" prompt, and
      launch Plaid Link in update mode. Without this, an Accounts view showing stale/missing
      balances will look like a broken app.
- [ ] **Sync failure visibility** — if a transaction sync fails, the user sees stale data
      with no indication anything is wrong. Add error state handling so failures surface
      rather than silently disappear.
- [x] **Dynamic `earliestDate`** — set to 30 days before today at link time in `plaid-api.js`.
- [ ] **ProfileView cleanup** — currently handles auth + linked accounts + removal. Once
      a dedicated Accounts view exists there will be overlap. Decide what stays in Profile
      vs moves to Accounts before building the new view.

### Rule editor future operators (not yet built)
When the rule editor condition fields are extended, these operators should be added:
- **Name / Merchant name:** `contains` (currently exact-match only)
- **Amount:** `>` (greater than), `<` (less than), `between` (range with min + max)
These require changes to `utils/categoryMapping.js → matchesCondition()` and the
`conditionsToMongoFilter()` helper in `api.js → /saveCompoundRule`.

### Tech debt
- [ ] **Admin toolbox route consolidation** — `/addTestTransactions` and `/addVenmoTransactions`
      share identical auth/admin/insert scaffolding. Refactor to a shared helper or a single
      route with a `type` parameter if more test-data tools are added.

### Dev tools
- [x] **Dev auth bypass** — "Login as test user" button on ProfileView login screen. Skips Google
      auth locally for faster iteration. Gated by `VITE_DEV_AUTH_BYPASS=true` (frontend) and
      `DEV_AUTH_BYPASS_UID=<firebase-uid>` (backend). Backend guard: only active if
      `NODE_ENV !== 'production'`. Feature is safe—completely absent from production builds.

### Maybe / future
- [ ] **Customizable nav** — user picks which views appear in the bottom toolbar;
      everything else goes in a hamburger/overflow menu. Solves nav scaling as new
      views are added (Accounts, etc.) without hardcoding tab order.
- [ ] **Settings: Budget rollover** — whether unspent budget carries to next month or resets.
      Needs design decision: per-category or global? How to handle categories with no limit set?
- [ ] **Settings: First day of week** — affects weekly groupings if/when added.
- [ ] **Settings: Notification thresholds** — warn when a category hits X% of budget.
      Needs delivery mechanism decision (in-app banner vs email) and the alerts feature built first.
- [ ] **Sign in with Apple** — Firebase Auth supports it; requires Apple Developer account ($99/yr),
      a registered domain, and a privacy policy URL. Apple-side setup is the main effort;
      frontend change is minimal (swap `GoogleAuthProvider` for `OAuthProvider('apple.com')`).

- [ ] **Iteration 3.5** — Multi-select in Merchant Browser: check multiple merchants,
      assign all to the same category in one Apply. See details below.
- [ ] **Iteration 4** — Bulk rule creation from transaction table: select rows →
      "Create rule for selected" alongside "Move to category".
- [ ] **Onboarding wizard** — connect account → seed categories → set budgets in one
      guided flow. Polish item; app already works end-to-end.
- [ ] **Savings category type** — schema exists, UI exists. Still need to decide
      whether to treat savings transfers as neutral in cash flow or deduct from net.

### P2P / Venmo intelligence (future)
Venmo/Zelle/Cash App transactions have zero distinguishing data from Plaid (no
counterparty, no memo, identical `name` field). These ideas tackle that gap:

- [ ] **Split detection** — if a user has a $94 restaurant charge and a $47 Venmo
      incoming payment shortly after, infer it's a split payback. Present the theory
      ("Looks like someone paid you back for half of Sushi Palace"), let user confirm
      with a tap. Turns reconciliation into a satisfying detective game.
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

### What rules look like in MongoDB
```json
{ "rules": { "merchant_name": ["Uber"], "name": ["Specific Txn Name"] } }
```
Only `merchant_name` and `name` are created by auto-learn. Rule UI shows only these.

### Iteration 1 ✓ — View & delete rules (Edit Category dialog)
Chips for each rule, click × to stage removal (strikethrough), fires on Submit.
- `pendingRuleRemovals` in `DialogComponent.data()`, processed in `BudgetView.onSubmit()`
- Backend: `POST /api/deleteRule` → `$pull` on `Basil-Categories`
- Store: `updateCategoryRules` mutation

### Iteration 2 ✓ — Add rules (Edit Category dialog)
Searchable merchant dropdown in the dialog, adds rule + re-categorizes on Submit.
- `pendingRuleAdditions` in `DialogComponent.data()`, processed in `BudgetView.onSubmit()`
- Backend: `POST /api/saveRule` → `$addToSet` + `updateMany` on transactions
- Store: `addCategoryRule` mutation

### Iteration 3 ✓ — Merchant Browser (`/merchants`)
Top-down table: Merchant | Txns | Current category | Assign (inline q-select + Apply).
- Backend: `GET /api/merchantStats` (aggregation by merchant_name, count, categories)
- Retroactive disclosure banner at top of page
- Rule icon + tooltip when explicit merchant_name rule exists
- Pre-populates selects from store ruleMap on mount

### Compound rules ✓ — multi-condition rules (triage + dialog + RuleEditorDialog)
Stored in `Basil-Rules` collection as `{ userId, label, conditions[], action, createdAt, createdFrom }`.
- `conditions`: array of `{ field, op, value }` — supported fields: `merchant_name`, `name`, `amount` (`eq`|`range`), `account` (`eq`)
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
- Extracted `sweepStore` + `matchesCondition` to `frontend/src/utils/ruleUtils.js`; removed all inline sweep implementations from BudgetView and RuleEditorDialog
- Extracted `sweepCompoundRule` backend helper in `api.js`; both save + update routes call it
- Built `RuleEditorDialog` — full compound rule create/edit UI with condition builder, note field, tags placeholder, and "Apply to existing transactions" checkbox
- Added `account` (institution) condition type; `transaction.account` stamped at sync time in `plaidTools.js`
- Fixed `manually_set` intent: only set on pure manual edits (no `ruleMode`); rule-creation flows stay sweepable
- Added `findExistingRule` (replaces `isDuplicateRule`) — detects duplicate rules and applies category updates when category differs
- Added unit tests: `ruleUtils.test.js` (25 tests) + compound rule tests in `categoryMapping.test.js`
- Type-colored category badges in RulesView (design token pairs, BEM classes)
- Built compound rules feature: multi-condition rules from triage or Edit Transaction dialog, stored in `Basil-Rules`, evaluated first in rule engine
- Replaced `RuleModeSelector` with `findSimilarTransactions` similarity engine — auto-detects matching transactions and creates the right rule type behind the scenes
- Actionable count in similarity checkbox reactive to selected target category (excludes matches already in target + `manually_set`)
- Transaction display: category list prefers `merchant_name`; institution context shown in category list, triage card, table, and dialog for null-merchant transactions
- Built Merchant Browser, rules management iterations 1–3, transaction search/filter
- Built TrendsView with 4 chart tabs (Spending, Cash Flow, Cumulative, Savings)
- Fixed Plaid `earliestDate` to be dynamic (30 days back) instead of hardcoded
- Added `savings` category type to schema + dialog dropdown
- Migrated from Vue CLI / webpack to **Vite 7**
- Added **helmet**, CORS restriction, rate limiting, MongoDB singleton pool
