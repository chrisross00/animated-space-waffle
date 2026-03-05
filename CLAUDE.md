# Project: animated-space-waffle (personal finance / budget tracker)

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
| `frontend/src/views/ProfileView.vue` | Auth (Google sign-in) + linked accounts |
| `frontend/src/views/ApiDir.vue` | Admin toolbox (dedupe, seed, map unmapped, etc.) |
| `frontend/src/components/DialogComponent.vue` | Edit transaction / category dialog |
| `frontend/src/components/PlaidLinkHandler.vue` | Plaid Link iframe component |
| `frontend/src/store.js` | Vuex store (user, session, transactions, categories) |
| `frontend/src/firebase.js` | All fetch calls to backend API + Firebase auth helpers |
| `categoryMapping.js` | Transaction categorization rule engine |

## Architecture notes
- **Auth:** Firebase ID token sent as `Authorization: Bearer <token>` header on every
  backend request. Backend verifies with `firebase-admin`.
- **MongoDB collections:** `Basil-Users`, `Plaid-Transactions`, `Plaid-Accounts`,
  `Basil-Categories`
- **Category types:** `income` / `expense` / `payment` / `savings`
- **DNS fix:** `index.js` sets `dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4'])`
  at startup — required on Node 24 + Windows because c-ares uses TCP for SRV queries
  and home routers only support DNS over UDP.
- **Env vars:** Root `.env` uses `VUE_APP_FIREBASE_*` (consumed by `index.js` backend).
  `frontend/.env` uses `VITE_FIREBASE_*` (consumed by Vite build).

## What works end-to-end
- Google Sign-In → Plaid bank link → transaction sync → budget dashboard
- Transaction editing (category, date, note, exclude from total)
- Auto-learn rules: recategorize once → all matching transactions updated
- Category management (add, edit budget limit, Plaid PFC mapping, type incl. savings)
- Rules management: view/delete/add merchant rules from Edit Category dialog
- Merchant Browser (`/merchants`): top-down table, inline rule assignment per merchant
- Transaction search/filter: text search + month sync + amount range in "Show all" table
- Bulk categorization in table view (with disclosure note)
- Charts (`/trends`): Spending (stacked bar), Cash Flow, Cumulative net, Savings rate
- Recurring transaction detection: badge on category rows, expected amount in Projections card
- Admin toolbox: dedupe, seed categories, clean pending, map unmapped

---

## Things to build next

### High value
- [x] **Recurring transaction detection** — merchants appearing in ≥2 of last 3 complete
      months get an `autorenew` badge on their category row.
- [x] **Budget forecast** — Projections card shows expected amount from recurring merchants
      not yet seen this month, with merchant name (if one) or count (if multiple).

### Medium
- [ ] **Export to CSV** — low effort, occasionally very useful (taxes, sharing).
- [ ] **Spending trend chart: legend improvement** — current ECharts scroll legend
      is awkward on mobile. Consider wrapping HTML legend below chart.
- [ ] **Notification / alerts** — warn when a category approaches its budget limit.
      Needs a delivery mechanism decision (in-app banner vs email).

### Needs design decision
- [ ] **Auto-learn intent clarification** — currently, checking "remember category" on a
      transaction edit does two things: (1) creates a rule, and (2) sweeps ALL other
      matching transactions to that category. It's unclear if these should always go
      together. Use cases to resolve:
      - Should "remember category" imply "move everything else now"? Or just "apply going forward"?
      - Should a manual single-transaction edit (no "remember category") still protect
        that transaction from future sweeps via `manually_set: true`? (Currently: yes.)
      - Should auto-learn sweeps respect `manually_set`? (Currently: yes — they skip
        manually-set transactions, same as Merchant Browser rules.)
      The `manually_set` flag is implemented in `api.js`. The open question is whether
      the UX of "remember category" should be split into two distinct actions.

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
- [ ] **Dynamic `earliestDate`** — currently hardcoded to `'2022-07-29'` in plaid-api.js
      for all users. Should be set dynamically at link time (e.g. 24 months back from
      today) so new users get appropriate history and the value isn't stale forever.
- [ ] **ProfileView cleanup** — currently handles auth + linked accounts + removal. Once
      a dedicated Accounts view exists there will be overlap. Decide what stays in Profile
      vs moves to Accounts before building the new view.

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
- Token overrides in `tokens.css`. Quasar component overrides in the dark mode section of `App.vue`.
- New components: use only `var(--basil-*)` tokens and they adapt automatically.
  If a Quasar component still shows a light background in dark mode, add a
  `[data-theme="dark"] .q-whatever { background-color: var(--basil-surface) !important; }`
  override to `App.vue`.

### CSS naming
All custom classes: `basil-[block]__[element]--[modifier]` (BEM-like, `basil-` prefix).
Never create classes starting with `q-` (Quasar's namespace).

### Component patterns
- **Card header:** `<div class="basil-card-head"><span class="basil-card-label">Title</span></div>`
- **Empty state:** `<EmptyState icon="..." heading="..." body="..." />`
- **Loading (BudgetView):** `<SkeletonBudget />` — not a spinner
- **Charts:** spread `ANIMATION` constant, use `CHART_PALETTE`, render HTML legend below chart

---

## Recent history (for context)
- Built Merchant Browser, rules management iterations 1–3, transaction search/filter
- Built TrendsView with 4 chart tabs (Spending, Cash Flow, Cumulative, Savings)
- Added `savings` category type to schema + dialog dropdown
- Fixed Plaid post-link flow, added error toasts, removed debug routes
- Migrated from Vue CLI / webpack to **Vite 7**
- Added **helmet**, CORS restriction, rate limiting, MongoDB singleton pool
- Fixed Helmet CSP, MongoDB DNS SRV failure (Node 24 + Windows c-ares issue)
