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
- [ ] **Rules management UI** — see plan below (IN PROGRESS).
- [ ] **Spending trend chart** — month-over-month spending by category (Quasar has
      ECharts integration).
- [x] Fix PlaidLinkHandler app name (now "Basil Budgeting")

---

## Plan: Rules Management UI

### Goal
Let the user see and delete auto-learn rules from the **Edit Category dialog**,
without having to re-edit a transaction.

### What rules look like in MongoDB
Each category doc has a `rules` object. Only `merchant_name` and `name` are created
by auto-learn (the others are legacy). UI should show only those two.
```json
{ "rules": { "merchant_name": ["Uber"], "name": ["Specific Txn Name"] } }
```

### Architecture decision
Rules display lives inside the **existing Edit Category dialog** (DialogComponent).
The dialog already knows the category. Rules are shown as deletable chips.
Deletion does NOT retroactively re-categorize existing transactions — only future
syncs are affected (consistent with how rule creation works).

### Data flow
1. `BudgetView.groupTransactions()` — add `rules` to each category's entry
2. `BudgetView.buildEditCategoryDialog()` — pass `rules` in `currentCategoryDetails`
3. `DialogComponent` — show `merchant_name` and `name` rules as chips with × buttons;
   clicking × emits `delete-rule` with `{ ruleType, ruleValue }`
4. `BudgetView` handles `@delete-rule` → calls `deleteRule()` from firebase →
   on success, mutates `dialogBody.currentCategoryDetails.rules` in place so the
   dialog re-renders without closing, then commits `updateCategoryRules` to store
5. `store.js` — new `updateCategoryRules` mutation: `{ categoryId, ruleType, ruleValue }`
   does a `$pull`-equivalent on `state.categories`

### Changes required

| File | Change |
|------|--------|
| `api.js` | New `POST /api/deleteRule` — validates auth, `$pull` rule value from category |
| `firebase.js` | New `deleteRule(categoryId, ruleType, ruleValue)` |
| `BudgetView.vue` | Pass `rules` through `groupTransactions` + `buildEditCategoryDialog`; handle `@delete-rule` |
| `DialogComponent.vue` | Add rules chips section in `editCategory` form; emit `delete-rule` |
| `store.js` | New `updateCategoryRules` mutation |

### Key constraint
`DialogComponent.data()` is only evaluated once on mount, so `dialogBody` won't
react to prop changes. The rules section must read from `item.rules` (the prop)
directly, not from `dialogBody`, so Vue's reactivity keeps it live as the parent
mutates `currentCategoryDetails.rules`.

---

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
