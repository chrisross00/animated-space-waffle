# Admin Portal & Test User System

## Status: PLANNING

## Problem
- No way to smoke test different user scenarios without manually creating data
- ApiDir lives inside the main app behind auth — awkward for test user management
  since you need to be logged in as a user to manage users
- Dev auth bypass (`DEV_AUTH_BYPASS_UID`) requires editing `.env` and restarting
  the server to switch between test users
- No way to blow away test data without touching real user data

## Vision
A separate admin app (`admin.basil.com` in production, `localhost:8081` in dev)
that owns all administrative and developer tooling. Environment-appropriate
features: test user seeding is dev/staging only; user lookup, data inspection,
and support tools exist in all environments.

The admin portal replaces:
- ApiDir in the main app (tools migrate to admin portal)
- Dev auth bypass button on the main app login screen
- Manual `.env` editing to switch test users

## Test User Personas

Five personas covering the primary smoke test scenarios:

### 1. Fresh (`test-user-fresh`)
- **Not onboarded** — no `onboarded_at`
- No linked accounts, no transactions, no categories, no rules
- **Tests:** onboarding flow, all empty states

### 2. Just Connected (`test-user-connected`)
- Onboarded, one bank account (checking)
- ~30 transactions (1 month), default categories seeded, no rules
- Mix of clean merchants and a few ambiguous names
- **Tests:** day-1 experience, first rule creation, sort transactions triage

### 3. Active (`test-user-active`)
- Onboarded, 3 accounts (checking, credit card, savings)
- ~6 months of transactions (~500-600 total)
- Customized categories with budget limits, savings-type category
- Mix of merchant rules (5-8) and compound rules (3-5)
- Some `manually_set` transactions
- Recurring merchants (rent, subscriptions, utilities)
- **Tests:** main dashboard, trends charts, rule management, projections,
  recurring detection, merchant browser

### 4. P2P Heavy (`test-user-p2p`)
- Onboarded, 2 accounts (checking, credit card)
- ~4 months of transactions
- High proportion of Venmo/Zelle/Cash App transactions (null merchants,
  generic names like "VENMO", "ZELLE PAYMENT")
- Some enriched with Venmo CSV data (counterparty names, notes)
- Few rules — most P2P transactions uncategorized
- **Tests:** how the app handles low-quality transaction data, merchant browser
  gaps, rule matching on `name` vs `merchant_name`, Venmo import flow

### 5. Rule Heavy (`test-user-rules`)
- Onboarded, 2 accounts
- ~4 months of transactions
- Many compound rules (15-20) with overlapping conditions
- Rules targeting same merchants with different amount ranges
- Some conflicts (multiple rules could match the same transaction)
- **Tests:** rule evaluation priority, RulesView at scale, sweep performance,
  edge cases in condition matching

## Architecture

### Admin portal (frontend)
- Separate Vite app in `admin/` directory
- Own build, own dev server (`localhost:8081`)
- Deployed to `admin.basil.com` (separate subdomain)
- Talks to the same Express backend via `/admin` routes
- Admin-only auth (checks `isAdmin` on user doc)

### Backend routes (`/admin/*`)
New route group in Express, all gated by `requireAdmin`:

- `GET /admin/test-users` — list all users where `isTestUser: true`
- `POST /admin/seed-test-user` — `{ persona }` → wipe & recreate that persona
- `POST /admin/nuke-test-users` — delete all `isTestUser` users + their data
- `POST /admin/login-as` — `{ userId }` → returns a short-lived token or sets
  up auth state that the main app can consume in a new tab

Existing ApiDir tools migrate here over time.

### Test user flag
- `isTestUser: true` on `Basil-Users` document
- All test user UIDs are deterministic (e.g., `test-user-active`)
- Nuke operation queries `{ isTestUser: true }` and deletes from all
  collections: `Basil-Users`, `Plaid-Transactions`, `Plaid-Accounts`,
  `Basil-Categories`, `Basil-Rules`

### "Login as" flow
The admin portal opens the main app in a new tab, authenticated as the
selected user. Implementation options:

