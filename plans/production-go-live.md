# Production Go-Live Plan

Master plan for taking the app from dev to production. Phases are ordered by
engineering dependencies — each phase builds on what came before. Tasks within
a phase are independent unless noted.

**Key constraint:** App development is effectively frozen during Phase 3 (database
migration). Phases 0–2 and 4–6 can coexist with normal feature work.

**Infrastructure decision:** Self-hosted on a single Hetzner VPS with no third-party
platform dependencies (no Supabase, no Firebase in production). Postgres runs as a
Docker container on the same VPS. Auth is Google OAuth with self-issued JWTs. This
gives users the strongest possible data privacy — their financial data never leaves
infrastructure we control.

**Related docs:**
- `plans/production-checklist.md` — original blockers list (superseded by this doc)
- `plans/database-migration.md` — Postgres schema, migration script, effort estimate

---

## Phase 0: Quick fixes _(no dependencies, reduce surface area)_

Small, independent changes on the current Mongo stack. De-risk everything that follows.

- [x] **Strip sensitive console.logs** — `frontend/src/firebase.js` leaks auth objects
  and Plaid public tokens (lines 166, 184-186, 209, 213, 227). Remove or replace with
  non-sensitive messages.
- [x] **Body parser limit** — Add `{ limit: '1mb' }` to `bodyParser.json()` in `api.js`
  and `plaid-api.js`. Prevents unbounded request bodies.
- [x] **Vue error boundary** — Add `app.config.errorHandler` in `main.js` with a
  "Something went wrong — reload" fallback UI. Must be in place before the migration
  starts breaking things.

---

## Phase 1: Stack-agnostic features _(still on MongoDB)_

These touch the API contract but work identically on Mongo or Postgres. Ship them now
so they're not part of the migration diff.

- [x] **Account deletion** — "Delete my account" button in ProfileView. Calls existing
  `POST /api/nukeAllData` scoped to the authenticated user, signs out after. Needs
  confirmation dialog.
- [x] **Privacy policy** — `/privacy` route with a real policy page. Required by Plaid
  for production API access. Doesn't need to be lawyer-written for initial launch.

---

## Phase 2: Infrastructure _(Hetzner VPS setup)_

The foundation everything else deploys to. The migration targets this infrastructure,
so it must exist first.

**Stack:** Hetzner CX22 (~$5/month) running Docker Compose with three containers:
Postgres 16, Express app, and Nginx (reverse proxy + SSL).

- [x] **Provision Hetzner VPS** — Ubuntu 24.04, SSH key auth (password login disabled),
  UFW firewall (22, 80, 443 only), fail2ban. IP: `178.156.248.108`.
- [x] **DNS** — `basilbudgeting.com` + `www` → VPS IP via Cloudflare DNS.
- [x] **Docker + Docker Compose** — Postgres 16 running in Docker container with
  persistent volume. Config at `/opt/basil/docker-compose.yml`.
- [x] **Nginx + SSL** — Reverse proxy to `localhost:3000`, Let's Encrypt cert with
  auto-renewal. HTTP → HTTPS redirect enabled.
- [x] **Node.js + PM2** — Node 24 + PM2 process manager (auto-restart, survives reboot).
  App at `/opt/basil/app`.
- [x] **CI/CD pipeline** — GitHub Actions: push to main → run tests → SSH deploy →
  pull, install, build frontend, restart PM2. Workflow: `.github/workflows/deploy.yml`.
- [x] **Verify Postgres is accessible** — Running and accepting connections on
  `127.0.0.1:5432`. Credentials in `/opt/basil/.env`.

**Why before migration:** You need a running Postgres to develop against and test the
migration script. Don't write the migration blind.

---

## Phase 3: Database + auth migration _(the critical path — app dev frozen)_

Biggest, riskiest piece. See `plans/database-migration.md` for full schema and
migration script details. Order within the phase matters.

### 3a: Backend — Postgres rewrite
- [x] **Replace `db/database.js`** — 22 Mongo functions replaced with 50+ Postgres
  equivalents using `pg` pool. Domain-specific functions (users, categories, transactions,
  plaid items, rules) with API-compatible return shapes (column aliases preserve
  camelCase property names). `conditionsToSqlWhere` replaces `conditionsToMongoFilter`.
  `sweepTransactionsByConditions` replaces inline sweep logic.
- [x] **Update `api.js` call sites** (~59 calls) — all `ObjectID`, `$set`/`$unset`/
  `$pull`/`$addToSet` operators removed. New functions: `updateTransaction`,
  `updateTransactionsBulk`, `renameTransactionCategory`, `removePfcFromOtherCategories`,
  `addSimpleRule`/`removeSimpleRule`, `nukeAllUserData`, etc.
