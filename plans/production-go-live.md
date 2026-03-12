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

- [ ] **Provision Hetzner VPS** — Ubuntu 24.04, SSH key auth (disable password login),
  UFW firewall (allow 22, 80, 443 only), fail2ban.
- [ ] **DNS** — Point domain (e.g. `trybasil.app` or similar) to VPS IP. A record +
  optional www CNAME.
- [ ] **Docker + Docker Compose** — Install on the VPS. Create `docker-compose.yml`
  with three services:
  - `postgres`: Postgres 16 with a mounted volume for data persistence
  - `app`: Express server (builds from repo Dockerfile)
  - `nginx`: Reverse proxy, SSL termination via Let's Encrypt (certbot)
- [ ] **Nginx config** — Proxy `https://yourdomain.com` → `app:3000`. Handle SSL
  cert auto-renewal with certbot.
- [ ] **Deployment pipeline** — How code gets from GitHub to the VPS. Start simple:
  a deploy script that SSHs in, pulls latest, rebuilds the app container, and restarts.
  CI/CD (GitHub Actions) can come later.
- [ ] **Verify Postgres is accessible** — Connect from the app container, run test
  queries. This is the development target for Phase 3.

**Why before migration:** You need a running Postgres to develop against and test the
migration script. Don't write the migration blind.

---

## Phase 3: Database + auth migration _(the critical path — app dev frozen)_

Biggest, riskiest piece. See `plans/database-migration.md` for full schema and
migration script details. Order within the phase matters.

### 3a: Backend — Postgres rewrite
- [ ] **Replace `db/database.js`** — Swap 17 Mongo functions for Postgres equivalents
  (using `pg` or `postgres` npm package). Aggregation pipelines
  (`findMerchantsWithStats`, `deduplicateData`, `findSimilarTransactionGroups`) become
  SQL GROUP BY queries.
- [ ] **Update `api.js` call sites** (~59 calls) — function signatures stay similar.
- [ ] **Update `plaid-api.js`** (5 calls), **`plaidTools.js`** (9 calls),
  **`seedCategories.js`** (3 calls).

### 3b: Backend — Auth rewrite
- [ ] **Implement Google OAuth flow** — Use `passport-google-oauth20` or raw OAuth2.
  Google redirects user to your `/auth/google/callback` endpoint with an auth code,
  backend exchanges it for Google user info, issues a signed JWT.
- [ ] **JWT middleware** — Replace `firebase-admin.auth().verifyIdToken()` with your
  own JWT verification (`jsonwebtoken` package). Sign with a secret stored in `.env`.
- [ ] **Session management** — Decide on token lifetime + refresh strategy. Options:
  short-lived access token (15min) + refresh token (cookie), or longer-lived JWT (7d)
  with re-auth on expiry. For a personal finance app, longer-lived is fine.
- [ ] **Update `getAuthHeaders()` on frontend** — Send your JWT instead of Firebase
  ID token. Same `Authorization: Bearer <token>` pattern.

### 3c: Data migration
- [ ] **Write and test migration script** — Mongo → Postgres, one-time. Run against
  real data. See `plans/database-migration.md` for the script skeleton.
- [ ] **Run migration** — Execute against the production Postgres instance.

### 3d: Frontend auth swap
- [ ] **Replace Firebase sign-in** — Redirect to Google OAuth consent screen (or popup).
  On callback, store the JWT from your backend.
- [ ] **Remove Firebase SDK** — `firebase`, `firebase/compat/app`, `firebase/compat/auth`,
  `firebase/compat/firestore`. Replace `firebase.js` with a new `auth.js` or `api.js`.
- [ ] **Remove Firestore sessions collection** reference (legacy, unused).
- [ ] **Update env vars** — Remove all `VITE_FIREBASE_*` vars. Add your backend URL
  if needed (or keep relative `/api` paths behind Nginx proxy).

### 3e: Cleanup
- [ ] **Remove old dependencies** — `mongodb`, `firebase`, `firebase-admin`.
- [ ] **Rename `frontend/src/firebase.js`** → `api.js` or `client.js` (it's really
  just API call helpers + auth, not Firebase-specific).
- [ ] **Update seed scripts** for Postgres.
- [ ] **Update admin portal auth** — same JWT flow.
- [ ] **Update tests** — any that mock the DB layer directly.

**Why this sub-order:** Database first (3a) so you can test API routes against the new
DB while auth is still Firebase. Auth second (3b) because it's the most user-visible
change. Data migration (3c) once the backend is ready. Frontend last (3d) because if
the API layer already works, the frontend swap is clean and isolated.

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
  all containers.
- [ ] **End-to-end validation** — Plaid Link → sync → categorize → rules → triage →
  charts → account deletion → error boundary. Everything.
- [ ] **Plaid production credentials** — Switch `PLAID_ENV` from `sandbox` to
  `production`. Verify real bank connections work.
- [ ] **SSL verification** — Confirm HTTPS works, certs auto-renew, HTTP redirects
  to HTTPS.

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

---

## Cost

| Item | Cost |
|------|------|
| Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD) | ~$5/month |
| Domain | ~$10-15/year |
| SSL (Let's Encrypt) | Free |
| **Total** | **~$6/month** |
