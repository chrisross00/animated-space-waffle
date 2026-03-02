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
- Admin toolbox: dedupe, seed categories, clean pending, map unmapped

---

## Things to build next

### High value
- [ ] **Recurring transaction detection** — flag transactions that appear monthly.
      Unlocks meaningful budget forecasting (otherwise it's just linear extrapolation).
- [ ] **Budget forecast** — project end-of-month spend. Depends on recurring detection
      to be useful.

### Medium
- [ ] **Export to CSV** — low effort, occasionally very useful (taxes, sharing).
- [ ] **Spending trend chart: legend improvement** — current ECharts scroll legend
      is awkward on mobile. Consider wrapping HTML legend below chart.
- [ ] **Notification / alerts** — warn when a category approaches its budget limit.
      Needs a delivery mechanism decision (in-app banner vs email).

### Maybe / future
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

## Recent history (for context)
- Built Merchant Browser, rules management iterations 1–3, transaction search/filter
- Built TrendsView with 4 chart tabs (Spending, Cash Flow, Cumulative, Savings)
- Added `savings` category type to schema + dialog dropdown
- Fixed Plaid post-link flow, added error toasts, removed debug routes
- Migrated from Vue CLI / webpack to **Vite 7**
- Added **helmet**, CORS restriction, rate limiting, MongoDB singleton pool
- Fixed Helmet CSP, MongoDB DNS SRV failure (Node 24 + Windows c-ares issue)