- [x] **Update `plaid-api.js`** (8 calls) — nested `Accounts` document replaced with
  flat `plaid_items` table. `findPlaidItemByInstitution`, `insertPlaidItem`,
  `updatePlaidItem`, `deletePlaidItem`.
- [x] **Update `plaidTools.js`** (12 calls) — `getAccountData` reads flat items array,
  `fetchAndStoreBalances` uses `updatePlaidAccountBalances` + `insertBalanceSnapshot`,
  `getCachedBalances` reads from `plaid_accounts` table.
- [x] **Update `seedCategories.js`** (3 calls), **`admin-api.js`** (5 calls).
- [x] **Schema migration SQL** — `db/migrations/002-schema-additions.sql` adds missing
  columns (users.name/picture/onboarded_at/last_synced_at, plaid_items.error_message/
  error_detected_at/prev_cursor, dismissed_relationship → TIMESTAMPTZ) and new
  `balance_snapshots` table.
- [x] **Rewrite `scripts/test-data/seed.js`** — converted from MongoDB `db.collection()`
  to `pg` pool queries. Updated `generators.js` (`generateAccounts` returns flat items
  array), `seed-test-user.js`, and `nuke-test-users.js` CLI scripts.

### 3a-verify: Local Postgres testing
- [x] **Set up local Postgres** — Homebrew PostgreSQL 16, `basil` database.
- [x] **Add `DATABASE_URL`** to root `.env`.
- [x] **Start app locally** and test API endpoints: getOrAddUser, getcategories,
  transactions (month + search), rules, merchantStats, historicalCategoryMap,
  handleDialogSubmit (transaction + merchant sweep + category CRUD), saveCompoundRule
  (+ sweep), deleteCompoundRule, bulkCategorize, nukeAllData.
- [x] **Fix runtime issues** — `Date.now()` → `new Date()` in `saveCompoundRule`
  (api.js) and compound rule generator (generators.js). Postgres TIMESTAMPTZ rejects
  raw millisecond timestamps.
- [x] **Unit tests for SQL helpers** — `buildSetClause` and `conditionsToSqlWhere`
  (23 tests in `__tests__/database.test.js`).
- [x] **Run schema migration on Hetzner** — `001-initial-schema.sql` executed on
  production Postgres. Also applied column additions (last_synced_at, is_test_user,
  plaid_items error columns, renamed credit_limit → "limit").
- [ ] **Integration tests against real Postgres** (future) — test DB setup/teardown in
  CI. Covers real SQL execution, type coercion, constraints. Not blocking for go-live.

### 3b: Backend — Auth rewrite
- [x] **Implement Google OAuth flow** — Raw OAuth2 redirect (no passport). `auth-routes.js`
  handles `GET /auth/google` (redirect to Google) and `GET /auth/google/callback` (exchange
  code → upsert user → sign JWT → redirect to `/?token=<jwt>`). CSRF state tokens in memory.
- [x] **JWT middleware** — `utils/authentication.js` rewritten: `jsonwebtoken.verify()`
  replaces `firebase-admin.auth().verifyIdToken()`. 7-day JWT signed with `JWT_SECRET`.
  Dev-bypass and impersonation token paths unchanged.
- [x] **User ID continuity** — OAuth callback looks up user by email first. Existing users
  keep their Firebase UID. New users get Google `sub` as their ID.
- [x] **SPA fallback route** — `index.js` now serves `index.html` for all unmatched routes
  so Vue Router handles client-side navigation.

### 3b-verify: Auth testing
- [x] **Dev-bypass auth** — returns user data
- [x] **JWT auth** — signs token, fetches categories for test user
- [x] **Invalid/expired JWT** — returns 401 (fixed hanging request bug in getOrAddUser)
- [x] **OAuth redirect** — 302 to Google with correct params
- [x] **Google OAuth credentials** — configured in Google Cloud Console and Hetzner .env.
  Full end-to-end flow working: sign in → Google → callback → JWT → app loads.

### 3c: Data migration
- [x] **Write and test migration script** — `scripts/migrate-mongo-to-postgres.js`.
  Connects to MongoDB Atlas via `DB_URI`, writes to Hetzner Postgres via SSH tunnel
  (port 15432). Handles all transformations: nested Accounts → flat plaid_items/accounts,
  embedded rules → simple_rules rows, millisecond timestamps → Date objects, boolean
  dismissed_relationship → TIMESTAMPTZ. Dry-run mode with `--dry-run`. Idempotent via
  `ON CONFLICT`.
- [x] **Run migration** — 10 users, 113 categories, 16 simple rules, 31 plaid items,
  37 accounts, 24 balance snapshots, 2113 transactions, 26 compound rules migrated
  to production Postgres.

### 3d + 3e: Frontend auth swap + cleanup (done alongside 3b)
- [x] **Replace Firebase sign-in** — `signInWithGoogle()` is now
  `window.location.href = '/auth/google'`. OAuth callback redirects back with JWT.
