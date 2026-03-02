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
| `frontend/src/views/ProfileView.vue` | Auth (Google sign-in) + linked accounts |
| `frontend/src/views/ApiDir.vue` | Admin toolbox (dedupe, seed, map unmapped, etc.) |
| `frontend/src/components/DialogComponent.vue` | Edit transaction / category dialog |
| `frontend/src/components/PlaidLinkHandler.vue` | Plaid Link iframe component |
| `frontend/src/store/index.js` | Vuex store (user, session, transactions, categories) |
| `frontend/src/firebase.js` | All fetch calls to backend API + Firebase auth helpers |
| `categoryMapping.js` | Transaction categorization rule engine |

## Architecture notes
- **Auth:** Firebase ID token sent as `Authorization: Bearer <token>` header on every
  backend request. Backend verifies with `firebase-admin`.
- **MongoDB collections:** `Basil-Users`, `Plaid-Transactions`, `Plaid-Accounts`,
  `Basil-Categories`
- **DNS fix:** `index.js` sets `dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4'])`
  at startup — required on Node 24 + Windows because c-ares uses TCP for SRV queries
  and home routers only support DNS over UDP.
- **Env vars:** Root `.env` uses `VUE_APP_FIREBASE_*` (consumed by `index.js` backend).
  `frontend/.env` uses `VITE_FIREBASE_*` (consumed by Vite build).

## What works end-to-end
- Google Sign-In → Plaid bank link → transaction sync → budget dashboard
- Transaction editing (category, date, note, exclude from total)
- Auto-learn rules: recategorize once → all matching transactions updated
- Category management (add, edit budget limit, Plaid PFC mapping)
- Bulk categorization in table view
- Admin toolbox: dedupe, seed categories, clean pending, map unmapped

## Known gaps / things to build next

### High priority — all done ✓
- [x] Plaid post-link flow (auth header, await addInstitution, handlePlaidSuccess refresh)
- [x] Error toasts (Quasar Notify plugin + firebase.js)
- [x] Remove unauthenticated `/getnew` route
- [x] Remove 5 debug routes + delete their .vue files
- [x] Category name persistence — uncommented `$set: { category }`, added transaction
      bulk rename, enabled the name input in DialogComponent, store mirrors the rename.

### Medium priority
- [ ] **Transaction search/filter** — search by name/merchant, filter by date range
      or amount range.
- [ ] **Rules management UI** — view and delete saved auto-learn rules without having
      to re-edit a transaction.
- [ ] **Spending trend chart** — month-over-month spending by category (Quasar has
      ECharts integration).
- [ ] **Fix PlaidLinkHandler app name** — "Your App Name" is hardcoded on line 31 of
      PlaidLinkHandler.vue.

### Larger features
- [ ] **Onboarding wizard** — connect account → seed categories → set budgets in one
      guided flow.
- [ ] **Export to CSV** — export transactions for a given month/range.
- [ ] **Budget forecast** — project end-of-month spend based on rate so far.
- [ ] **Recurring transaction detection** — flag transactions that appear every month.
- [ ] **Notification / alerts** — warn when a category approaches its budget limit.

## Recent history (for context)
- Fixed Plaid post-link flow: auth header on create_link_token, await addInstitution,
  handlePlaidSuccess now refreshes accounts + syncs transactions
- Added Quasar Notify error toasts across all firebase.js API calls
- Removed unauthenticated /getnew route and 5 debug-only views/routes
- Migrated from Vue CLI / webpack to **Vite 7** — eliminated all npm vulnerabilities
- Fixed all high/medium priority bugs: auth field (`user_id` → `uid`), unawaited
  promises, dead endpoints, session field typo, missing response.ok checks
- Added **helmet**, CORS restriction to localhost, rate limiting (200 req/15 min)
- Refactored MongoDB to **singleton connection pool** (was per-operation open/close)
- Fixed Helmet CSP (was blocking Google Fonts and Plaid CDN)
- Restored Quasar CSS import that was accidentally dropped during Vite migration
- Fixed MongoDB DNS SRV failure (Node 24 + Windows c-ares TCP issue)