- **Option A: Shared token via localStorage.** Admin portal writes a short-lived
  impersonation token to localStorage (same origin or shared domain). Main app
  checks for it on load, consumes it once, and authenticates.
- **Option B: URL token.** Admin portal opens `app.basil.com/?impersonate=<token>`.
  Main app reads the param, exchanges it for a session, and strips the param.
- **Option C: Backend session.** Admin portal calls `/admin/login-as`, backend
  sets a cookie. Next tab opening the main app picks up the cookie.

Decision deferred — depends on how auth works across subdomains. Option B is
simplest for dev (same localhost, different ports). May need to revisit when
the Supabase auth migration happens.

### Environment-specific features
| Feature | Dev/Staging | Production |
|---------|------------|------------|
| Test user seeding | Yes | No |
| Nuke test data | Yes | No |
| Login-as / impersonation | Yes | Admin only (support) |
| User lookup & inspection | Yes | Yes |
| ApiDir tools (dedupe, etc.) | Yes | Yes |

### Dev auth bypass retirement
Once the admin portal's "Login as" flow works, remove from the main app:
- `VITE_DEV_AUTH_BYPASS` env var
- "Login as test user" button on ProfileView
- `Bearer dev-bypass` token handling on backend
- `DEV_AUTH_BYPASS_UID` env var

The admin portal fully replaces this functionality with a better UX.

## Seed Data Design

Each persona's seed script generates deterministic, realistic data:

### Shared building blocks
- **Merchants:** pool of realistic merchant names per category (groceries,
  dining, gas, subscriptions, etc.) with realistic amount ranges
- **Accounts:** templates for checking, credit card, savings with institution
  names
- **Categories:** default seed set + customizations per persona
- **Recurring patterns:** monthly merchants (rent, Netflix, gym) with
  consistent amounts and dates

### Seed script
```
node scripts/seed-test-user.js --persona=active
node scripts/seed-test-user.js --persona=all    # seed all personas
```

Idempotent: deletes all data for the target UID(s) first, then inserts fresh.
Reusable merchant/transaction generators shared across personas.

## Implementation Phases

### Phase 1: Test user seed script (CLI only)
- Seed data generators (merchants, transactions, accounts, categories, rules)
- Persona definitions with deterministic UIDs
- `isTestUser` flag on user docs
- CLI: `node scripts/seed-test-user.js --persona=<name|all>`
- Nuke script: `node scripts/nuke-test-users.js`

### Phase 2: Admin backend routes
- `/admin` route group with `requireAdmin` middleware
- Seed and nuke endpoints wrapping the Phase 1 logic
- Test user list endpoint
- Migrate existing ApiDir routes to `/admin`

### Phase 3: Admin portal frontend
- Vite app scaffolding in `admin/`
- Admin auth (login with Google, check `isAdmin`)
- Test user management UI (seed, nuke, list)
- Migrated ApiDir tools

### Phase 4: Login-as flow
- Impersonation mechanism (token handoff to main app)
- Remove dev auth bypass from main app
- Persona picker in admin portal → opens main app as that user

## Decisions (resolved)
- **Admin portal auth:** Reuse Firebase Google Auth + `isAdmin` check. Same
  auth system, backend already has `requireAdmin`. Moves to Supabase Auth
  together with the main app when that migration happens.
- **Subdomain routing:** Don't overthink until Phase 3. In dev, second Vite
  dev server on a different port. In production, same Express server can serve
  admin build at `/admin` path with a reverse proxy / DNS alias for the
  subdomain, or separate deployment depending on hosting setup.
- **Transaction IDs:** Simplified synthetic IDs (`test-txn-active-001`, etc.).
  Nothing validates Plaid ID format, unique is all that matters. Easier to
  identify test data at a glance.
- **Seed data approach:** Hybrid. Fixed/hand-authored for structural data
  (specific merchants, account names, category assignments, rules) so smoke
  tests can rely on known fixtures. Procedural with seeded RNG for volume
  (amounts, dates, merchant distribution across months) — deterministic but
  doesn't require hand-authoring hundreds of transactions.
