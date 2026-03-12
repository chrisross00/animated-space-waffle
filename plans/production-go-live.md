# Production Go-Live Plan

Master plan for taking the app from dev to production. Phases are ordered by
engineering dependencies — each phase builds on what came before. Tasks within
a phase are independent unless noted.

**Key constraint:** App development is effectively frozen during Phase 3 (database
migration). Phases 0–2 and 4–6 can coexist with normal feature work.

**Related docs:**
- `plans/production-checklist.md` — original blockers list (superseded by this doc)
- `plans/database-migration.md` — detailed Postgres schema, migration script, effort estimate

---

## Phase 0: Quick fixes _(no dependencies, reduce surface area)_

Small, independent changes on the current Mongo stack. De-risk everything that follows.

- [ ] **Strip sensitive console.logs** — `frontend/src/firebase.js` leaks auth objects
  and Plaid public tokens (lines 166, 184-186, 209, 213, 227). Remove or replace with
  non-sensitive messages.
- [ ] **Body parser limit** — Add `{ limit: '1mb' }` to `bodyParser.json()` in `api.js`
  and `plaid-api.js`. Prevents unbounded request bodies.
- [ ] **Vue error boundary** — Add `app.config.errorHandler` in `main.js` with a
  "Something went wrong — reload" fallback UI. Must be in place before the migration
  starts breaking things.

**Why first:** Zero risk, fast to ship, and the error boundary protects you during
the disruptive work ahead.

---

## Phase 1: Stack-agnostic features _(still on MongoDB)_

These touch the API contract but work identically on Mongo or Postgres. Ship them now
so they're not part of the migration diff.

- [ ] **Account deletion** — "Delete my account" button in ProfileView. Calls existing
  `POST /api/nukeAllData` scoped to the authenticated user, signs out after. Needs
  confirmation dialog.
- [ ] **Privacy policy** — `/privacy` route with a real policy page. Required by Plaid
  for production API access. Doesn't need to be lawyer-written for initial launch.

**Why before migration:** Isolate variables. Debug new features on the database you
know, not the one you just migrated to.

---

## Phase 2: Infrastructure _(Hetzner VPS setup)_

The foundation everything else deploys to. The migration targets this infrastructure,
so it must exist first.

- [ ] **Provision Hetzner VPS** — OS, SSH keys, firewall, DNS pointing to the VPS.
- [ ] **Docker Compose with self-hosted Supabase** — Postgres + GoTrue + Studio +
  PostgREST running and accessible. This is the development target for Phase 3.
- [ ] **Google OAuth in GoTrue** — Same Google Cloud project, new redirect URI. Verify
  sign-in works against GoTrue before touching app code.
- [ ] **Deployment pipeline** — How the app gets built and deployed to the VPS. Could be
  as simple as a deploy script that SSHs in, pulls, builds, and restarts — or a basic
  CI/CD workflow. Decide and set up before Phase 3 so you're not debugging deployment
  and migration simultaneously.

**Why before migration:** You need a running Postgres to develop against and test the
migration script. Don't write the migration blind.

---

## Phase 3: Database migration _(the critical path — app dev frozen)_

Biggest, riskiest piece. See `plans/database-migration.md` for full schema and
migration script details. Order within the phase matters.

### 3a: Backend rewrite
- [ ] **Replace `db/database.js`** — Swap 17 Mongo functions for Postgres equivalents.
  This is the bulk of the work. Aggregation pipelines (`findMerchantsWithStats`,
  `deduplicateData`, `findSimilarTransactionGroups`) become SQL GROUP BY queries.
- [ ] **Update `api.js` call sites** (~59 calls) — function signatures stay similar.
- [ ] **Update `plaid-api.js`** (5 calls), **`plaidTools.js`** (9 calls),
  **`seedCategories.js`** (3 calls).
- [ ] **Enable RLS policies** — Remove manual `userId` filtering from all queries.

### 3b: Data migration
- [ ] **Write and test migration script** — Mongo → Postgres, one-time. Run against
  real data. See `plans/database-migration.md` for the script skeleton.
- [ ] **Run migration** — Execute against the production Postgres instance.

### 3c: Frontend auth swap
- [ ] **Replace `firebase.js` auth** — Swap Firebase auth for Supabase
  `signInWithOAuth({ provider: 'google' })`.
- [ ] **Replace Bearer token handling** — Supabase JWT instead of Firebase ID token.
- [ ] **Update env vars** — `VITE_FIREBASE_*` → `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_ANON_KEY` (frontend); `VUE_APP_FIREBASE_*` → `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` (backend).
- [ ] **Remove Firestore sessions collection** reference (legacy, unused).

### 3d: Cleanup
- [ ] **Remove old dependencies** — `mongodb`, `firebase`, `firebase-admin`.
- [ ] **Rename `firebase.js` → `supabase.js`** (or similar).
- [ ] **Update seed scripts** for Postgres.
- [ ] **Update admin portal auth**.
- [ ] **Update tests** — any that mock the DB layer directly.

**Why this sub-order:** Backend first so you can test API routes with curl/Postman
against the new DB before touching the frontend. Auth swap last because it's the most
user-visible change — if the API layer already works on Postgres, the auth swap is
clean and isolated.

---

## Phase 4: Error logging _(after infrastructure exists)_

- [ ] **Set up Sentry** (or equivalent) — needs the production URL, environment, and
  source maps. Free tier is fine. Especially important with Plaid where failures are
  silent and intermittent.

**Why here:** Sentry config is environment-specific. Set it up on the real production
stack, not before it exists. But it must be live before real users touch the app.

---

## Phase 5: Deploy + validate

- [ ] **Full deployment to Hetzner** — Build frontend, configure env vars, start
  services.
- [ ] **End-to-end validation** — Plaid Link → sync → categorize → rules → triage →
  charts → account deletion → error boundary. Everything.
- [ ] **Plaid production credentials** — Switch `PLAID_ENV` from `sandbox` to
  `production`. Verify real bank connections work.

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
- [x] Auth security (Bearer token, Firebase admin verification)
- [x] Input validation (string limits, ObjectID validation, regex escaping, injection prevention)
- [x] `.DS_Store` cleanup + `.gitignore` update
- [x] Stale branches + stashes cleaned up