- [x] **Remove Firebase SDK** — `firebase`, `firebase/compat/app`, `firebase/compat/auth`,
  `firebase/compat/firestore` all uninstalled. `firebase.js` renamed to `api.js`.
- [x] **Frontend `getAuthHeaders()`** — now synchronous, reads JWT from sessionStorage.
  `authReady` promise removed (no longer needed). `ensureAppData` simplified.
- [x] **`main.js` rewritten** — `consumeAuthToken()` reads `?token=` from URL on boot,
  `hydrateAuth()` restores session from sessionStorage. No `onAuthStateChanged`.
- [x] **Delete `session.js`** — legacy Firestore sessions module, unused.
- [x] **Update all imports** — 14 files changed from `@/firebase` to `@/api`.
- [x] **Update env vars** — removed all `VITE_FIREBASE_*` from frontend + admin `.env`.
  Removed `FIREBASE_SERVICE_ACCOUNT_JSON` from backend `.env`.
- [x] **Remove old dependencies** — `mongodb`, `firebase`, `firebase-admin` all removed.
- [x] **Admin portal auth** — `admin/src/auth.js` rewritten: `signInWithGoogle()` redirects
  to `/auth/google?redirect=/admin`, `getAuthHeaders()` reads from sessionStorage.
  `admin/src/App.vue` uses token-based state check instead of `onAuthStateChanged`.

---

## Phase 4: Error logging _(after infrastructure exists)_

- [x] **Set up Sentry** — `@sentry/node` (backend) + `@sentry/vue` (frontend) installed.
  Backend: initialized in `index.js` before Express, error handler after routes.
  Frontend: initialized in `main.js` with `browserTracingIntegration` + router, Vue
  `errorHandler` forwards to Sentry. CSP updated to allow `*.sentry.io`. Both gated
  by env vars (`SENTRY_DSN` backend, `VITE_SENTRY_DSN` frontend) — no-ops if unset.
- [x] **Create Sentry project + set DSN** — Sentry project created, DSN set in both
  `/opt/basil/app/.env` and `frontend/.env.production`.

**Why here:** Sentry config is environment-specific. Set it up on the real production
stack, not before it exists. But it must be live before real users touch the app.

---

## Phase 5: Deploy + validate

- [x] **Full deployment to Hetzner** — CI/CD pipeline deploys on push to main.
  App .env at `/opt/basil/app/.env` with all production vars (JWT, Google OAuth,
  Postgres, Plaid, Sentry, CORS). PM2 manages the process.
- [ ] **End-to-end validation** — Still need full walkthrough: Plaid Link → sync →
  categorize → rules → triage → charts → account deletion → error boundary.
- [x] **Plaid production credentials** — `PLAID_ENV=production` with production
  client ID and secret in Hetzner .env. Sandbox credentials also present for test users.
- [x] **SSL verification** — HTTPS returns 200, HTTP redirects 301 → HTTPS.
  Let's Encrypt cert via Nginx. CSP headers include Sentry ingest domain.
- [x] **Google OAuth redirect URI** — configured in Google Cloud Console. OAuth flow
  working end-to-end in production.

---

## Phase 6: Polish _(after stable, before inviting users)_

These improve the experience but aren't blockers for go-live.

- [ ] **CSV export** — Trust signal ("you can get your data out"). Low effort.
- [ ] **Onboarding v2** — Budget setup wizard after account connection. Matters when
  new users arrive. Full plan in `plans/onboarding-v2.md`.
- [ ] **Last synced indicator** — "Last synced 2 hours ago" near the sync button.
  `lastSyncedAt` already tracked in store, just not rendered.
- [ ] **Post-sync notification** — Toast showing "12 new transactions" after sync.

---

## Already done _(pre-production ready)_

- [x] Plaid reconnect flow (error detection + update link token)
- [x] Sync failure visibility (error toast + warning badge)
- [x] Rate limiting (global 200/15min, stricter 10/5min on sync)
- [x] CORS + CSP (Helmet + origin whitelist)
- [x] Auth security (Bearer token, JWT verification)
- [x] Nginx gzip compression + static asset cache headers
- [x] PWA manifest + iOS home screen support
- [x] Post-login redirect fix (auth hydration race condition)
- [x] Plaid Link CSP fix (frame-src + connect-src for *.plaid.com)
- [x] Non-admin users get production Plaid credentials in production
- [x] Tech debt cleanup (see `plans/production-tech-debt.md`)
- [x] Input validation (string limits, ObjectID validation, regex escaping, injection prevention)
- [x] `.DS_Store` cleanup + `.gitignore` update
- [x] Stale branches + stashes cleaned up

---

## Cost

| Item | Cost |
|------|------|
| Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD) | ~$5/month |
| Domain | ~$10-15/year |
| SSL (Let's Encrypt) | Free |
| **Total** | **~$6/month** |
